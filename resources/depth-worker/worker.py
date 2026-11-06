#!/usr/bin/env python3
"""CineLab depth capture worker.

Reads a video, runs Video Depth Anything Small, normalizes the whole clip,
and encodes an 8-bit grayscale H.264 control video.

The worker owns the whole media pipeline. The Electron main process only
passes arguments, reads JSON progress lines from stdout and kills the tree.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from typing import Any

import cv2
import numpy as np


def log(event: dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CineLab depth capture worker")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--long-edge", type=int, default=854)
    parser.add_argument("--fps", type=float, default=0.0)
    parser.add_argument("--input-size", type=int, default=364)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--vda-dir", required=True)
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--crf", type=int, default=12)
    parser.add_argument("--max-frames", type=int, default=0)
    return parser.parse_args()


def even(value: float) -> int:
    return max(2, int(round(value / 2) * 2))


def output_size(src_w: int, src_h: int, long_edge: int) -> tuple[int, int]:
    scale = min(1.0, long_edge / max(src_w, src_h))
    return even(src_w * scale), even(src_h * scale)


def process_size(src_w: int, src_h: int, input_size: int) -> tuple[int, int]:
    short = min(src_w, src_h)
    if short <= input_size:
        return even(src_w), even(src_h)
    scale = input_size / short
    return even(src_w * scale), even(src_h * scale)


def read_frames(
    path: str, target_fps: float, width: int, height: int
) -> tuple[np.ndarray, float]:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {path}")

    src_fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    out_fps = src_fps if target_fps <= 0 or target_fps >= src_fps else target_fps

    frames: list[np.ndarray] = []
    next_pick = 0.0
    index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = index / src_fps
        index += 1
        if out_fps < src_fps and t + 1e-9 < next_pick:
            continue
        next_pick += 1.0 / out_fps

        if (frame.shape[1], frame.shape[0]) != (width, height):
            frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

    cap.release()
    if not frames:
        raise RuntimeError(f"no frames decoded from {path}")
    return np.stack(frames, axis=0), out_fps


def ensure_torchvision_compose() -> None:
    """VDA imports torchvision only for Compose.

    Shipping torchvision costs ~25MB for one tiny helper. Provide a compatible
    shim when torchvision is absent so the runtime can stay torch + numpy + cv2.
    """
    try:
        import torchvision  # noqa: F401
        return
    except ImportError:
        pass

    import types

    tv = types.ModuleType("torchvision")
    transforms = types.ModuleType("torchvision.transforms")

    class Compose:
        def __init__(self, steps):
            self.steps = list(steps)

        def __call__(self, value):
            for step in self.steps:
                value = step(value)
            return value

    transforms.Compose = Compose
    tv.transforms = transforms
    sys.modules["torchvision"] = tv
    sys.modules["torchvision.transforms"] = transforms


def load_model(vda_dir: str, checkpoint: str):
    sys.path.insert(0, vda_dir)
    import torch
    from video_depth_anything.video_depth import VideoDepthAnything

    model = VideoDepthAnything(
        encoder="vits",
        features=64,
        out_channels=[48, 96, 192, 384],
    )
    state = torch.load(checkpoint, map_location="cpu", weights_only=True)
    model.load_state_dict(state, strict=True)
    model.eval()
    return model


def infer(model, frames: np.ndarray, fps: float, input_size: int) -> np.ndarray:
    import torch

    with torch.inference_mode():
        depths, _ = model.infer_video_depth(
            frames,
            fps,
            input_size=input_size,
            device="cpu",
            fp32=True,
        )
    return np.asarray(depths, dtype=np.float32)


def to_gray(depths: np.ndarray) -> np.ndarray:
    low = float(depths.min())
    high = float(depths.max())
    if high - low < 1e-6:
        return np.zeros(depths.shape, dtype=np.uint8)

    out = np.empty(depths.shape, dtype=np.uint8)
    for index in range(depths.shape[0]):
        normalized = np.clip((depths[index] - low) / (high - low), 0.0, 1.0)
        out[index] = (normalized * 255.0 + 0.5).astype(np.uint8)
    return out


def encode(
    gray: np.ndarray,
    width: int,
    height: int,
    fps: float,
    ffmpeg: str,
    output: str,
    crf: int,
) -> None:
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-s",
        f"{gray.shape[2]}x{gray.shape[1]}",
        "-r",
        f"{fps:.6f}",
        "-i",
        "-",
        "-vf",
        f"scale={width}:{height}:flags=bicubic",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-g",
        str(max(1, round(fps * 2))),
        "-movflags",
        "+faststart",
        output,
    ]

    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame in gray:
            process.stdin.write(np.ascontiguousarray(frame).tobytes())
        process.stdin.close()
        code = process.wait()
    except BrokenPipeError:
        code = process.wait()

    if code != 0:
        raise RuntimeError(f"ffmpeg failed with code {code}")


def main() -> int:
    args = parse_args()
    started = time.time()

    log({"stage": "read", "percent": 5})
    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {args.input}")
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    out_w, out_h = output_size(src_w, src_h, args.long_edge)
    proc_w, proc_h = process_size(src_w, src_h, args.input_size)
    log(
        {
            "stage": "read",
            "percent": 10,
            "message": f"{src_w}x{src_h} -> {proc_w}x{proc_h}, output {out_w}x{out_h}",
        }
    )

    frames, fps = read_frames(args.input, args.fps, proc_w, proc_h)
    if args.max_frames and len(frames) > args.max_frames:
        frames = frames[: args.max_frames]
    log(
        {
            "stage": "infer",
            "percent": 15,
            "message": f"{len(frames)} frames @ {fps:.3f} fps",
        }
    )

    ensure_torchvision_compose()
    model = load_model(args.vda_dir, args.checkpoint)
    depths = infer(model, frames, fps, args.input_size)
    log({"stage": "normalize", "percent": 82})

    gray = to_gray(depths)
    log({"stage": "encode", "percent": 90})
    encode(gray, out_w, out_h, fps, args.ffmpeg, args.output, args.crf)

    log(
        {
            "stage": "done",
            "percent": 100,
            "frames": int(len(frames)),
            "seconds": round(time.time() - started, 2),
        }
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        log({"stage": "error", "message": str(error)})
        raise
