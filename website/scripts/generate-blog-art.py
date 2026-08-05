"""Blog plate generator.

Gradient ground, layered glass geometry, one amber accent, and a study buddy
doing whatever the post is about.

The whole scene animates, not just the character: bars grow, the trend line
draws itself, radar rings push outward, the timer arc sweeps, the calendar cell
lands. Each plate runs on its own offset so a grid of six reads as alive rather
than as one synchronised loop.

`prefers-reduced-motion` is honoured inside each SVG, because these load through
<img> and never see the page's CSS.
"""
import pathlib, sys

W, H = 320, 200
AMBER, AMBER_D = '#FBBF24', '#F59E0B'
CREAM, EYE = '#FFF6E6', '#2A1259'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'public/illustrations')


def style(i, d=0.0, blink=0.0):
    """Every animation class this plate might use, offset by `d`."""
    return f'''    <style>
      .fl{i} {{ transform-box: fill-box; transform-origin: center bottom;
             animation: f{i} 2.6s ease-in-out {d}s infinite; }}
      @keyframes f{i} {{
        0%,100% {{ transform: translateY(0) scale(1,1) }}
        30%     {{ transform: translateY(-7px) scale(0.98,1.03) }}
        60%     {{ transform: translateY(0) scale(1.03,0.97) }}
        80%     {{ transform: translateY(-2px) scale(1,1) }}
      }}
      .wv{i} {{ transform-box: fill-box; transform-origin: 0% 100%;
             animation: w{i} 1.1s ease-in-out {d}s infinite; }}
      @keyframes w{i} {{ 0%,100% {{ transform: rotate(-4deg) }} 50% {{ transform: rotate(20deg) }} }}
      .ey{i} {{ transform-box: fill-box; transform-origin: center;
             animation: b{i} 4.2s ease-in-out {blink}s infinite; }}
      @keyframes b{i} {{ 0%,90%,100% {{ transform: scaleY(1) }} 94% {{ transform: scaleY(0.1) }} }}
      .pl{i} {{ transform-box: fill-box; transform-origin: center;
             animation: p{i} 1.8s ease-in-out infinite; }}
      @keyframes p{i} {{ 0%,100% {{ opacity: .45; transform: scale(.86) }} 50% {{ opacity: 1; transform: scale(1.12) }} }}
      .gr{i} {{ transform-box: fill-box; transform-origin: center bottom;
             animation: g{i} 3.4s cubic-bezier(.34,1.4,.5,1) infinite; }}
      @keyframes g{i} {{ 0% {{ transform: scaleY(.18) }} 34%,100% {{ transform: scaleY(1) }} }}
      .dr{i} {{ animation: d{i} 3.4s ease-in-out infinite; }}
      @keyframes d{i} {{ 0% {{ stroke-dashoffset: 190 }} 45%,100% {{ stroke-dashoffset: 0 }} }}
      .rp{i} {{ transform-box: fill-box; transform-origin: center;
             animation: r{i} 2.6s ease-out infinite; }}
      @keyframes r{i} {{ 0% {{ transform: scale(.45); opacity: .7 }} 100% {{ transform: scale(1.15); opacity: 0 }} }}
      .pop{i} {{ transform-box: fill-box; transform-origin: center;
              animation: o{i} 3.4s cubic-bezier(.34,1.6,.5,1) infinite; }}
      @keyframes o{i} {{ 0%,18% {{ transform: scale(0); opacity: 0 }} 34%,100% {{ transform: scale(1); opacity: 1 }} }}
      .sw{i} {{ animation: s{i} 4.2s linear infinite; }}
      @keyframes s{i} {{ 0% {{ stroke-dashoffset: 314 }} 100% {{ stroke-dashoffset: 0 }} }}
      .sl{i} {{ animation: l{i} 3.2s ease-in-out infinite; }}
      @keyframes l{i} {{ 0%,12% {{ transform: translateX(26px); opacity: 0 }} 32%,100% {{ transform: translateX(0); opacity: 1 }} }}
      @media (prefers-reduced-motion: reduce) {{
        .fl{i}, .wv{i}, .ey{i}, .pl{i}, .gr{i}, .dr{i}, .rp{i}, .pop{i}, .sw{i}, .sl{i} {{
          animation: none; stroke-dashoffset: 0; opacity: 1; transform: none;
        }}
      }}
    </style>
'''


