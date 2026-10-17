"""Measure sharpness of renders written by tests/quality.mjs.

For each case compares the native 4K frame with the 1080p frame upscaled 2x
(what a fake "4K" would look like). Native rendering must have clearly more
high-frequency detail and edges no wider (in 4K pixels) than ~2 px.
Usage: python3 -I tests/quality.py <dir>
"""
import sys, json
import numpy as np
from PIL import Image

d = sys.argv[1] if len(sys.argv) > 1 else 'test-results/quality'
# crop boxes in normalised (x0, y0, x1, y1)
BOXES = {'search': (0.14, 0.40, 0.62, 0.50), 'icons': (0.15, 0.08, 0.85, 0.75), 'arrow': (0.30, 0.38, 0.70, 0.62)}

def lum(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float64) / 255.0
    return a @ np.array([0.2126, 0.7152, 0.0722])

def crop(img, box):
    w, h = img.size
    return img.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))

def lap_energy(y):
    l = -4 * y[1:-1, 1:-1] + y[:-2, 1:-1] + y[2:, 1:-1] + y[1:-1, :-2] + y[1:-1, 2:]
    return float(np.mean(l * l))

def edge_width(y):
    """median 10-90% rise width (px) of strong horizontal edges."""
    widths = []
    for row in y[::2]:
        g = np.diff(row)
        for i in np.argsort(-np.abs(g))[:6]:
            if abs(g[i]) < 0.12: continue
            lo, hi = min(row[i], row[i + 1]), max(row[i], row[i + 1])
            # walk outwards to the plateau on both sides
            a = i
            while a > 0 and abs(row[a - 1] - row[a]) > 0.01 and (row[a - 1] - row[a]) * np.sign(g[i]) < 0: a -= 1
            bb = i + 1
            while bb < len(row) - 1 and abs(row[bb + 1] - row[bb]) > 0.01 and (row[bb + 1] - row[bb]) * np.sign(g[i]) > 0: bb += 1
            seg = row[a:bb + 1] if g[i] > 0 else row[a:bb + 1][::-1]
            v0, v1 = seg[0], seg[-1]
            if v1 - v0 < 0.3: continue
            t10 = np.argmax(seg >= v0 + 0.1 * (v1 - v0)); t90 = np.argmax(seg >= v0 + 0.9 * (v1 - v0))
            widths.append(max(1, t90 - t10 + 1))
    return float(np.median(widths)) if widths else float('nan')

report, ok = {}, True
for name, box in BOXES.items():
    hd = Image.open(f'{d}/{name}-1080x1920.png'); uhd = Image.open(f'{d}/{name}-2160x3840.png')
    assert uhd.size == (2160, 3840), uhd.size
    c4 = crop(uhd, box); c1 = crop(hd, box)
    up = c1.resize(c4.size, Image.BICUBIC)
    e4, eu = lap_energy(lum(c4)), lap_energy(lum(up))
    w4, w1 = edge_width(lum(c4)), edge_width(lum(c1))
    r = {'detail_native_vs_upscaled': round(e4 / eu, 2), 'edge_px_4k': w4, 'edge_px_1080': w1}
    r['pass'] = r['detail_native_vs_upscaled'] > 1.5 and w4 <= 2.5
    ok &= r['pass']
    report[name] = r
    c4.save(f'{d}/{name}-crop-4k.png'); up.save(f'{d}/{name}-crop-1080-upscaled.png')
# decoded frames of the real exports: dimensions from the file, sharpness
# of text after encoding (search scene at 4.9 s)
import glob, subprocess, os
for f in sorted(glob.glob(f'{d}/*.webm') + glob.glob(f'{d}/*.mp4')):
    dims = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip()
    png = f + '.4.9s.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '4.9', '-i', f, '-frames:v', '1', png], check=True)
    img = Image.open(png)
    c = crop(img, BOXES['search'])
    rep = {'file_stream': dims, 'decoded_frame': list(img.size), 'edge_px': edge_width(lum(c))}
    report[os.path.basename(f)] = rep
print(json.dumps(report, indent=1))
sys.exit(0 if ok else 1)
