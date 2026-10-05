# Generates icons/icon{16,48,128}.png: an orange rounded square with three white meter bars.
# Pure stdlib (zlib) so it runs anywhere; rerun after changing the design.
import struct, zlib, pathlib

ORANGE, WHITE = (217, 72, 15), (255, 255, 255)

def pixel(x, y, n):
    u, v = (x + 0.5) / n, (y + 0.5) / n
    r = 0.2
    dx, dy = max(r - u, 0, u - (1 - r)), max(r - v, 0, v - (1 - r))
    if dx * dx + dy * dy > r * r:
        return (0, 0, 0, 0)
    for i, h in enumerate((0.30, 0.48, 0.64)):
        x0 = 0.22 + i * 0.2
        if x0 <= u <= x0 + 0.14 and 0.80 - h <= v <= 0.80:
            return WHITE + (255,)
    return ORANGE + (255,)

def png(n):
    raw = b"".join(b"\0" + b"".join(bytes(pixel(x, y, n)) for x in range(n)) for y in range(n))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

out = pathlib.Path(__file__).resolve().parent.parent / "icons"
for n in (16, 48, 128):
    (out / f"icon{n}.png").write_bytes(png(n))
    print(f"icons/icon{n}.png")
