"""
DSV OpsPulse — App Icon Generator
Generates a premium "Pulse Orb" icon using Pillow + NumPy.

Design:
  • Deep navy background with radial indigo glow
  • Teal EKG/heartbeat pulse line through the centre
  • "DSV" wordmark top-left area
  • "OP" large bold letters as the core identity
  • Outer glow ring in teal
"""

import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Palette ───────────────────────────────────────────────────────────────────
NAVY      = (15,  23,  42)       # #0F172A
INDIGO    = (99,  102, 241)      # #6366F1
INDIGO_MID= (67,  56, 202)       # #4338CA
TEAL      = (20,  184, 166)      # #14B8A6
TEAL_GLOW = (20,  184, 166, 180) # semi-transparent teal
WHITE     = (255, 255, 255)
WHITE_DIM = (255, 255, 255, 200)

SIZE = 1024   # master size; will be resized for each density

def make_icon(size=1024) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    cx = cy = size // 2
    r  = size // 2

    # ── 1. Circular background with radial gradient ────────────────────────
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_arr = np.zeros((size, size, 4), dtype=np.uint8)

    ys, xs = np.ogrid[:size, :size]
    dist = np.sqrt((xs - cx)**2 + (ys - cy)**2).astype(np.float32)
    norm = np.clip(dist / r, 0, 1)                  # 0=centre, 1=edge

    # Blend INDIGO (centre) → NAVY (edge)
    for c, (ci, ni) in enumerate(zip(INDIGO, NAVY)):
        bg_arr[:, :, c] = (ci * (1 - norm) + ni * norm).astype(np.uint8)

    # Alpha: full circle, anti-aliased edge
    alpha = np.clip((r - dist) * 2, 0, 255).astype(np.uint8)
    bg_arr[:, :, 3] = alpha

    bg = Image.fromarray(bg_arr, 'RGBA')
    img = Image.alpha_composite(img, bg)

    # ── 2. Inner glow ring (teal, near edge) ──────────────────────────────
    glow_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_arr   = np.zeros((size, size, 4), dtype=np.uint8)
    ring_r   = r * 0.88
    ring_w   = size * 0.025
    ring_dist = np.abs(dist - ring_r)
    ring_a    = np.clip(1 - ring_dist / ring_w, 0, 1)
    ring_a   *= (dist < r).astype(np.float32)       # clip to circle
    ring_a   *= 0.55                                  # opacity

    glow_arr[:, :, 0] = TEAL[0]
    glow_arr[:, :, 1] = TEAL[1]
    glow_arr[:, :, 2] = TEAL[2]
    glow_arr[:, :, 3] = (ring_a * 255).astype(np.uint8)

    glow_img = Image.fromarray(glow_arr, 'RGBA')
    # soften
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=size * 0.012))
    img = Image.alpha_composite(img, glow_img)

    # ── 3. Centre spotlight (soft white glow) ────────────────────────────
    spot_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    spot_arr   = np.zeros((size, size, 4), dtype=np.uint8)
    spot_r     = r * 0.5
    spot_a     = np.clip(1 - dist / spot_r, 0, 1) ** 2 * 0.18
    spot_a    *= (dist < r).astype(np.float32)
    spot_arr[:, :, :3] = 255
    spot_arr[:, :, 3]  = (spot_a * 255).astype(np.uint8)
    spot_img   = Image.fromarray(spot_arr, 'RGBA')
    img = Image.alpha_composite(img, spot_img)

    # ── 4. EKG / Heartbeat pulse line ────────────────────────────────────
    draw      = ImageDraw.Draw(img, 'RGBA')
    mid_y     = cy
    lw        = max(2, size // 80)   # line weight scales with size

    # Build the EKG path (relative coords, then scale to size)
    # Pattern: flat → small bump → flat → sharp spike up → sharp spike down → flat → repeat
    def ekg_points(x_start, x_end, y_mid, amplitude, s):
        """Generate EKG keypoints across x range."""
        pts = []
        seg = (x_end - x_start)
        # baseline in
        pts += [(x_start, y_mid), (x_start + seg*0.10, y_mid)]
        # small P-wave bump
        pts += [(x_start + seg*0.18, y_mid - amplitude*0.18),
                (x_start + seg*0.22, y_mid)]
        # flat PR segment
        pts += [(x_start + seg*0.28, y_mid)]
        # Q dip
        pts += [(x_start + seg*0.32, y_mid + amplitude*0.15)]
        # R spike up  ← the big peak
        pts += [(x_start + seg*0.36, y_mid - amplitude)]
        # S dip
        pts += [(x_start + seg*0.40, y_mid + amplitude*0.20)]
        # ST segment back to baseline
        pts += [(x_start + seg*0.48, y_mid)]
        # T wave (small positive bump)
        pts += [(x_start + seg*0.56, y_mid - amplitude*0.25),
                (x_start + seg*0.64, y_mid)]
        # baseline out
        pts += [(x_end, y_mid)]
        return pts

    amp   = size * 0.165          # spike height
    y_mid = cy + size * 0.02      # slightly below centre

    pts = ekg_points(
        x_start=int(size * 0.06),
        x_end=int(size * 0.94),
        y_mid=y_mid,
        amplitude=amp,
        s=size,
    )

    # Draw glow (thick, blurred teal)
    glow_ekg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_ekg, 'RGBA')
    gd.line(pts, fill=(*TEAL, 160), width=lw * 5)
    glow_ekg = glow_ekg.filter(ImageFilter.GaussianBlur(radius=lw * 2.5))
    img = Image.alpha_composite(img, glow_ekg)

    # Draw crisp line on top
    draw = ImageDraw.Draw(img, 'RGBA')
    draw.line(pts, fill=(*TEAL, 255), width=lw * 2)

    # ── 5. "DSV" wordmark ────────────────────────────────────────────────
    # Use default font scaled — load truetype if available, else default
    font_size_dsv = max(10, size // 9)
    font_size_sub = max(8,  size // 20)

    try:
        font_bold = ImageFont.truetype(
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size_dsv)
        font_sub  = ImageFont.truetype(
            "/System/Library/Fonts/Supplemental/Arial.ttf", font_size_sub)
    except Exception:
        try:
            font_bold = ImageFont.truetype(
                "/System/Library/Fonts/Helvetica.ttc", font_size_dsv)
            font_sub  = ImageFont.truetype(
                "/System/Library/Fonts/Helvetica.ttc", font_size_sub)
        except Exception:
            font_bold = ImageFont.load_default()
            font_sub  = ImageFont.load_default()

    # "DSV" — top area, centred, white
    bbox = draw.textbbox((0, 0), "DSV", font=font_bold)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = int(size * 0.14)

    # shadow/glow behind text
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, 'RGBA')
    sd.text((tx, ty), "DSV", font=font_bold, fill=(*INDIGO, 200))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.018))
    img = Image.alpha_composite(img, shadow)

    draw = ImageDraw.Draw(img, 'RGBA')
    draw.text((tx, ty), "DSV", font=font_bold, fill=(255, 255, 255, 255))

    # "OpsPulse" — smaller, centred, below DSV
    bbox2 = draw.textbbox((0, 0), "OpsPulse", font=font_sub)
    tw2, th2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    tx2 = (size - tw2) // 2
    ty2 = ty + th + int(size * 0.012)
    draw.text((tx2, ty2), "OpsPulse", font=font_sub,
              fill=(*TEAL, 220))

    # ── 6. Crop to circle (Android adaptive needs square, iOS needs rounded) ──
    mask = Image.new('L', (size, size), 0)
    md   = ImageDraw.Draw(mask)
    md.ellipse([0, 0, size - 1, size - 1], fill=255)
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(img, mask=mask)

    return result