def head(i, g1, g2, orb, d=0.0, blink=0.0):
    return f'''<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <linearGradient id="g{i}" x1="0" y1="0" x2="{W}" y2="{H}" gradientUnits="userSpaceOnUse">
      <stop stop-color="{g1}"/><stop offset="1" stop-color="{g2}"/>
    </linearGradient>
    <radialGradient id="o{i}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate({orb[0]} {orb[1]}) scale({orb[2]})">
      <stop stop-color="{orb[3]}" stop-opacity="{orb[4]}"/><stop offset="1" stop-color="{orb[3]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="s{i}" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0.06"/>
    </linearGradient>
    <filter id="b{i}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>
    <clipPath id="c{i}"><rect width="{W}" height="{H}" rx="12"/></clipPath>
  </defs>
{style(i, d, blink)}  <g clip-path="url(#c{i})">
    <rect width="{W}" height="{H}" fill="url(#g{i})"/>
    <rect width="{W}" height="{H}" fill="url(#o{i})"/>
'''

TAIL = '''  </g>
</svg>
'''


def buddy(i, cx, cy, s=1.0, arms='down'):
    """Positioning and animation stay on separate groups: a CSS transform in
    keyframes REPLACES the transform attribute, so animating the group that
    carries translate()/scale() would discard the placement."""
    g = f'  <g transform="translate({cx} {cy}) scale({s})"><g class="fl{i}">\n'
    g += '    <ellipse cx="0" cy="34" rx="24" ry="4.5" fill="#000" fill-opacity="0.13"/>\n'
    if arms == 'up':
        g += (f'    <path d="M-24 -2 L-34 -20" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>\n'
              f'    <path class="wv{i}" d="M24 -2 L34 -20" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>\n')
    elif arms == 'wave':
        g += (f'    <path d="M-24 2 L-33 12" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>\n'
              f'    <path class="wv{i}" d="M24 -2 L34 -18" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>\n')
    else:
        g += (f'    <path d="M-24 2 L-31 12" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>\n'
              f'    <path d="M24 2 L31 12" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>\n')
    g += f'    <rect x="-26" y="-28" width="52" height="58" rx="24" fill="{CREAM}"/>\n'
    g += (f'    <ellipse cx="-16" cy="4" rx="6" ry="4" fill="{AMBER}" fill-opacity="0.5"/>\n'
          f'    <ellipse cx="16" cy="4" rx="6" ry="4" fill="{AMBER}" fill-opacity="0.5"/>\n')
    g += (f'    <ellipse class="ey{i}" cx="-9" cy="-7" rx="4.2" ry="5.4" fill="{EYE}"/>\n'
          f'    <ellipse class="ey{i}" cx="9" cy="-7" rx="4.2" ry="5.4" fill="{EYE}"/>\n'
          f'    <path d="M-6 8 q6 6 12 0" stroke="{EYE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>\n')
    g += '  </g></g>\n'
    return g


art = {}

# 1 — a syllabus becoming a dated calendar: lines sweep in, the date lands
i = 1
cells = ''
for r in range(3):
    for c in range(4):
        x, y = 190 + c * 28, 62 + r * 28
        if (r, c) == (1, 2):
            cells += f'    <circle cx="{x+11}" cy="{y+11}" r="19" fill="{AMBER}" fill-opacity="0.32" filter="url(#b{i})"/>\n'
            cells += f'    <rect class="pop{i}" x="{x}" y="{y}" width="22" height="22" rx="7" fill="{AMBER}"/>\n'
        else:
            cells += (f'    <rect x="{x}" y="{y}" width="22" height="22" rx="7" fill="#fff" fill-opacity="0.10" '
                      f'stroke="#fff" stroke-opacity="0.20"/>\n')
lines = ''.join(
    f'    <rect x="42" y="{62+k*12}" width="{46 if k % 3 else 34}" height="4" rx="2" fill="#fff" '
    f'fill-opacity="{0.42-k*0.05:.2f}" class="sl{i}" style="animation-delay:{k*0.12}s"/>\n'
    for k in range(5))
art['syllabus-calendar'] = head(i, '#312E81', '#6D28D9', (44, 24, 150, '#A78BFA', 0.55), 0, 1.1) + \
    f'    <rect x="28" y="34" width="80" height="102" rx="12" fill="url(#s{i})" stroke="#fff" stroke-opacity="0.26"/>\n' \
    f'    <rect x="42" y="46" width="36" height="6" rx="3" fill="{AMBER}"/>\n' + lines + cells + \
    f'    <path d="M126 92 h22" stroke="#fff" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round" class="pl{i}"/>\n' \
    f'    <path d="M141 86 l7 6 -7 6" stroke="#fff" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" class="pl{i}"/>\n' + \
    buddy(i, 138, 152, 0.62, arms='wave')

