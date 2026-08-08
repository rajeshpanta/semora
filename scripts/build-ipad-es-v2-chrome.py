"""
Translate the marketing chrome on the English iPad-v2 screenshots into Spanish.

Repaints the band above the device (eyebrow pill + headline + subhead) and
redraws it in Spanish, matching the v2 treatment: white pill with violet Fraunces
caps, Fraunces display headline with the second line in violet, SF subhead.

LIMITATION, stated plainly: the UI *inside* the device stays English. That text
is baked into the generated pixels — these v2 shots are AI-rendered mockups, not
real app captures — so it cannot be re-rendered without regenerating the image.
This produces a Spanish headline over an English screen.

The band background is rebuilt by blending each row's far-left and far-right
pixels, which preserves the vertical gradient exactly and approximates the soft
horizontal blobs. Verified clean on these backgrounds; they are low-contrast
enough that a linear blend leaves no banding.
"""
from PIL import Image, ImageDraw, ImageFont
import os

SRC = 'screenshots/store-screenshots/iPad-v2'
OUT = 'screenshots/store-screenshots/iPad-es-v2-chrome'
FRAUNCES = 'node_modules/@expo-google-fonts/fraunces'
SF = '/System/Library/Fonts/SFNS.ttf'

INK = (17, 17, 20)
VIOLET = (91, 33, 182)
GREY = (86, 84, 94)

# file -> (eyebrow, headline line 1, headline line 2, subhead lines)
SHOTS = {
    'iPad-1': ('TU SEMANA, MÁS CLARA', 'Adelántate', 'a tu día.',
               ['Lo que sigue, lo que vence y lo que va tarde,', 'todo en un mismo sitio.']),
    'iPad-5': ('CON IA', 'Escanea tu', 'programa',
               ['La IA lee cualquier PDF o foto y extrae cada', 'entrega, examen y tarea en segundos.']),
    'iPad-3': ('PROGRESO REAL', 'Conoce tu', 'nota.',
               ['Tu media se calcula solo con el trabajo', 'que de verdad cuenta.']),
    'iPad-4': ('CANVAS, SIMPLIFICADO', 'Tu campus,', 'conectado.',
               ['Tus tareas entran solas', 'y tu semestre se mantiene al día.']),
    'iPad-6': ('CANVAS SE SINCRONIZA SOLO', 'Canvas que se', 'actualiza solo',
               ['Semora importa tus tareas y reprograma los recordatorios',
                'cuando cambia una fecha o llega una nota.']),
    'iPad-2': ('UN CALENDARIO MÁS TRANQUILO', 'Mira el', 'semestre completo.',
               ['Detecta las semanas cargadas', 'antes de que se te echen encima.']),
    'iPad-7': ('SEMORA PRO', 'Haz espacio', 'para aprender.',
               ['Más formas de planificar.', 'Menos tiempo poniéndote al día.']),
}


def fr(weight, size):
    return ImageFont.truetype(os.path.join(FRAUNCES, weight, f'Fraunces_{weight}.ttf'), size)


def device_top(im):
    """First row that is mostly dark across the middle — the bezel's top edge."""
    W, H = im.size
    px = im.load()
    for y in range(int(H * 0.25), H):
        dark = sum(1 for x in range(W // 4, 3 * W // 4, 8) if sum(px[x, y]) < 260)
        if dark > (W // 2 // 8) * 0.8:
            return y
    return int(H * 0.36)


os.makedirs(OUT, exist_ok=True)

for name, (eyebrow, l1, l2, sub) in SHOTS.items():
    im = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGB')
    W, H = im.size
    top = device_top(im)
    band_top, band_bot = 90, max(120, top - 55)

    px = im.load()
    for y in range(band_top, band_bot):
        left, right = px[36, y], px[W - 37, y]
        for x in range(W):
            t = x / (W - 1)
            px[x, y] = tuple(round(left[i] + (right[i] - left[i]) * t) for i in range(3))

    d = ImageDraw.Draw(im)
    # Scale type to the canvas so this works if the source size ever changes.
    f_eye = fr('700Bold', round(W * 0.0165))
    f_head = fr('800ExtraBold', round(W * 0.073))
    f_sub = ImageFont.truetype(SF, round(W * 0.0225))

    span = band_bot - band_top
    pill_y = band_top + round(span * 0.04)
    h1_y = band_top + round(span * 0.17)
    h2_y = h1_y + round(W * 0.077)
    sub_y = h2_y + round(W * 0.098)

    tw = d.textlength(eyebrow, font=f_eye)
    bb = d.textbbox((0, 0), eyebrow, font=f_eye)
    th = bb[3] - bb[1]
    pad_x, pad_y = round(W * 0.022), round(W * 0.013)
    x0 = (W - tw) / 2 - pad_x
    d.rounded_rectangle([x0, pill_y, x0 + tw + pad_x * 2, pill_y + th + pad_y * 2],
                        radius=(th + pad_y * 2) / 2, fill=(255, 255, 255))
    d.text((x0 + pad_x, pill_y + pad_y - bb[1]), eyebrow, font=f_eye, fill=VIOLET)

    for text, y, fill in ((l1, h1_y, INK), (l2, h2_y, VIOLET)):
        d.text(((W - d.textlength(text, font=f_head)) / 2, y), text, font=f_head, fill=fill)
    for i, line in enumerate(sub):
        d.text(((W - d.textlength(line, font=f_sub)) / 2, sub_y + i * round(W * 0.031)),
               line, font=f_sub, fill=GREY)

    for label, text, font in ((f'{name} h1', l1, f_head), (f'{name} h2', l2, f_head),
                              (f'{name} eyebrow', eyebrow, f_eye), *[(f'{name} sub{i}', s, f_sub)
                                                                     for i, s in enumerate(sub)]):
        assert d.textlength(text, font=font) < W * 0.90, f'{label} too wide'
    assert sub_y + round(W * 0.031) < top - 10, f'{name}: subhead collides with the device'

    im.save(os.path.join(OUT, f'{name}.png'))
    print(f'  {name}  band {band_top}-{band_bot}  device@{top}  "{l1} {l2}"')

print(f'\nwrote {len(SHOTS)} to {OUT}')
