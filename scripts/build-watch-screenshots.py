#!/usr/bin/env python3
"""
Compose the Apple Watch App Store screenshots in the listing's v2 design.

The iPhone and iPad sets share one treatment — cream-to-lavender gradient, white
eyebrow pill with a letterspaced violet label, Fraunces display headline whose
second line turns violet, device bleeding off the bottom edge. This puts the
Watch on the same page, at the only size App Store Connect accepts for it.

The product UI is never touched. Each shot takes an untouched simulator capture
from watch-raw/, scales it once, and pastes it into a watch body; the headline,
gradient and body all live outside that rectangle. Because the whole image is
derived, `--check` can re-render and demand a byte-for-byte match with what is
committed, which is a stronger guarantee than eyeballing it: if anyone ever
retouches a screen, the check fails.

    python3 scripts/build-watch-screenshots.py [--check]
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAW = Path("screenshots/store-screenshots/watch-raw")
OUT = Path("screenshots/store-screenshots/watch")

FRAUNCES = Path("node_modules/@expo-google-fonts/fraunces")
SF = "/System/Library/Fonts/SFNS.ttf"

# APP_WATCH_ULTRA, which is also the Ultra 2 panel the captures come from.
W, H = 410, 502

# Sampled from the live listing rather than guessed: the headline ink and
# violet, the eyebrow's lighter violet, and the near-white the gradient starts
# from all come from screenshots currently on the store.
INK = (28, 27, 31)
HEAD_VIOLET = (107, 70, 193)
EYEBROW_VIOLET = (124, 77, 224)
TOP_TINT = (250, 247, 250)

# The device is 4x oversampled and downscaled, so its corners and the crown
# stay clean at this size — at 410px wide, aliasing on the body reads as
# sloppiness more than anything else does.
SS = 4

# Sized so the bleed never eats a message. 04-caught-up's copy runs to 96% of
# the panel, so the device is placed to keep 98% of the screen on canvas — the
# bottom edge still breaks the frame the way the iPhone set does, but what it
# cuts is margin rather than words.
EYEBROW_Y = 15
H1_Y, H2_Y = 48, 84
BODY_TOP, BODY_W, BEZEL = 140, 312, 9

# (source, eyebrow, glyph, headline 1, headline 2, bottom gradient tint)
SHOTS = [
    ("01-today", "ON YOUR WRIST", "sun",
     "Your day,", "at a glance", (214, 202, 240)),
    ("02-overdue", "NOTHING SLIPS", "dot",
     "See what's", "running late", (243, 219, 214)),
    ("03-completed", "ONE TAP", "check",
     "Tick it off", "from your wrist", (206, 192, 241)),
    ("04-caught-up", "ALL CLEAR", "star",
     "Nothing due.", "Go enjoy it.", (222, 208, 240)),
]


def fraunces(size):
    return ImageFont.truetype(str(FRAUNCES / "800ExtraBold" / "Fraunces_800ExtraBold.ttf"), size)


def sf_bold(size):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_name("Bold")
    return f


def gradient(bottom):
    """Cream to the shot's tint, eased so the colour gathers low, as in v2."""
    g = Image.new("RGB", (1, H))
    px = g.load()
    for y in range(H):
        t = (y / (H - 1)) ** 1.15
        px[0, y] = tuple(round(TOP_TINT[i] + (bottom[i] - TOP_TINT[i]) * t) for i in range(3))
    canvas = g.resize((W, H))

    # The warm bloom in the top-right corner of the live iPhone shots.
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W - 210, -170, W + 130, 170], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    return Image.composite(Image.new("RGB", (W, H), (250, 231, 228)), canvas, glow)


def glyph(kind, size, colour):
    """Small vector mark for the eyebrow pill, drawn big and downscaled."""
    s = size * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, r = s / 2, s / 2
    if kind == "sun":
        d.ellipse([c - r * 0.42, c - r * 0.42, c + r * 0.42, c + r * 0.42],
                  outline=colour, width=max(1, int(s * 0.10)))
        for i in range(8):
            import math
            a = i * math.pi / 4
            d.line([c + math.cos(a) * r * 0.62, c + math.sin(a) * r * 0.62,
                    c + math.cos(a) * r * 0.95, c + math.sin(a) * r * 0.95],
                   fill=colour, width=max(1, int(s * 0.11)))
    elif kind == "dot":
        d.ellipse([c - r * 0.62, c - r * 0.62, c + r * 0.62, c + r * 0.62], fill=colour)
    elif kind == "check":
        d.line([c - r * 0.62, c, c - r * 0.12, c + r * 0.48], fill=colour,
               width=max(1, int(s * 0.15)))
        d.line([c - r * 0.12, c + r * 0.48, c + r * 0.66, c - r * 0.52], fill=colour,
               width=max(1, int(s * 0.15)))
    elif kind == "star":
        import math
        pts = []
        for i in range(10):
            rad = r * (0.95 if i % 2 == 0 else 0.42)
            a = -math.pi / 2 + i * math.pi / 5
            pts.append((c + math.cos(a) * rad, c + math.sin(a) * rad))
        d.polygon(pts, fill=colour)
    return im.resize((size, size), Image.LANCZOS)


def tracked(d, text, font, cx, y, fill, tracking):
    """Centred text with letterspacing, which PIL has no setting for."""
    widths = [d.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
    return total


def centre(d, text, font, y, fill):
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)