def save_all():
    os.makedirs('assets/images', exist_ok=True)

    # Master 1024×1024 — Play Store / App Store upload
    master = make_icon(1024)
    master.save('assets/images/app_icon_1024.png', 'PNG')
    print("✓ assets/images/app_icon_1024.png  (1024×1024 — store listing)")

    # Android mipmap sizes
    android_sizes = {
        'mipmap-mdpi':    48,
        'mipmap-hdpi':    72,
        'mipmap-xhdpi':   96,
        'mipmap-xxhdpi':  144,
        'mipmap-xxxhdpi': 192,
    }

    for folder, px in android_sizes.items():
        dest_dir = f'android/app/src/main/res/{folder}'
        os.makedirs(dest_dir, exist_ok=True)
        icon = make_icon(px)
        # Android adaptive icons need square with transparent background
        square = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        square.paste(icon, (0, 0), icon)
        # Save as RGBA PNG
        square.save(f'{dest_dir}/ic_launcher.png', 'PNG')
        print(f"✓ {dest_dir}/ic_launcher.png  ({px}×{px})")

    # Also save a round version for Android
    for folder, px in android_sizes.items():
        dest_dir = f'android/app/src/main/res/{folder}'
        icon = make_icon(px)
        icon.save(f'{dest_dir}/ic_launcher_round.png', 'PNG')

    print("\n✅ All icons generated successfully.")
    print("   Master icon → assets/images/app_icon_1024.png")


if __name__ == '__main__':
    save_all()
