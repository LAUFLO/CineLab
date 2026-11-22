"""CineLab 人声/背景音分离 worker。

只依赖 depth-runtime 自带的 Python、torch、numpy、einops 和 tqdm。
模型文件由主进程下载到 stem-model 组件目录，worker 只读取。
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import sys
import traceback
import wave

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from demucs.apply import apply_model  # noqa: E402
from demucs.states import load_model  # noqa: E402

SAMPLE_RATE = 44100
SEGMENT_SECONDS = 7.8
OVERLAP = 0.25
BLOCK = 1_048_576


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def read_wav(path: str) -> tuple[torch.Tensor, int]:
    with wave.open(path, "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())

    if width != 2:
        raise ValueError(f"只支持 16-bit PCM WAV，收到 {width * 8}-bit")
    if rate != SAMPLE_RATE:
        raise ValueError(f"采样率必须是 {SAMPLE_RATE}，收到 {rate}")
    if channels not in (1, 2):
        raise ValueError(f"只支持单声道或立体声，收到 {channels} 声道")
    if not frames:
        raise ValueError("音频为空")

    data = np.frombuffer(frames, dtype="<i2").reshape(-1, channels).T
    if channels == 1:
        data = np.repeat(data, 2, axis=0)
    tensor = torch.from_numpy(data.astype(np.float32) / 32768.0)
    return tensor.contiguous(), rate


def rescale(data: np.ndarray) -> np.ndarray:
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak > 1.0:
        return data / peak
    return data


def write_wav(path: str, tensor: torch.Tensor, rate: int) -> None:
    data = tensor.detach().cpu().numpy().astype(np.float32)
    data = rescale(data)
    pcm = np.clip(data.T * 32767.0, -32768, 32767).astype("<i2")

    with wave.open(path, "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(pcm.tobytes())


def triangular_weight(length: int) -> np.ndarray:
    half = length // 2
    weight = np.concatenate(
        [
            np.arange(1, half + 1, dtype=np.float32),
            np.arange(length - half, 0, -1, dtype=np.float32),
        ]
    )
    weight /= max(1.0, float(weight.max()))
    return weight[:length]


def separate_full(
    model,
    mix: torch.Tensor,
    vocals_path: str,
    background_path: str,
    rate: int,
) -> None:
    total = mix.shape[-1]

    def on_progress(payload: dict) -> None:
        offset = payload.get("segment_offset")
        if isinstance(offset, int) and total > 0:
            percent = min(99.0, max(0.0, offset / total * 100.0))
            emit({"stage": "progress", "percent": percent})

    with torch.no_grad():
        out = apply_model(
            model,
            mix[None],
            shifts=1,
            split=True,
            overlap=OVERLAP,
            progress=False,
            num_workers=0,
            callback=on_progress,
        )

    vocals = out[0, 3]
    background = out[0, 0] + out[0, 1] + out[0, 2]
    write_wav(vocals_path, vocals, rate)
    write_wav(background_path, background, rate)
    del out, vocals, background


def write_memmap_wav(
    path: str,
    data_map: np.memmap,
    weight_map: np.memmap,
    rate: int,
) -> None:
    total = data_map.shape[1]
    peak = 0.0

    for start in range(0, total, BLOCK):
        end = min(total, start + BLOCK)
        weights = np.maximum(np.asarray(weight_map[start:end]), 1e-8)
        block = np.asarray(data_map[:, start:end]) / weights
        if block.size:
            peak = max(peak, float(np.max(np.abs(block))))

    scale = 1.0 / peak if peak > 1.0 else 1.0

    with wave.open(path, "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        for start in range(0, total, BLOCK):
            end = min(total, start + BLOCK)
            weights = np.maximum(np.asarray(weight_map[start:end]), 1e-8)
            block = np.asarray(data_map[:, start:end]) / weights
            block = np.clip(block * scale, -1.0, 1.0)
            pcm = (block.T * 32767.0).astype("<i2")
            handle.writeframes(pcm.tobytes())


def separate_streaming(
    model,
    mix: torch.Tensor,
    vocals_path: str,
    background_path: str,
    rate: int,
    segment_seconds: float,
    overlap: float,
) -> None:
    total = mix.shape[-1]
    segment = max(1, int(segment_seconds * rate))
    stride = max(1, int(segment * (1.0 - overlap)))
    weight_base = triangular_weight(segment)

    vocals_map_path = f"{vocals_path}.map"
    background_map_path = f"{background_path}.map"
    weight_map_path = f"{background_path}.weights.map"

    vocals_map = np.memmap(
        vocals_map_path, dtype="float32", mode="w+", shape=(2, total)
    )
    background_map = np.memmap(
        background_map_path, dtype="float32", mode="w+", shape=(2, total)
    )
    weight_map = np.memmap(
        weight_map_path, dtype="float32", mode="w+", shape=(total,)
    )

    try:
        for offset in range(0, total, stride):
            length = min(segment, total - offset)
            if length <= 0:
                break

            chunk = mix[:, offset : offset + length]
            with torch.no_grad():
                out = apply_model(
                    model,
                    chunk[None],
                    shifts=0,
                    split=False,
                    overlap=overlap,
                    progress=False,
                    num_workers=0,
                )

            if out.shape[-1] > length:
                out = out[..., :length]
            elif out.shape[-1] < length:
                pad = length - out.shape[-1]
                out = torch.nn.functional.pad(out, (0, pad))

            weight = weight_base[:length]
            vocals = out[0, 3].cpu().numpy()
            background = (
                (out[0, 0] + out[0, 1] + out[0, 2]).cpu().numpy()
            )
            vocals_map[:, offset : offset + length] += vocals * weight
            background_map[:, offset : offset + length] += background * weight
            weight_map[offset : offset + length] += weight

            emit(
                {
                    "stage": "progress",
                    "percent": min(99.0, (offset + length) / total * 100.0),
                }
            )
            del out, vocals, background

        vocals_map.flush()
        background_map.flush()
        weight_map.flush()
        write_memmap_wav(vocals_path, vocals_map, weight_map, rate)
        write_memmap_wav(background_path, background_map, weight_map, rate)
    finally:
        del vocals_map, background_map, weight_map
        gc.collect()
        for path in (vocals_map_path, background_map_path, weight_map_path):
            try:
                os.remove(path)
            except OSError:
                pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--vocals", required=True)
    parser.add_argument("--background", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--max-full-seconds", type=float, default=600.0)
    parser.add_argument("--segment-seconds", type=float, default=SEGMENT_SECONDS)
    parser.add_argument("--overlap", type=float, default=OVERLAP)
    args = parser.parse_args()

    try:
        emit({"stage": "progress", "percent": 0.0})
        mix, rate = read_wav(args.input)
        duration = mix.shape[-1] / rate
        emit({"stage": "progress", "percent": 1.0})

        torch.set_grad_enabled(False)
        model = load_model(args.model)
        model.eval()
        emit({"stage": "progress", "percent": 3.0})

        if duration <= args.max_full_seconds:
            separate_full(model, mix, args.vocals, args.background, rate)
        else:
            separate_streaming(
                model,
                mix,
                args.vocals,
                args.background,
                rate,
                args.segment_seconds,
                args.overlap,
            )

        emit({"stage": "progress", "percent": 100.0})
        emit({"stage": "done", "percent": 100.0})
        return 0
    except Exception as error:  # noqa: BLE001
        traceback.print_exc()
        emit({"stage": "error", "message": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