def watch_body(screen):
    """The Watch case, with the capture inset as its display."""
    sw = BODY_W - BEZEL * 2
    sh = round(sw * H / W)
    bw, bh = BODY_W, sh + BEZEL * 2

    body = Image.new("RGBA", (bw * SS, bh * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([0, 0, bw * SS - 1, bh * SS - 1], radius=int(bw * SS * 0.235),
                        fill=(22, 22, 26, 255), outline=(78, 78, 88, 255),
                        width=max(1, int(SS * 1.2)))
    body = body.resize((bw, bh), Image.LANCZOS)

    # One resample of the untouched capture. Nothing is drawn over it.
    shot = screen.convert("RGB").resize((sw, sh), Image.LANCZOS)
    # Deliberately rounder on the case than on the display. Matching the case's
    # radius here looked right but ate the first letter of the caught-up copy in
    # the bottom-left corner, and a composition may not clip the UI it is
    # showing. The corners it leaves square are black on black, so nothing shows.
    mask = Image.new("L", (sw * SS, sh * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw * SS - 1, sh * SS - 1],
                                           radius=int(sw * SS * 0.13), fill=255)
    body.paste(shot, (BEZEL, BEZEL), mask.resize((sw, sh), Image.LANCZOS))

    # Digital Crown and side button, so it reads as a watch and not a slab.
    hw = Image.new("RGBA", (24 * SS, bh * SS), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hw)
    cy = int(bh * SS * 0.30)
    hd.rounded_rectangle([0, cy, int(9 * SS), cy + int(30 * SS)],
                         radius=int(4 * SS), fill=(96, 96, 106, 255))
    by = int(bh * SS * 0.52)
    hd.rounded_rectangle([0, by, int(6 * SS), by + int(34 * SS)],
                         radius=int(3 * SS), fill=(58, 58, 66, 255))
    hw = hw.resize((24, bh), Image.LANCZOS)

    out = Image.new("RGBA", (bw + 10, bh), (0, 0, 0, 0))
    out.paste(hw, (bw - 4, 0), hw)
    out.paste(body, (0, 0), body)
    return out


def render(slug, eyebrow, mark, l1, l2, tint):
    canvas = gradient(tint).convert("RGBA")
    device = watch_body(Image.open(RAW / f"{slug}.png"))

    # Shadow first, so the device sits on the gradient rather than floating.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x0 = (W - BODY_W) // 2
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x0 + 14, BODY_TOP + 18, x0 + BODY_W - 14, H + 40],
        radius=70, fill=(60, 40, 110, 105))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(26)))
    canvas.paste(device, (x0, BODY_TOP), device)

    d = ImageDraw.Draw(canvas)
    f_eye, f_head = sf_bold(11), fraunces(31)

    # Eyebrow pill, sized to its contents.
    gsize, gap, track = 13, 6, 1.5
    widths = [d.textlength(ch, font=f_eye) for ch in eyebrow]
    text_w = sum(widths) + track * (len(eyebrow) - 1)
    inner = gsize + gap + text_w
    pad_x, ph = 14, 26
    x0p = (W - inner) / 2 - pad_x
    d.rounded_rectangle([x0p, EYEBROW_Y, x0p + inner + pad_x * 2, EYEBROW_Y + ph],
                        radius=ph / 2, fill=(255, 255, 255))
    g = glyph(mark, gsize, {"sun": (232, 146, 30), "dot": (226, 90, 60),
                            "check": (32, 160, 110), "star": (232, 176, 40)}[mark])
    canvas.paste(g, (int(x0p + pad_x), EYEBROW_Y + (ph - gsize) // 2), g)
    d = ImageDraw.Draw(canvas)
    tracked(d, eyebrow, f_eye, (W + gsize + gap) / 2, EYEBROW_Y + 7, EYEBROW_VIOLET, track)

    centre(d, l1, f_head, H1_Y, INK)
    centre(d, l2, f_head, H2_Y, HEAD_VIOLET)

    for label, text, font in ((f"{slug} h1", l1, f_head), (f"{slug} h2", l2, f_head)):
        assert d.textlength(text, font=font) < W * 0.92, f"{label} too wide"
    assert inner + pad_x * 2 < W * 0.90, f"{slug} eyebrow too wide"

    return canvas.convert("RGB")


def main():
    check = "--check" in sys.argv
    if not RAW.exists():
        print(f"no captures in {RAW}", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    failed = False
    for slug, eyebrow, mark, l1, l2, tint in SHOTS:
        src = RAW / f"{slug}.png"
        if Image.open(src).size != (W, H):
            print(f"FAIL {src.name}: capture is not {W}x{H}")
            failed = True
            continue

        image = render(slug, eyebrow, mark, l1, l2, tint)
        dest = OUT / f"{slug}.png"
        if check:
            if not dest.exists():
                print(f"FAIL {dest.name}: missing")
                failed = True
                continue
            shipped = Image.open(dest)
            if shipped.mode != "RGB" or shipped.size != (W, H):
                print(f"FAIL {dest.name}: {shipped.mode} {shipped.size}, expected RGB {(W, H)}")
                failed = True
                continue
            if list(shipped.getdata()) != list(image.getdata()):
                print(f"FAIL {dest.name}: does not match a fresh render of the raw capture")
                failed = True
                continue
            print(f"ok   {dest.name}: matches a fresh render  — “{l1} {l2}”")
        else:
            image.save(dest)
            print(f"wrote {dest}  {W}x{H}  “{l1} {l2}”")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
