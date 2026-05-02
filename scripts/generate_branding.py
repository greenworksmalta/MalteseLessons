"""
Generate MaltiOnTheGo brand assets — app icons + hero splash — to match the
mockup in IMG_2265: navy 'malti' wordmark, red Bradley-Hand 'on the go'
script underline, speech-bubble accent, cream background.

Outputs:
  icon-512.png        Square app icon, balanced for both 512 and stores
  icon-192.png        Smaller app icon (downscaled from 512)
  logo.png            1200x600 horizontal wordmark for hero / share images
  splash.png          1200x800 splash backdrop with decorative balcony silhouette

Run:
  python scripts/generate_branding.py
"""
import math
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Brand palette pulled from IMG_2265
CREAM = (250, 246, 236, 255)          # background
NAVY = (31, 56, 102, 255)             # 'malti' wordmark, accents
RED = (183, 49, 39, 255)              # 'on the go' script + balcony
RED_DARK = (148, 38, 30, 255)
WHITE = (255, 255, 255, 255)
INK_LIGHT = (86, 97, 109, 255)        # subtle accents

WIN_FONTS = pathlib.Path(r"C:/Windows/Fonts")
FONT_BOLD = str(WIN_FONTS / "arialbd.ttf")        # 'malti'
FONT_SCRIPT = str(WIN_FONTS / "BRADHITC.TTF")     # 'on the go'
FONT_BODY = str(WIN_FONTS / "calibri.ttf")        # tagline


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox[0], bbox[1]


def draw_speech_bubble(draw: ImageDraw.ImageDraw, cx: float, cy: float,
                       w: float, h: float, outline=NAVY, fill=WHITE,
                       dot=RED, stroke=8):
    """Rounded speech bubble centred at (cx, cy) with three coloured dots."""
    left = cx - w / 2
    top = cy - h / 2
    right = cx + w / 2
    bottom = cy + h / 2
    radius = h / 2
    draw.rounded_rectangle((left, top, right, bottom), radius=radius,
                           fill=fill, outline=outline, width=stroke)
    # tail (small triangle bottom-left)
    tx = left + w * 0.22
    ty = bottom
    tw = h * 0.35
    draw.polygon([(tx, ty - 2), (tx + tw, ty - 2), (tx + tw * 0.45, ty + tw * 0.7)],
                 fill=fill, outline=outline)
    # cover the seam
    draw.line([(tx + 1, ty - 2), (tx + tw - 1, ty - 2)], fill=fill, width=2)
    # three dots
    dot_r = h * 0.16
    spacing = w * 0.22
    for i in (-1, 0, 1):
        dx = cx + spacing * i
        draw.ellipse((dx - dot_r, cy - dot_r, dx + dot_r, cy + dot_r), fill=dot)


def draw_brushy_underline(draw: ImageDraw.ImageDraw, x0, x1, y, color=RED,
                          thickness=10):
    """A slightly tilted, tapered underline to feel hand-drawn."""
    # Multiple overlapping lines with slight offsets to give a brush-stroke feel
    cx = (x0 + x1) / 2
    width = x1 - x0
    # Main line — tilts slightly downward then up at the end
    pts = []
    n = 40
    for i in range(n + 1):
        t = i / n
        x = x0 + width * t
        y_off = math.sin(t * math.pi) * 4 - 3 * t  # gentle dip
        pts.append((x, y + y_off))
    draw.line(pts, fill=color, width=thickness, joint="curve")
    # tiny tail flick at the end (like the mockup)
    tx = x1
    draw.line([(tx, y - 4), (tx + width * 0.06, y - 18)], fill=color,
              width=int(thickness * 0.7), joint="curve")