# 2 — a weighted average climbing: bars grow, the trend draws itself
i = 2
bars = ''
for k, h in enumerate([28, 46, 36, 66]):
    x = 44 + k * 30
    top = 152 - h
    fill = f'fill="{AMBER}"' if k == 3 else 'fill="#fff" fill-opacity="0.16" stroke="#fff" stroke-opacity="0.22"'
    bars += (f'    <rect class="gr{i}" style="animation-delay:{k*0.1}s" x="{x}" y="{top}" '
             f'width="20" height="{h}" rx="6" {fill}/>\n')
art['grade-card'] = head(i, '#4C1D95', '#7C3AED', (250, 30, 160, '#F0ABFC', 0.45), 0.35, 2.4) + \
    f'    <circle cx="150" cy="70" r="34" fill="{AMBER}" fill-opacity="0.26" filter="url(#b{i})"/>\n' \
    + bars + \
    f'    <path class="dr{i}" d="M54 116 C 82 110, 106 96, 140 78" stroke="#fff" stroke-opacity="0.6" stroke-width="2.4" stroke-dasharray="190" stroke-linecap="round" fill="none"/>\n' \
    f'    <rect x="40" y="154" width="118" height="3" rx="1.5" fill="#fff" fill-opacity="0.22"/>\n' \
    f'    <rect x="196" y="40" width="84" height="48" rx="13" fill="url(#s{i})" stroke="#fff" stroke-opacity="0.26"/>\n' \
    f'    <text x="238" y="70" font-family="Georgia, serif" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">88.4</text>\n' \
    f'    <circle cx="270" cy="49" r="5" fill="{AMBER}" class="pl{i}"/>\n' + \
    buddy(i, 238, 130, 0.72, arms='up')

# 3 — comparing tools: the check draws in on the one it picked
i = 3
art['trophy-compare'] = head(i, '#3B0764', '#4C1D95', (60, 180, 170, '#C084FC', 0.5), 0.7, 0.4) + \
    f'    <rect x="26" y="80" width="72" height="82" rx="14" fill="#fff" fill-opacity="0.09" stroke="#fff" stroke-opacity="0.18"/>\n' \
    f'    <rect x="222" y="80" width="72" height="82" rx="14" fill="#fff" fill-opacity="0.09" stroke="#fff" stroke-opacity="0.18"/>\n' \
    f'    <rect x="42" y="100" width="40" height="5" rx="2.5" fill="#fff" fill-opacity="0.26"/>\n' \
    f'    <rect x="42" y="114" width="28" height="5" rx="2.5" fill="#fff" fill-opacity="0.18"/>\n' \
    f'    <rect x="238" y="100" width="40" height="5" rx="2.5" fill="#fff" fill-opacity="0.26"/>\n' \
    f'    <rect x="238" y="114" width="28" height="5" rx="2.5" fill="#fff" fill-opacity="0.18"/>\n' \
    f'    <circle cx="160" cy="112" r="56" fill="{AMBER}" fill-opacity="0.22" filter="url(#b{i})"/>\n' \
    f'    <rect x="112" y="62" width="96" height="100" rx="16" fill="url(#s{i})" stroke="#fff" stroke-opacity="0.34"/>\n' \
    f'    <rect x="130" y="132" width="60" height="5" rx="2.5" fill="#fff" fill-opacity="0.5"/>\n' \
    f'    <rect x="138" y="145" width="44" height="5" rx="2.5" fill="#fff" fill-opacity="0.3"/>\n' + \
    buddy(i, 160, 98, 0.78, arms='up') + \
    f'    <circle class="pop{i}" cx="200" cy="70" r="13" fill="{AMBER}"/>\n' \
    f'    <path class="dr{i}" d="M194 70 l4.5 4.5 8 -9" stroke="{EYE}" stroke-width="2.6" stroke-dasharray="26" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n'

# 4 — a reminder arriving in time: rings push out, the notification slides in
i = 4
rings = ''.join(
    f'    <circle class="rp{i}" style="animation-delay:{k*0.85}s" cx="96" cy="96" r="{34+k*18}" '
    f'stroke="#fff" stroke-opacity="{0.30-k*0.07:.2f}" stroke-width="1.8" fill="none"/>\n'
    for k in range(3))
