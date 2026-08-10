# Renders the Arc Pump end card as a 1920x1080 clip.
#
#   python render.py
#
# Built to be spliced onto the tail of the demo video, so it uses the same
# palette, fonts and motion timing as arcpump.com/pay rather than a generic
# title card: warm paper, Newsreader for the wordmark, JetBrains Mono for the
# addresses, one burnt-orange accent, and 250ms ease-out on every entrance.
#
# Each element is rasterised once into a tight RGBA tile and then pasted per
# frame with an alpha and a vertical offset. Compositing full-frame layers 210
# times over is the obvious way to write this and about twenty times slower.

import os
import subprocess
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "arcpump-endcard.mp4")

W, H = 1920, 1080
FPS = 30
SECONDS = 7.0
FRAMES = int(FPS * SECONDS)

PAPER = (250, 250, 247)
INK = (10, 10, 10)
INK_SOFT = (42, 42, 42)
INK_MUTE = (107, 107, 107)
INK_FAINT = (154, 154, 146)
LINE = (229, 229, 221)
ACC = (194, 65, 12)
LIVE = (21, 128, 61)

X = 232                      # left margin — the block is set on a grid, not centred
RULE_W = 1180


def face(path, size, wght=None, opsz=None):
    f = ImageFont.truetype(os.path.join(HERE, "fonts", path), size)
    try:
        axes = [a[3] if isinstance(a, tuple) else a for a in f.get_variation_axes()]
        names = [(a["name"].decode() if isinstance(a.get("name"), bytes) else str(a.get("name"))).lower()
                 for a in f.get_variation_axes()]
        vals = []
        for nm, cur in zip(names, axes):
            if "weight" in nm and wght:
                vals.append(wght)
            elif ("optical" in nm or nm == "opsz") and opsz:
                vals.append(opsz)
            else:
                vals.append(cur)
        f.set_variation_by_axes(vals)
    except (OSError, AttributeError):
        pass                 # static font — nothing to set
    return f


F_TAG = face("JBM.ttf", 21)
F_WORD = face("News.ttf", 104, wght=500, opsz=36)
F_SUB = face("NewsI.ttf", 35, wght=400, opsz=20)
F_MONO = face("JBM.ttf", 27)
F_MONO_S = face("JBM.ttf", 24)


def tile(draw_fn, w, h):
    """Rasterise one element into its own transparent tile."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(img))
    return img


def tracked(d, xy, text, font, fill, track):
    """PIL has no letter-spacing, so the tag line is set a glyph at a time."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + track


# ── elements ───────────────────────────────────────────────────────────────

def _tag(d):
    d.ellipse((0, 9, 11, 20), fill=LIVE)
    tracked(d, (26, 0), "LIVE ON ARC · SETTLED IN USDC", F_TAG, INK_MUTE, 2.9)

TAG = tile(_tag, 700, 34)
WORD = tile(lambda d: d.text((0, 0), "Arc Pump", font=F_WORD, fill=INK), 620, 150)
SUB = tile(lambda d: d.text((0, 0), "Pay-per-call payments for AI agents, in USDC on Arc.",
                            font=F_SUB, fill=INK_MUTE), 1100, 60)

L1 = tile(lambda d: d.text((0, 0), "arcpump.com/pay", font=F_MONO, fill=INK_SOFT), 700, 42)
L2 = tile(lambda d: d.text((0, 0), "github.com/PHUOCHAU2403/arc-pump", font=F_MONO, fill=INK_SOFT), 700, 42)


def _l3(d):
    d.text((0, 2), "PaymentRouter", font=F_MONO_S, fill=INK_FAINT)
    d.text((205, 0), "0x8eB7e2A25C46938084d951985A5F87ad310A73Db", font=F_MONO_S, fill=INK_SOFT)

L3 = tile(_l3, 900, 42)

Y_TAG, Y_WORD, Y_SUB, Y_RULE = 268, 320, 486, 588
Y_L1, Y_L2, Y_L3 = 640, 688, 736


def ease_out(t):
    return 1 - (1 - t) ** 3


def entrance(now, start, dur=0.25, rise=14):
    """Returns (alpha 0..1, vertical offset in px) for a fade-and-rise."""
    if now <= start:
        return 0.0, rise
    t = min(1.0, (now - start) / dur)
    e = ease_out(t)
    return e, rise * (1 - e)


def paste(frame, img, x, y, alpha, dy=0.0):
    if alpha <= 0.001:
        return
    if alpha < 0.999:
        a = img.getchannel("A").point(lambda v: int(v * alpha))
        img = img.copy()
        img.putalpha(a)
    frame.alpha_composite(img, (x, int(round(y + dy))))


ff = imageio_ffmpeg.get_ffmpeg_exe()
proc = subprocess.Popen(
    [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
     "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
    stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

for i in range(FRAMES):
    t = i / FPS
    frame = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(frame)

    a, dy = entrance(t, 0.25)
    paste(frame, TAG, X, Y_TAG, a, dy)

    a, dy = entrance(t, 0.45, rise=18)
    paste(frame, WORD, X - 6, Y_WORD, a, dy)   # optical inset: the A of Arc Pump

    a, dy = entrance(t, 0.68)
    paste(frame, SUB, X, Y_SUB, a, dy)

    # Rule wipes rather than fades — a line arriving all at once reads as a
    # static graphic, one that draws reads as the page being built.
    if t > 0.90:
        w = int(RULE_W * ease_out(min(1.0, (t - 0.90) / 0.42)))
        if w > 0:
            d.rectangle((X, Y_RULE, X + min(w, 56), Y_RULE), fill=ACC)
        if w > 56:
            d.rectangle((X + 56, Y_RULE, X + w, Y_RULE), fill=LINE)

    for img, y, start in ((L1, Y_L1, 1.18), (L2, Y_L2, 1.31), (L3, Y_L3, 1.44)):
        a, dy = entrance(t, start, rise=10)
        paste(frame, img, X, y, a, dy)

    proc.stdin.write(frame.convert("RGB").tobytes())

proc.stdin.close()
err = proc.stderr.read().decode(errors="replace")
if proc.wait() != 0:
    raise SystemExit("ffmpeg loi:\n" + err[-2500:])

print("OK", OUT, os.path.getsize(OUT), "bytes")
