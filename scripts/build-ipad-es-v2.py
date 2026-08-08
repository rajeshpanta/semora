"""
Build Spanish iPad App Store screenshots in the current (v2) design.

The device screens come from screenshots/store-screenshots/iPad-es — those are
REAL Spanish app captures, which is the part no template can fake. What was dated
about that set is only the marketing chrome: a flat purple field and an all-caps
sans headline. This rebuilds the v2 treatment around them — soft cream→lavender
gradient, white eyebrow pill, Fraunces display headline with the second line in
violet, SF subhead, device bleeding off the bottom edge.

The v2 English set was generated image-by-image, so its device size and framing
drift between shots. This uses ONE geometry for all five, which makes the Spanish
set read as a more cohesive series than the English one it is matched to.

Output: 2064x2752 — on Apple's accepted list for iPad 13" (2064x2752, 2752x2064,
2048x2732, 2732x2048), and the same size as the English v2 set.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

SRC_DIR = 'screenshots/store-screenshots/iPad-es'
OUT_DIR = 'screenshots/store-screenshots/iPad-es-v2'
FRAUNCES = 'node_modules/@expo-google-fonts/fraunces'
SF = '/System/Library/Fonts/SFNS.ttf'

W, H = 2064, 2752
INK = (26, 22, 40)
VIOLET = (91, 33, 182)
GREY = (92, 90, 100)

EYEBROW_Y = 150
H1_Y, H2_Y = 268, 424
SUB_Y = 690
SUB_LEAD = 66
DEVICE_TOP = 1010
DEVICE_W = 1800

# (source, eyebrow, headline line 1, headline line 2, subhead lines, bottom gradient tint)
SHOTS = [
    ('01-escanea', 'CON IA', 'Escanea tu', 'programa.',
     ['La IA lee cualquier PDF o foto y extrae cada entrega,', 'examen y tarea en segundos.'],
     (214, 200, 243)),
    ('02-entrega', 'TU SEMANA, MÁS CLARA', 'Adelántate', 'a tu día.',
     ['Lo que sigue, lo que vence y lo que va tarde,', 'todo en un mismo sitio.'],
     (243, 219, 214)),
    ('03-notas', 'PROGRESO REAL', 'Conoce tu', 'nota.',
     ['Tu media se calcula solo con el trabajo', 'que de verdad cuenta.'],
     (208, 196, 242)),
    ('04-semestre', 'UN CALENDARIO MÁS TRANQUILO', 'Mira el', 'semestre.',
     ['Detecta las semanas cargadas', 'antes de que se te echen encima.'],
     (226, 205, 240)),
    ('05-pro', 'SEMORA PRO', 'Haz espacio', 'para aprender.',
     ['Más formas de planificar.', 'Menos tiempo poniéndote al día.'],
     (203, 186, 240)),
]

TOP_TINT = (250, 246, 245)


def fr(weight, size):
    return ImageFont.truetype(os.path.join(FRAUNCES, weight, f'Fraunces_{weight}.ttf'), size)


def gradient(bottom):
    g = Image.new('RGB', (1, H))
    p = g.load()
    for y in range(H):
        t = (y / (H - 1)) ** 1.15          # ease so the colour gathers low, like v2
        p[0, y] = tuple(round(TOP_TINT[i] + (bottom[i] - TOP_TINT[i]) * t) for i in range(3))
    return g.resize((W, H))


def extract_device(path):
    """Crop the bezel-to-bezel device out of the old composition."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    dark = lambda p: sum(p) < 200
    ys = [y for y in range(h) if dark(px[w // 2, y])]
    row = (min(ys) + max(ys)) // 2
    xs = [x for x in range(w) if dark(px[x, row])]
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def centre(d, text, font, y, fill):
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)


os.makedirs(OUT_DIR, exist_ok=True)
f_eye = fr('700Bold', 38)
f_head = fr('800ExtraBold', 150)
f_sub = ImageFont.truetype(SF, 46)

for slug, eyebrow, l1, l2, sub, bottom in SHOTS:
    canvas = gradient(bottom)

    # Device first, so text never sits under it.
    dev = extract_device(os.path.join(SRC_DIR, f'{slug}.png'))
    scale = DEVICE_W / dev.width
    dev = dev.resize((DEVICE_W, round(dev.height * scale)), Image.LANCZOS)

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [(W - DEVICE_W) // 2 + 18, DEVICE_TOP + 26,
         (W + DEVICE_W) // 2 - 18, min(H - 1, DEVICE_TOP + dev.height)],
        radius=70, fill=(60, 40, 110, 90))
    canvas = Image.alpha_composite(
        canvas.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(38))).convert('RGB')

    # The crop is a bounding box, so the bezel's rounded corners still carry a
    # wedge of the old flat-purple field. Mask them out or that purple shows as
    # four bright notches against the new gradient.
    corner = Image.new('L', dev.size, 0)
    ImageDraw.Draw(corner).rounded_rectangle([0, 0, dev.width - 1, dev.height - 1],
                                             radius=58, fill=255)
    canvas.paste(dev, ((W - DEVICE_W) // 2, DEVICE_TOP), corner)

    d = ImageDraw.Draw(canvas)

    # Eyebrow pill
    tw = d.textlength(eyebrow, font=f_eye)
    bb = d.textbbox((0, 0), eyebrow, font=f_eye)
    th = bb[3] - bb[1]
    pad_x, pad_y = 44, 26
    x0, y0 = (W - tw) / 2 - pad_x, EYEBROW_Y
    d.rounded_rectangle([x0, y0, x0 + tw + pad_x * 2, y0 + th + pad_y * 2],
                        radius=(th + pad_y * 2) / 2, fill=(255, 255, 255))
    d.text((x0 + pad_x, y0 + pad_y - bb[1]), eyebrow, font=f_eye, fill=VIOLET)

    centre(d, l1, f_head, H1_Y, INK)
    centre(d, l2, f_head, H2_Y, VIOLET)
    for i, line in enumerate(sub):
        centre(d, line, f_sub, SUB_Y + i * SUB_LEAD, GREY)

    # Nothing may run into the edges.
    for label, text, font in ((slug + ' h1', l1, f_head), (slug + ' h2', l2, f_head),
                              (slug + ' eyebrow', eyebrow, f_eye)):
        assert d.textlength(text, font=font) < W * 0.90, f'{label} too wide'
    for line in sub:
        assert d.textlength(line, font=f_sub) < W * 0.90, f'{slug} subhead too wide'

    out = os.path.join(OUT_DIR, f'{slug}.png')
    canvas.save(out)
    print(f'  {slug:12} {canvas.size[0]}x{canvas.size[1]}  "{l1} {l2}"')

print(f'\nwrote {len(SHOTS)} screenshots to {OUT_DIR}')
