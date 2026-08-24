#!/usr/bin/env python3
"""Render official bob-wave onto cream iOS icon and splash squares."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

CREAM = (0xF7, 0xF7, 0xF5, 255)
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "mascot" / "bob-wave.png"
OUT = ROOT / "assets" / "mascot"


def read_png(path: Path) -> tuple[int, int, list[bytearray]]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    off = 8
    width = height = 0
    raw = b""
    while off < len(data):
        length = struct.unpack(">I", data[off : off + 4])[0]
        kind = data[off + 4 : off + 8]
        chunk = data[off + 8 : off + 8 + length]
        if kind == b"IHDR":
            width, height, bit, color, *_ = struct.unpack(">IIBBBBB", chunk)
            if bit != 8 or color != 6:
                raise SystemExit(f"Need 8-bit RGBA, got bit={bit} color={color}")
        elif kind == b"IDAT":
            raw += chunk
        elif kind == b"IEND":
            break
        off += 12 + length
    raw = zlib.decompress(raw)
    bpp = 4
    stride = width * bpp
    rows: list[bytearray] = []
    i = 0
    prev = bytearray(stride)
    for _ in range(height):
        filt = raw[i]
        scan = bytearray(raw[i + 1 : i + 1 + stride])
        i += 1 + stride
        if filt == 1:
            for x in range(stride):
                scan[x] = (scan[x] + (scan[x - bpp] if x >= bpp else 0)) & 255
        elif filt == 2:
            for x in range(stride):
                scan[x] = (scan[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                left = scan[x - bpp] if x >= bpp else 0
                scan[x] = (scan[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a = scan[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                scan[x] = (scan[x] + pr) & 255
        elif filt != 0:
            raise SystemExit(f"Unsupported PNG filter {filt}")
        rows.append(scan)
        prev = scan
    return width, height, rows


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    )


def sample(rows: list[bytearray], width: int, height: int, x: float, y: float) -> tuple[int, int, int, int]:
    x = min(max(x, 0), width - 1)
    y = min(max(y, 0), height - 1)
    x0, y0 = int(x), int(y)
    x1, y1 = min(x0 + 1, width - 1), min(y0 + 1, height - 1)
    fx, fy = x - x0, y - y0

    def px(xx: int, yy: int) -> tuple[int, int, int, int]:
        o = xx * 4
        r = rows[yy]
        return r[o], r[o + 1], r[o + 2], r[o + 3]

    def mix(
        a: tuple[int, int, int, int], b: tuple[int, int, int, int], t: float
    ) -> tuple[int, int, int, int]:
        return tuple(int(p + (q - p) * t) for p, q in zip(a, b))  # type: ignore[return-value]

    return mix(mix(px(x0, y0), px(x1, y0), fx), mix(px(x0, y1), px(x1, y1), fx), fy)


def over(src: tuple[int, int, int, int], dst: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    sa = src[3] / 255
    if sa <= 0:
        return dst
    if sa >= 1:
        return src
    out = [int(s * sa + d * (1 - sa)) for s, d in zip(src[:3], dst[:3])]
    return (out[0], out[1], out[2], 255)


def render(size: int, rows: list[bytearray], sw: int, sh: int, pad: float) -> bytearray:
    inset = int(size * pad)
    box = size - inset * 2
    scale = min(box / sw, box / sh)
    dw, dh = sw * scale, sh * scale
    ox = (size - dw) / 2
    oy = (size - dh) / 2
    out = bytearray()
    for y in range(size):
        for x in range(size):
            sx = (x + 0.5 - ox) / scale - 0.5
            sy = (y + 0.5 - oy) / scale - 0.5
            if 0 <= sx < sw - 1 and 0 <= sy < sh - 1:
                out.extend(over(sample(rows, sw, sh, sx, sy), CREAM))
            else:
                out.extend(CREAM)
    return out


def main() -> None:
    width, height, rows = read_png(SRC)
    jobs = (
        ("app-icon.png", 1024, 0.18),
        ("splash.png", 2048, 0.28),
    )
    for name, size, pad in jobs:
        dest = OUT / name
        write_png(dest, size, size, render(size, rows, width, height, pad))
        print(f"wrote {dest} {size}x{size}")


if __name__ == "__main__":
    main()