def draw_balcony_silhouette(canvas: Image.Image, cx: int, cy: int, scale: float,
                            color=(214, 78, 60, 110)):
    """A simple stylised Maltese gallarija silhouette as a soft accent."""
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # main box
    bw, bh = int(220 * scale), int(280 * scale)
    x0, y0 = cx - bw // 2, cy - bh // 2
    d.rectangle((x0, y0, x0 + bw, y0 + bh), fill=color)
    # roof overhang
    d.rectangle((x0 - 8, y0, x0 + bw + 8, y0 + 14), fill=color)
    # window divisions
    pane_color = (color[0], color[1], color[2], min(255, color[3] + 40))
    for px in range(4):
        x = x0 + 12 + px * (bw - 24) // 4
        d.line([(x, y0 + 24), (x, y0 + bh - 30)], fill=pane_color, width=4)
    for py in range(3):
        y = y0 + 30 + py * (bh - 60) // 3
        d.line([(x0 + 8, y), (x0 + bw - 8, y)], fill=pane_color, width=4)
    # small support brackets at the bottom
    for offset in (-bw // 3, 0, bw // 3):
        bx = cx + offset
        d.polygon([(bx - 12, y0 + bh), (bx + 12, y0 + bh), (bx, y0 + bh + 18)],
                  fill=color)
    # blur slightly so it reads as a backdrop accent, not a focal element
    overlay = overlay.filter(ImageFilter.GaussianBlur(1.5))
    canvas.alpha_composite(overlay)


def make_icon(size: int = 512) -> Image.Image:
    img = Image.new("RGBA", (size, size), CREAM)
    d = ImageDraw.Draw(img)

    # Sizes scale with the canvas so 192/512 both work
    s = size / 512.0

    # ── 'malti' wordmark — bold navy ─────────────────
    f_malti = font(FONT_BOLD, int(180 * s))
    label_a = "malti"
    aw, ah, aox, aoy = text_size(d, label_a, f_malti)
    ax = (size - aw) / 2 - aox
    ay = int(size * 0.20) - aoy
    d.text((ax, ay), label_a, fill=NAVY, font=f_malti)

    # ── 'on the go' — red script ─────────────────────
    f_otg = font(FONT_SCRIPT, int(110 * s))
    label_b = "on the go"
    bw, bh, box, boy = text_size(d, label_b, f_otg)
    bx = (size - bw) / 2 - box + int(8 * s)  # nudge right like the mockup
    by = ay + ah + int(28 * s) - boy
    d.text((bx, by), label_b, fill=RED, font=f_otg)

    # underline beneath "on the go"
    underline_y = by + bh + int(18 * s)
    draw_brushy_underline(d, bx + int(10 * s), bx + bw - int(8 * s),
                          underline_y, color=RED, thickness=int(12 * s))

    # ── speech bubble — bottom centre ────────────────
    bubble_w = int(220 * s)
    bubble_h = int(96 * s)
    bubble_cx = size / 2
    bubble_cy = size - int(110 * s)
    draw_speech_bubble(d, bubble_cx, bubble_cy, bubble_w, bubble_h,
                       outline=NAVY, fill=WHITE, dot=RED,
                       stroke=int(7 * s))
    return img


def make_logo(width: int = 1200, height: int = 600) -> Image.Image:
    img = Image.new("RGBA", (width, height), CREAM)

    # subtle Maltese balcony silhouette on the left, like the poster
    draw_balcony_silhouette(img, cx=int(width * 0.18), cy=int(height * 0.55),
                            scale=1.4, color=(183, 49, 39, 90))

    d = ImageDraw.Draw(img)

    # 'malti' navy
    f_malti = font(FONT_BOLD, 240)
    label_a = "malti"
    aw, ah, aox, aoy = text_size(d, label_a, f_malti)
    ax = int(width * 0.42) - aox
    ay = int(height * 0.18) - aoy
    d.text((ax, ay), label_a, fill=NAVY, font=f_malti)

    # 'on the go' script red
    f_otg = font(FONT_SCRIPT, 160)
    label_b = "on the go"
    bw, bh, box, boy = text_size(d, label_b, f_otg)
    bx = ax + int(36) - box
    by = ay + ah + 28 - boy
    d.text((bx, by), label_b, fill=RED, font=f_otg)
    draw_brushy_underline(d, bx + 14, bx + bw - 8, by + bh + 22,
                          color=RED, thickness=14)

    # speech bubble accent — to the right of "on the go"
    bub_cx = bx + bw + 130
    bub_cy = by + bh / 2 + 20
    draw_speech_bubble(d, bub_cx, bub_cy, 190, 80,
                       outline=NAVY, fill=WHITE, dot=RED, stroke=7)

    return img


def make_splash(width: int = 1200, height: int = 800) -> Image.Image:
    """Splash / backdrop image for the hero or PWA splash screen."""
    img = Image.new("RGBA", (width, height), CREAM)

    # Soft cream-to-warm gradient top to bottom
    grad = Image.new("RGBA", (1, height), (0, 0, 0, 0))
    for y in range(height):
        t = y / height
        r = int(250 - 18 * t)
        g = int(246 - 22 * t)
        b = int(236 - 26 * t)
        grad.putpixel((0, y), (r, g, b, 255))
    img.paste(grad.resize((width, height)))

    # Maltese balcony silhouette on the left
    draw_balcony_silhouette(img, cx=int(width * 0.13),
                            cy=int(height * 0.50),
                            scale=1.7,
                            color=(183, 49, 39, 100))

    # Soft second balcony top-right (smaller, more washed-out) for balance
    draw_balcony_silhouette(img, cx=int(width * 0.92),
                            cy=int(height * 0.78),
                            scale=0.9,
                            color=(183, 49, 39, 50))

    d = ImageDraw.Draw(img)

    # main wordmark, centred
    f_malti = font(FONT_BOLD, 270)
    label_a = "malti"
    aw, ah, aox, aoy = text_size(d, label_a, f_malti)
    ax = (width - aw) / 2 - aox
    ay = int(height * 0.22) - aoy
    d.text((ax, ay), label_a, fill=NAVY, font=f_malti)

    f_otg = font(FONT_SCRIPT, 170)
    label_b = "on the go"
    bw, bh, box, boy = text_size(d, label_b, f_otg)
    bx = (width - bw) / 2 - box + 12
    by = ay + ah + 36 - boy
    d.text((bx, by), label_b, fill=RED, font=f_otg)
    draw_brushy_underline(d, bx + 14, bx + bw - 8, by + bh + 22,
                          color=RED, thickness=14)

    # speech bubble
    bub_cx = width / 2
    bub_cy = by + bh + 130
    draw_speech_bubble(d, bub_cx, bub_cy, 220, 96,
                       outline=NAVY, fill=WHITE, dot=RED, stroke=8)

    # tagline below
    f_tag = font(FONT_BODY, 38)
    tagline = "Maltese for life and work in Malta"
    tw, th, tox, toy = text_size(d, tagline, f_tag)
    tx = (width - tw) / 2 - tox
    ty = bub_cy + 80 - toy
    d.text((tx, ty), tagline, fill=INK_LIGHT, font=f_tag)

    return img


def main():
    out = ROOT
    icon_512 = make_icon(512)
    icon_512.save(out / "icon-512.png", optimize=True)
    icon_192 = icon_512.resize((192, 192), Image.LANCZOS)
    icon_192.save(out / "icon-192.png", optimize=True)
    logo = make_logo(1200, 600)
    logo.save(out / "logo.png", optimize=True)
    splash = make_splash(1200, 800)
    splash.save(out / "splash.png", optimize=True)
    print(f"wrote icon-512.png ({icon_512.size}), icon-192.png, logo.png ({logo.size}), splash.png ({splash.size})")


if __name__ == "__main__":
    main()
