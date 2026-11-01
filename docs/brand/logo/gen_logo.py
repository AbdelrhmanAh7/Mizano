"""Generates the Jarda logo SVGs. Wordmarks are outlined glyphs (Inter Bold, Noto Sans Arabic Bold,
both SIL OFL) shaped with HarfBuzz, so Arabic joins correctly and renders the same with no fonts."""
import sys, os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))

TEAL_A, TEAL_B, AMBER = '#0D9488', '#085041', '#EF9F27'
INK_LIGHT, INK_DARK = '#1C1917', '#F5F5F4'
AR_LIGHT, AR_DARK = '#0F766E', '#5EEAD4'
TITLE = 'Jarda · جردة'


def shape(font_file, text, direction):
    blob = hb.Blob.from_file_path(font_file)
    face = hb.Face(blob)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    buf.direction = direction
    hb.shape(font, buf, {'kern': True, 'liga': True})
    return face.upem, buf.glyph_infos, buf.glyph_positions


def outline(font_file, text, direction, size, x, baseline):
    """Path data of `text` at `size` px with its left edge at x and baseline at `baseline`.
    Returns (d, width, top, bottom) in px."""
    tt = TTFont(font_file)
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    upem, infos, pos = shape(font_file, text, direction)
    s = size / upem
    pen = SVGPathPen(gs)
    bpen = BoundsPen(gs)
    cx = 0
    for info, p in zip(infos, pos):
        name = order[info.codepoint]
        t = (s, 0, 0, -s, x + (cx + p.x_offset) * s, baseline - p.y_offset * s)
        gs[name].draw(TransformPen(pen, t))
        gs[name].draw(TransformPen(bpen, t))
        cx += p.x_advance
    xmin, ymin, xmax, ymax = bpen.bounds
    return pen.getCommands(), cx * s, ymin, ymax, xmin, xmax


LAT = os.path.join(HERE, 'fonts/Inter-Bold.ttf')
ARB = os.path.join(HERE, 'fonts/NotoSansArabic-Bold.ttf')


def mark(stroke='#FFFFFF', dot=AMBER, sw=5.5):
    """The mark on a 64 grid: a ledger line that turns down into a hook (Latin J, and the bowl of the
    Arabic jeem ج with its dot inside)."""
    return (
        f'<path d="M17 18H47M38 18V35A10 10 0 0 1 18 35" fill="none" stroke="{stroke}" '
        f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<circle cx="28" cy="33.5" r="4" fill="{dot}"/>'
    )


def tile(gid='jg', rx=15):
    return (
        f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{TEAL_A}"/><stop offset="1" stop-color="{TEAL_B}"/>'
        f'</linearGradient></defs><rect width="64" height="64" rx="{rx}" fill="url(#{gid})"/>'
    )


def svg(w, h, body, title=TITLE):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" '
        f'height="{h:g}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
    )


def write(name, text):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(text)


# ---- icon tiles ----
write('logo-icon.svg', svg(64, 64, tile() + mark()))
write(
    'logo-icon-circle.svg',
    svg(64, 64, tile().replace('rx="15"', 'rx="32"') + f'<g transform="translate(3.2 3.2) scale(.9)">{mark()}</g>'),
)
# Mark only, no tile (teal on light backgrounds) and a single-colour silhouette for pinned tabs.
write('logo-mark.svg', svg(64, 64, f'<g transform="translate(0 4)">{mark(TEAL_A)}</g>'))
write('logo-mark-dark.svg', svg(64, 64, f'<g transform="translate(0 4)">{mark("#2DD4BF")}</g>'))
write('safari-pinned-tab.svg', svg(64, 64, f'<g transform="translate(0 4)">{mark("#000000", "#000000")}</g>'))


# Small favicon: thicker strokes so the mark survives 16 px.
write('favicon.svg', svg(64, 64, tile(rx=14) + mark(sw=7.5).replace('r="4"', 'r="5"')))
# Full-bleed square (iOS and maskable icons crop it themselves); `k` scales the mark into the safe zone.
def bleed(k):
    off = 32 - 32 * k
    return svg(64, 64, tile(rx=0) + f'<g transform="translate({off:g} {off:g}) scale({k:g})">{mark()}</g>')
write('bleed-apple.svg', bleed(0.86))
write('bleed-maskable.svg', bleed(0.72))

# ---- wordmarks ----
def words(x, baseline, size, ink, ar_ink, sep_color, gap=None):
    """Jarda | جردة on one line from x. Returns (svg, right edge)."""
    d1, w1, *_ = outline(LAT, 'Jarda', 'ltr', size, x, baseline)
    gap = gap or size * 0.42
    sx = x + w1 + gap
    sep = (
        f'<rect x="{sx:.2f}" y="{baseline - size * 0.72:.2f}" width="{max(1.5, size * 0.05):.2f}" '
        f'height="{size * 0.8:.2f}" rx="1" fill="{sep_color}"/>'
    )
    ax = sx + gap
    d2, w2, *_ = outline(ARB, 'جردة', 'rtl', size * 1.02, ax, baseline)
    body = f'<path fill="{ink}" d="{d1}"/>{sep}<path fill="{ar_ink}" d="{d2}"/>'
    return body, ax + w2


def full(dark):
    ink, ar = (INK_DARK, AR_DARK) if dark else (INK_LIGHT, AR_LIGHT)
    sep = '#57534E' if dark else '#D6D3D1'
    body, right = words(84, 50, 32, ink, ar, sep)
    w = right + 8
    return svg(round(w), 80, f'<g transform="translate(8 8)">{tile("jg" + ("d" if dark else ""))}{mark()}</g>' + body)


def stacked(dark):
    ink, ar = (INK_DARK, AR_DARK) if dark else (INK_LIGHT, AR_LIGHT)
    d1, w1, *_ = outline(LAT, 'Jarda', 'ltr', 34, 0, 0)
    d2, w2, *_ = outline(ARB, 'جردة', 'rtl', 30, 0, 0)
    W = max(w1, w2, 80) + 32
    lat_x = (W - w1) / 2
    ar_x = (W - w2) / 2
    d1, *_ = outline(LAT, 'Jarda', 'ltr', 34, lat_x, 122)
    d2, *_ = outline(ARB, 'جردة', 'rtl', 30, ar_x, 166)
    t = f'<g transform="translate({(W - 72) / 2:.2f} 8) scale(1.125)">{tile("jg" + ("d" if dark else ""))}{mark()}</g>'
    return svg(round(W), 184, t + f'<path fill="{ink}" d="{d1}"/><path fill="{ar}" d="{d2}"/>')


def wordmark(dark):
    ink, ar = (INK_DARK, AR_DARK) if dark else (INK_LIGHT, AR_LIGHT)
    sep = '#57534E' if dark else '#D6D3D1'
    body, right = words(4, 38, 32, ink, ar, sep)
    return svg(round(right + 4), 52, body)


for dark in (False, True):
    sfx = '-dark' if dark else ''
    write(f'logo-full{sfx}.svg', full(dark))
    write(f'logo-stacked{sfx}.svg', stacked(dark))
    write(f'logo-wordmark{sfx}.svg', wordmark(dark))
print('ok')
