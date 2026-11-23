"""Gera um ícone moderno multi-resolução (assets/icon.ico e assets/icon.png) para o app."""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(ASSETS, exist_ok=True)


def create_icon(size=512):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Gradiente vertical Indigo -> Cyan em squircle arredondado
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad)
    c1 = (79, 70, 229)   # #4F46E5
    c2 = (14, 165, 233)  # #0EA5E9
    for y in range(size):
        t = y / (size - 1)
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        gdraw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    pad = int(size * 0.05)
    mdraw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    # Brilho sutil interno
    draw.rounded_rectangle(
        [pad + 6, pad + 6, size - pad - 6, size - pad - 6],
        radius=int(size * 0.20),
        outline=(255, 255, 255, 55),
        width=6,
    )

    # Silhueta minimalista de controle (gamepad) branco nítido
    cx, cy = size // 2, int(size * 0.52)
    # Corpo central + empunhaduras
    draw.rounded_rectangle([cx - 125, cy - 68, cx + 125, cy + 52], radius=58, fill=(255, 255, 255, 248))
    draw.ellipse([cx - 156, cy - 52, cx - 40, cy + 102], fill=(255, 255, 255, 248))
    draw.ellipse([cx + 40, cy - 52, cx + 156, cy + 102], fill=(255, 255, 255, 248))
    # Recorte inferior central
    draw.ellipse([cx - 64, cy + 20, cx + 64, cy + 115], fill=(38, 128, 231, 255))

    # D-pad esquerdo (azul-escuro)
    dark = (15, 23, 42, 255)
    dx, dy = cx - 82, cy - 6
    draw.rounded_rectangle([dx - 11, dy - 30, dx + 11, dy + 30], radius=5, fill=dark)
    draw.rounded_rectangle([dx - 30, dy - 11, dx + 30, dy + 11], radius=5, fill=dark)

    # Botões ABXY à direita (cores vibrantes)
    bx, by = cx + 82, cy - 6
    r_btn = 12
    draw.ellipse([bx - r_btn, by - 26 - r_btn, bx + r_btn, by - 26 + r_btn], fill=(245, 158, 11, 255))  # Y
    draw.ellipse([bx - r_btn, by + 26 - r_btn, bx + r_btn, by + 26 + r_btn], fill=(16, 185, 129, 255))  # A
    draw.ellipse([bx - 26 - r_btn, by - r_btn, bx - 26 + r_btn, by + r_btn], fill=(14, 165, 233, 255))  # X
    draw.ellipse([bx + 26 - r_btn, by - r_btn, bx + 26 + r_btn, by + r_btn], fill=(244, 63, 94, 255))   # B

    # Ponto neon verde de status no topo-direito
    draw.ellipse([size - 118, 56, size - 62, 112], fill=(16, 185, 129, 255), outline=(255, 255, 255, 255), width=7)
    return img


if __name__ == "__main__":
    icon = create_icon(512)
    png_path = os.path.join(ASSETS, "icon.png")
    ico_path = os.path.join(ASSETS, "icon.ico")
    icon.save(png_path, format="PNG")
    icon.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("Generated:", png_path, "and", ico_path)