art['bell-reminder'] = head(i, '#1E1B4B', '#4338CA', (270, 40, 165, '#818CF8', 0.55), 1.1, 3.0) + rings + \
    f'    <circle cx="96" cy="96" r="28" fill="{AMBER}" fill-opacity="0.26" filter="url(#b{i})"/>\n' \
    f'    <circle cx="96" cy="96" r="24" fill="url(#s{i})" stroke="#fff" stroke-opacity="0.34"/>\n' \
    f'    <path d="M96 82 v15 h11" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n' \
    f'    <g class="sl{i}">\n' \
    f'      <rect x="170" y="44" width="122" height="34" rx="11" fill="#fff" fill-opacity="0.14" stroke="#fff" stroke-opacity="0.24"/>\n' \
    f'      <circle cx="188" cy="61" r="7" fill="{AMBER}"/>\n' \
    f'      <rect x="202" y="54" width="70" height="5" rx="2.5" fill="#fff" fill-opacity="0.55"/>\n' \
    f'      <rect x="202" y="65" width="46" height="5" rx="2.5" fill="#fff" fill-opacity="0.3"/>\n' \
    f'    </g>\n' \
    f'    <g opacity="0.5" class="sl{i}" style="animation-delay:0.22s">\n' \
    f'      <rect x="178" y="86" width="106" height="28" rx="10" fill="#fff" fill-opacity="0.09" stroke="#fff" stroke-opacity="0.16"/>\n' \
    f'      <rect x="194" y="97" width="58" height="5" rx="2.5" fill="#fff" fill-opacity="0.3"/>\n' \
    f'    </g>\n' + \
    buddy(i, 226, 150, 0.7, arms='wave')

# 5 — a focus interval, actually running down
i = 5
art['tomato-timer'] = head(i, '#4A1D6B', '#7E22CE', (250, 170, 170, '#F5D0FE', 0.42), 1.6, 1.6) + \
    f'    <circle cx="112" cy="100" r="60" fill="{AMBER}" fill-opacity="0.16" filter="url(#b{i})"/>\n' \
    f'    <circle cx="112" cy="100" r="50" stroke="#fff" stroke-opacity="0.16" stroke-width="10" fill="none"/>\n' \
    f'    <circle class="sw{i}" cx="112" cy="100" r="50" stroke="{AMBER}" stroke-width="10" stroke-linecap="round" fill="none" ' \
    f'stroke-dasharray="220 94" transform="rotate(-90 112 100)"/>\n' \
    f'    <text x="112" y="108" font-family="Georgia, serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">18:42</text>\n' \
    + ''.join(
        '    <rect x="{x}" y="66" width="14" height="5" rx="2.5" fill="{fill}" '
        'fill-opacity="{op}"{cls}/>\n'.format(
            x=196 + k * 20,
            fill=AMBER if k < 3 else '#fff',
            op=1 if k < 3 else 0.22,
            cls=f' class="pl{i}"' if k == 2 else '',
        ) for k in range(4)) + \
    f'    <rect x="196" y="46" width="62" height="5" rx="2.5" fill="#fff" fill-opacity="0.42"/>\n' + \
    buddy(i, 232, 128, 0.72, arms='down')

# 6 — a finals week filling in, the exam block landing last
i = 6
DAYS = [[(0, 2, False)], [(1, 3, False), (5, 2, False)], [(0, 2, False)], [(1, 5, True)], [(2, 2, False)]]
week = ''
n = 0
for d, blocks in enumerate(DAYS):
    x = 18 + d * 44
    week += f'    <rect x="{x}" y="22" width="26" height="5" rx="2.5" fill="#fff" fill-opacity="{0.42 if d == 3 else 0.16}"/>\n'
    week += f'    <rect x="{x-4}" y="36" width="38" height="126" rx="10" fill="#fff" fill-opacity="0.06" stroke="#fff" stroke-opacity="0.12"/>\n'
    for start, span, hot in blocks:
        y = 42 + start * 21
        h = span * 21 - 5
        if hot:
            week += f'    <circle cx="{x+13}" cy="{y+h/2}" r="38" fill="{AMBER}" fill-opacity="0.24" filter="url(#b{i})"/>\n'
            week += (f'    <rect class="gr{i}" style="animation-delay:0.5s" x="{x}" y="{y}" width="30" height="{h}" '
                     f'rx="8" fill="{AMBER}"/>\n')
        else:
            week += (f'    <rect class="gr{i}" style="animation-delay:{n*0.09}s" x="{x}" y="{y}" width="30" height="{h}" '
                     f'rx="8" fill="#fff" fill-opacity="0.16" stroke="#fff" stroke-opacity="0.22"/>\n')
        n += 1
art['book-stack'] = head(i, '#2E1065', '#5B21B6', (40, 30, 150, '#A78BFA', 0.5), 2.1, 0.9) + week + \
    buddy(i, 264, 108, 0.76, arms='down')

for name, body in art.items():
    OUT.joinpath(f'{name}.svg').write_text(body + TAIL)
    print(f'{name:22} {len(body)+len(TAIL):>5} bytes')
