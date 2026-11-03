# Iconos de la app instalada (static/icons y apple-touch-icon): degradado azul de los botones + el pájaro de assets/logo/logo.png.
# Uso: python scripts/process-icons.py   (requiere Pillow; se corre desde la raíz del repo)
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os
src = Image.open('assets/logo/logo.png').convert('RGBA')
bird = src.crop(src.split()[-1].getbbox())

def gradient(size):
    # Mismo degradado que los botones: accent → accent-dark
    top, bot = (0x6e, 0x8c, 0xff), (0x3a, 0x55, 0xc8)
    g = Image.new('RGB', (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return g.resize((size, size)).convert('RGBA')

def sticker(img, outline):
    # Contorno blanco alrededor del pájaro para que no se pierda sobre el azul
    pad = outline * 2
    a = Image.new('L', (img.width + pad * 2, img.height + pad * 2), 0)
    a.paste(img.split()[-1], (pad, pad))
    grow = a.filter(ImageFilter.MaxFilter(outline * 2 + 1)).filter(ImageFilter.GaussianBlur(outline / 6))
    grow = grow.point(lambda v: 255 if v > 100 else 0)
    out = Image.new('RGBA', a.size, (255, 255, 255, 0))
    out.paste((255, 255, 255, 255), mask=grow)
    out.alpha_composite(Image.merge('RGBA', (*[Image.new('L', a.size, 0)] * 3, Image.new('L', a.size, 0))))
    fg = Image.new('RGBA', a.size, (0, 0, 0, 0)); fg.paste(img, (pad, pad))
    out.alpha_composite(fg)
    return out

def render(size, bird_h, rounded, full_bleed_bg=True):
    S = size * 2  # supermuestreo
    bg = gradient(S)
    # brillo suave arriba, como el de los botones
    shine = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shine).ellipse((-S * .25, -S * .75, S * 1.25, S * .45), fill=(255, 255, 255, 38))
    bg.alpha_composite(shine)
    b = bird.resize((round(bird.width * (S * bird_h / bird.height)), round(S * bird_h)), Image.LANCZOS)
    st = sticker(b, max(4, round(S * 0.012)))
    # sombra
    sh = Image.new('RGBA', st.size, (0, 0, 0, 0)); sh.paste((20, 30, 90, 110), mask=st.split()[-1])
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.012))
    x, y = (S - st.width) // 2, (S - st.height) // 2 + round(S * 0.01)
    bg.alpha_composite(sh, (x, y + round(S * 0.012)))
    bg.alpha_composite(st, (x, y))
    if rounded:
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * 0.22), fill=255)
        bg.putalpha(m)
    return bg.resize((size, size), Image.LANCZOS)

os.makedirs('static/icons', exist_ok=True)
render(512, 0.74, True).save('static/icons/icon-512.png', optimize=True)
render(192, 0.74, True).save('static/icons/icon-192.png', optimize=True)
render(512, 0.58, False).save('static/icons/maskable-512.png', optimize=True)
render(180, 0.72, False).convert('RGB').save('static/apple-touch-icon.png', optimize=True)
