"""CineLab vision worker.

Tasks:
  matte-image     RVM single image -> transparent PNG
  layer-split     RVM foreground + LaMa background -> two PNGs
  inpaint-image   LaMa masked image repair
  outpaint-image  LaMa image expansion
  matte-video     RVM video -> transparent WebM
  repair-video    LaMa per-frame region repair -> MP4

The worker reuses the PyTorch environment shipped with the depth runtime.
All paths are UTF-8 and image IO uses imdecode/imencode so Chinese paths work.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Iterator, Optional

import cv2
import numpy as np
import torch

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "inspyrenet"))

from transparent_background.InSPyReNet import InSPyReNet_SwinB  # noqa: E402

MAX_IMAGE_EDGE = 1280
MAX_VIDEO_EDGE = 480
MAX_VIDEO_SECONDS = 10.0


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def progress(percent: float, message: str) -> None:
    emit({"stage": "progress", "percent": max(0.0, min(100.0, percent)), "message": message})


def read_image(path: str, flags: int = cv2.IMREAD_COLOR) -> np.ndarray:
    data = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(data, flags)
    if image is None:
        raise RuntimeError(f"无法读取图片：{path}")
    return image


def write_image(path: str, image: np.ndarray) -> None:
    ext = os.path.splitext(path)[1] or ".png"
    ok, data = cv2.imencode(ext, image)
    if not ok:
        raise RuntimeError(f"无法编码图片：{path}")
    data.tofile(path)


def read_mask(path: str) -> np.ndarray:
    mask = read_image(path, cv2.IMREAD_UNCHANGED)
    if mask.ndim == 3:
        mask = mask[:, :, 3] if mask.shape[2] == 4 else cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    return (mask > 127).astype(np.uint8) * 255


def resize_max(image: np.ndarray, max_edge: int) -> tuple[np.ndarray, float]:
    h, w = image.shape[:2]
    scale = min(1.0, max_edge / max(h, w))
    if scale >= 1.0:
        return image, 1.0
    resized = cv2.resize(
        image,
        (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


class Vision:
    def __init__(self, models_dir: str) -> None:
        self.models_dir = models_dir
        self._inspyrenet = None
        self._lama = None

    def inspyrenet(self):
        if self._inspyrenet is None:
            progress(2, "加载抠像模型")
            model = InSPyReNet_SwinB(
                depth=64,
                pretrained=False,
                threshold=None,
                base_size=[384, 384],
            ).eval()
            state = torch.load(
                os.path.join(self.models_dir, "ckpt_fast.pth"),
                map_location="cpu",
                weights_only=True,
            )
            model.load_state_dict(state, strict=True)
            self._inspyrenet = model
        return self._inspyrenet

    def lama(self):
        if self._lama is None:
            progress(2, "加载修复模型")
            model = torch.jit.load(
                os.path.join(self.models_dir, "big-lama.pt"), map_location="cpu"
            )
            model.eval()
            self._lama = model
        return self._lama


def saliency_alpha(vision: Vision, image_bgr: np.ndarray) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (384, 384), interpolation=cv2.INTER_AREA)
    tensor = (
        torch.from_numpy(resized).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    )
    mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
    tensor = (tensor - mean) / std

    with torch.no_grad():
        pred = vision.inspyrenet()(tensor)

    pred = torch.nn.functional.interpolate(
        pred, (h, w), mode="bilinear", align_corners=True
    )
    return np.clip(pred[0, 0].numpy(), 0.0, 1.0)


def lama_inpaint(vision: Vision, image_bgr: np.ndarray, mask_u8: np.ndarray) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    scale = min(1.0, MAX_IMAGE_EDGE / max(h, w))
    if scale < 1.0:
        image = cv2.resize(image_bgr, (max(8, int(w * scale)), max(8, int(h * scale))))
        mask = cv2.resize(mask_u8, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)
    else:
        image = image_bgr
        mask = mask_u8

    h, w = image.shape[:2]
    pad_h = (8 - h % 8) % 8
    pad_w = (8 - w % 8) % 8
    if pad_h or pad_w:
        image = cv2.copyMakeBorder(image, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT_101)
        mask = cv2.copyMakeBorder(mask, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0)

    image_t = (
        torch.from_numpy(image[:, :, ::-1].copy())
        .permute(2, 0, 1)
        .unsqueeze(0)
        .float()
        / 255.0
    )
    mask_t = torch.from_numpy((mask > 127).astype(np.float32)).unsqueeze(0).unsqueeze(0)

    with torch.no_grad():
        output = vision.lama()(image_t, mask_t)

    result = (
        output[0].permute(1, 2, 0).clamp(0, 1).mul(255).byte().numpy()[:, :, ::-1].copy()
    )
    result = result[:h, :w]
    if scale < 1.0:
        result = cv2.resize(result, (w_original := image_bgr.shape[1], image_bgr.shape[0]))
    else:
        w_original = w
    return result


def task_matte_image(vision: Vision, args: argparse.Namespace) -> dict:
    image = read_image(args.input)
    h, w = image.shape[:2]
    processed, scale = resize_max(image, MAX_IMAGE_EDGE)
    alpha = saliency_alpha(vision, processed)
    alpha_full = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LINEAR)
    alpha_full = np.clip(alpha_full, 0, 1)

    foreground = image.astype(np.float32) * alpha_full[:, :, None]
    rgba = np.dstack([foreground, alpha_full * 255]).astype(np.uint8)
    write_image(args.output, rgba)
    progress(100, "抠图完成")
    return {"output": args.output, "width": w, "height": h}


def task_layer_split(vision: Vision, args: argparse.Namespace) -> dict:
    image = read_image(args.input)
    h, w = image.shape[:2]
    processed, _ = resize_max(image, MAX_IMAGE_EDGE)
    alpha = saliency_alpha(vision, processed)
    alpha_full = np.clip(cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LINEAR), 0, 1)

    foreground = image.astype(np.float32) * alpha_full[:, :, None]
    rgba = np.dstack([foreground, alpha_full * 255]).astype(np.uint8)
    write_image(args.output, rgba)

    progress(45, "生成背景图层")
    mask = (alpha_full > 0.35).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=1)
    background = lama_inpaint(vision, image, mask)
    if not args.background:
        raise RuntimeError("缺少背景输出路径")
    write_image(args.background, background)
    progress(100, "图层分离完成")
    return {
        "output": args.output,
        "background": args.background,
        "width": w,
        "height": h,
    }


def task_inpaint_image(vision: Vision, args: argparse.Namespace) -> dict:
    image = read_image(args.input)
    if not args.mask:
        raise RuntimeError("缺少蒙版")
    mask = read_mask(args.mask)
    if mask.shape[:2] != image.shape[:2]:
        mask = cv2.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)
    result = lama_inpaint(vision, image, mask)
    write_image(args.output, result)
    progress(100, "修复完成")
    return {"output": args.output, "width": image.shape[1], "height": image.shape[0]}


def task_outpaint_image(vision: Vision, args: argparse.Namespace) -> dict:
    image = read_image(args.input)
    target_w = max(8, int(args.width))
    target_h = max(8, int(args.height))
    h, w = image.shape[:2]
    scale = min(target_w / w, target_h / h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    left = (target_w - new_w) // 2
    top = (target_h - new_h) // 2
    right = target_w - new_w - left
    bottom = target_h - new_h - top

    base = cv2.copyMakeBorder(
        resized, top, bottom, left, right, cv2.BORDER_REFLECT_101
    )
    mask = np.full((target_h, target_w), 255, dtype=np.uint8)
    mask[top : top + new_h, left : left + new_w] = 0

    result = lama_inpaint(vision, base, mask)
    write_image(args.output, result)
    progress(100, "扩图完成")
    return {"output": args.output, "width": target_w, "height": target_h}


def ffmpeg_decode(
    ffmpeg: str, input_path: str, width: int, height: int
) -> Iterator[np.ndarray]:
    command = [
        ffmpeg,
        "-v",
        "error",
        "-i",
        input_path,
        "-an",
        "-vf",
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    frame_size = width * height * 3
    try:
        while True:
            data = process.stdout.read(frame_size)
            if not data or len(data) < frame_size:
                break
            yield np.frombuffer(data, dtype=np.uint8).reshape((height, width, 3)).copy()
    finally:
        process.stdout.close()
        stderr = process.stderr.read().decode("utf-8", errors="replace")
        process.wait()
        if process.returncode != 0 and stderr and "Broken pipe" not in stderr:
            raise RuntimeError(f"ffmpeg 解码失败：{stderr[-600:]}")


def task_matte_video(vision: Vision, args: argparse.Namespace) -> dict:
    if not args.ffmpeg:
        raise RuntimeError("缺少 ffmpeg 路径")
    width = int(args.width)
    height = int(args.height)
    fps = float(args.fps or 24)
    frames = int(args.frames or 0)
    max_frames = int(max(1, round(MAX_VIDEO_SECONDS * fps)))
    if frames <= 0:
        frames = max_frames
    frames = min(frames, max_frames)

    command = [
        args.ffmpeg,
        "-y",
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        f"{width}x{height}",
        "-r",
        str(fps),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuva420p",
        "-b:v",
        "0",
        "-crf",
        "30",
        "-auto-alt-ref",
        "0",
        "-metadata:s:v:0",
        "alpha_mode=1",
        args.output,
    ]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    processed = 0
    previous_alpha = None
    try:
        for frame in ffmpeg_decode(args.ffmpeg, args.input, width, height):
            if processed >= frames:
                break
            alpha = saliency_alpha(vision, frame)
            if previous_alpha is not None:
                alpha = alpha * 0.65 + previous_alpha * 0.35
            previous_alpha = alpha
            rgba = np.dstack(
                [frame.astype(np.float32) * alpha[:, :, None], alpha * 255]
            ).astype(np.uint8)
            encoder.stdin.write(rgba.tobytes())
            processed += 1
            progress(processed / frames * 100, f"抠像 {processed}/{frames} 帧")
    finally:
        if encoder.stdin:
            encoder.stdin.close()
        stderr = encoder.stderr.read().decode("utf-8", errors="replace")
        encoder.wait()
        if encoder.returncode != 0:
            raise RuntimeError(f"ffmpeg 编码失败：{stderr[-600:]}")

    progress(100, "视频抠像完成")
    return {"output": args.output, "frames": processed, "width": width, "height": height}


def task_repair_video(vision: Vision, args: argparse.Namespace) -> dict:
    if not args.ffmpeg:
        raise RuntimeError("缺少 ffmpeg 路径")
    width = int(args.width)
    height = int(args.height)
    fps = float(args.fps or 24)
    frames = min(int(args.frames or 0) or int(MAX_VIDEO_SECONDS * fps), int(MAX_VIDEO_SECONDS * fps))
    x = max(0, min(width - 1, int(args.x)))
    y = max(0, min(height - 1, int(args.y)))
    rect_w = max(2, min(width - x, int(args.rect_width)))
    rect_h = max(2, min(height - y, int(args.rect_height)))

    pad = max(16, min(64, int(max(rect_w, rect_h) * 0.25)))
    crop_x = max(0, x - pad)
    crop_y = max(0, y - pad)
    crop_w = min(width - crop_x, rect_w + (x - crop_x) + pad)
    crop_h = min(height - crop_y, rect_h + (y - crop_y) + pad)

    temp_video = args.output + ".video.mp4"
    encode = subprocess.Popen(
        [
            args.ffmpeg,
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{width}x{height}",
            "-r",
            str(fps),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            temp_video,
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    processed = 0
    try:
        for frame in ffmpeg_decode(args.ffmpeg, args.input, width, height):
            if processed >= frames:
                break
            crop = frame[crop_y : crop_y + crop_h, crop_x : crop_x + crop_w].copy()
            mask = np.zeros((crop_h, crop_w), dtype=np.uint8)
            mask[y - crop_y : y - crop_y + rect_h, x - crop_x : x - crop_x + rect_w] = 255
            repaired = lama_inpaint(vision, crop, mask)
            frame[crop_y : crop_y + crop_h, crop_x : crop_x + crop_w] = repaired
            encode.stdin.write(frame.tobytes())
            processed += 1
            progress(processed / frames * 100, f"修复 {processed}/{frames} 帧")
    finally:
        if encode.stdin:
            encode.stdin.close()
        stderr = encode.stderr.read().decode("utf-8", errors="replace")
        encode.wait()
        if encode.returncode != 0:
            raise RuntimeError(f"ffmpeg 编码失败：{stderr[-600:]}")

    # 把原视频音轨接回修复后的画面
    mux = subprocess.run(
        [
            args.ffmpeg,
            "-y",
            "-v",
            "error",
            "-i",
            temp_video,
            "-i",
            args.input,
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            args.output,
        ],
        capture_output=True,
    )
    os.remove(temp_video)
    if mux.returncode != 0:
        raise RuntimeError(
            f"音轨合并失败：{mux.stderr.decode('utf-8', errors='replace')[-600:]}"
        )

    progress(100, "视频修复完成")
    return {"output": args.output, "frames": processed, "width": width, "height": height}


TASKS = {
    "matte-image": task_matte_image,
    "layer-split": task_layer_split,
    "inpaint-image": task_inpaint_image,
    "outpaint-image": task_outpaint_image,
    "matte-video": task_matte_video,
    "repair-video": task_repair_video,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=sorted(TASKS))
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--background")
    parser.add_argument("--mask")
    parser.add_argument("--models", required=True)
    parser.add_argument("--ffmpeg")
    parser.add_argument("--width", type=int, default=0)
    parser.add_argument("--height", type=int, default=0)
    parser.add_argument("--fps", type=float, default=0)
    parser.add_argument("--frames", type=int, default=0)
    parser.add_argument("--x", type=float, default=0)
    parser.add_argument("--y", type=float, default=0)
    parser.add_argument("--rect-width", type=float, default=0)
    parser.add_argument("--rect-height", type=float, default=0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started = time.time()
    try:
        vision = Vision(args.models)
        result = TASKS[args.task](vision, args)
        result["seconds"] = round(time.time() - started, 2)
        emit({"stage": "done", **result})
        return 0
    except Exception as error:  # noqa: BLE001
        emit({"stage": "error", "message": str(error)})
        import traceback

        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
