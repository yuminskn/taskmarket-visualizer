#!/usr/bin/env python3
"""Generate og.png (1200x630) for the Taskmarket visualizer.
Uses only the brand colours and the two Google Fonts typefaces
(Instrument Serif, Inter Tight — SIL OFL). No Taskmarket artwork is
copied: the pixel-square motif is drawn from scratch in the brand palette.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
GROUND = (18, 16, 14)
MAROON = (58, 20, 32)
PANEL = (34, 30, 26)
LINE = (69, 62, 55)
CREAM = (239, 233, 226)
MUTED = (176, 167, 157)
MAGENTA = (231, 64, 121)
SALMON = (217, 160, 151)

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
SERIF = os.path.join(_HERE, "assets", "InstrumentSerif-Regular.ttf")
SERIF_IT = os.path.join(_HERE, "assets", "InstrumentSerif-Italic.ttf")
SANS = os.path.join(_HERE, "assets", "InterTight.ttf")

img = Image.new("RGB", (W, H), GROUND)
d = ImageDraw.Draw(img)

# maroon glow, top right
glow = Image.new("RGB", (W, H), GROUND)
gd = ImageDraw.Draw(glow)
gd.ellipse([W - 460, -280, W + 160, 240], fill=MAROON)
img = Image.blend(img, glow, 0.55)
d = ImageDraw.Draw(img)

# pixel-square motif, top left (own drawing: 3x3 grid, one magenta)
x0, y0, s, gap = 72, 66, 34, 10
cols = [CREAM, MAGENTA, SALMON, CREAM, CREAM, MUTED, SALMON, CREAM, CREAM]
for r in range(3):
    for c in range(3):
        x = x0 + c * (s + gap)
        y = y0 + r * (s + gap)
        d.rounded_rectangle([x, y, x + s, y + s], radius=7, fill=cols[r * 3 + c])

# wordmark
try:
    f_word = ImageFont.truetype(SERIF, 54)
    f_head = ImageFont.truetype(SERIF, 116)
    f_head_it = ImageFont.truetype(SERIF_IT, 116)
    f_sub = ImageFont.truetype(SANS, 34)
    f_addr = ImageFont.truetype(SANS, 30)
except Exception as e:
    raise SystemExit(f"font load failed: {e}")

d.text((x0 + 3 * s + 2 * gap + 22, y0 + 8), "taskmarket", font=f_word, fill=CREAM)

# headline: "Paid work for agents," / "in real time." (magenta italic "agents,")
d.text((72, 218), "Paid work for", font=f_head, fill=CREAM)
w1 = d.textlength("Paid work for ", font=f_head)
d.text((72 + w1, 218), "agents,", font=f_head_it, fill=MAGENTA)
d.text((72, 338), "in real time.", font=f_head, fill=CREAM)

# subline
d.text((72, 478), "Live market data — open tasks, active agents, rewards", font=f_sub, fill=MUTED)
d.text((72, 518), "posted and paid on Tempo and Base.", font=f_sub, fill=MUTED)

# address bottom
d.text((72, 566), "taskmarket-visualizer.pages.dev", font=f_addr, fill=SALMON)

img.save("/home/hatch/workspace/taskmarket-visualizer/public/og.png")
print("wrote public/og.png")
