#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 13 支种族的「徽记」占位封面（等真图来了直接换掉）。

为什么要有这一步：种族列表页现在 13 张卡全是纯文字，看着像没做完。
先补一套风格统一的占位徽记 —— 每族一枚：深底 + 该族的色 + 一个几何符号 + 族名 + 称号。
它与站上既有的「暗色塔夜景 + 青色辉光」是同一套语言，同批图放在一起不会像拼贴。

这些**不是成品美术**，是占位：图上角有 `PLACEHOLDER` 标记。
以后委托画师出真图时，把图放进 `assets/oc/races/` 换掉 `cover` 即可，其余不用动。

用法：
    python tools/build-race-badges.py            # 生成到 src/assets/oc/races/
    python tools/build-race-badges.py --dry-run  # 只打印配色表
"""
import argparse
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "assets", "oc", "races")

W, H = 1280, 720
FONT_BD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_RG = r"C:\Windows\Fonts\msyh.ttc"
FONT_LT = r"C:\Windows\Fonts\msyhl.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"

BASE_TOP = (20, 34, 47)
BASE_BOTTOM = (9, 17, 26)

"""
每族一条：文件名、族名、色、称号、符号画法名。
配色是照各族的气质定的（元素精灵=水青、天翼种=天蓝、血族=酒红、邪神=诡紫…），
与站上的青色主调都能搭上。
"""
RACES = [
    ("elemental-spirit", "元素精灵", "#AFFFFF", "旧时代的遗民", "droplet"),
    ("winged", "天翼种", "#8FD8FF", "未来过去的光影", "wing"),
    ("crystal-kin", "晶裔", "#9BE7E0", "信息的闪光", "prism"),
    ("human", "人类", "#FFD68A", "新世界的火种", "flame"),
    ("elf", "精灵族", "#8FDC9B", "名为信仰的诅咒", "leaf"),
    ("snowfox", "雪狐一族", "#D8ECFF", "冰雪中的晶花", "snowflake"),
    ("vampire", "血族", "#E06A7A", "染上血色的蔷薇", "rose"),
    ("dragon", "龙族", "#E8B45C", "天下无敌（物理）", "scale"),
    ("angel", "天使", "#F4E7A8", "秩序的维护者", "halo"),
    ("divine-envoy", "神界使", "#C9A8FF", "眼中再无星辰", "star"),
    ("demon", "恶魔", "#C0605F", "混乱的可能性", "horn"),
    ("evil-god", "邪神", "#A66BE0", "千分之一的可能", "eye"),
    ("demi-human", "亚人", "#B9C6A8", "存在于新旧秩序的夹缝中", "duality"),
]


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", size, top)
    draw = ImageDraw.Draw(img)
    for y in range(size[1]):
        draw.line([(0, y), (size[0], y)], fill=mix(top, bottom, y / max(1, size[1] - 1)))
    return img


def radial_glow(size, center, radius, color, strength=0.55):
    """在暗底上叠一层该族的柔光（用小的图放大，省时间也够柔）"""
    small = (max(2, size[0] // 8), max(2, size[1] // 8))
    layer = Image.new("RGB", small, (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center[0] / 8, center[1] / 8
    r = radius / 8
    steps = 26
    for i in range(steps, 0, -1):
        t = i / steps
        c = tuple(round(v * strength * (1 - t) ** 1.6) for v in color)
        draw.ellipse([cx - r * t, cy - r * t, cx + r * t, cy + r * t], fill=c)
    layer = layer.resize(size, Image.LANCZOS)
    return layer


def draw_glyph(draw, name, cx, cy, s, color):
    """每个符号都用基本图形拼，保证 13 枚是同一种手感（细线、几何、留白多）

    注意：PIL 的 polygon / arc 只吃整数坐标，这里统一把点取整 ——
    否则浮点会抛 TypeError（踩过）。
    """
    def P(pts):
        return [(round(x), round(y)) for x, y in pts]

    def box(x0, y0, x1, y1):
        return [round(x0), round(y0), round(x1), round(y1)]

    cx, cy, s = round(cx), round(cy), s
    line = max(3, round(s / 26))
    faint = mix(color, (10, 20, 30), 0.55)

    if name == "droplet":
        # 用「圆 + 尖顶」拼水滴，比方块状的多边形顺眼
        r = s * 0.46
        draw.ellipse(box(cx - r, cy - r * 0.5, cx + r, cy + r * 1.5), outline=color, width=line)
        draw.polygon(P([(cx, cy - s * 1.05), (cx + r * 0.98, cy + r * 0.52), (cx - r * 0.98, cy + r * 0.52)]), outline=color, width=line)
        draw.ellipse(box(cx - s * 0.16, cy + s * 0.24, cx + s * 0.16, cy + s * 0.56), outline=faint, width=line)
    elif name == "wing":
        for side in (-1, 1):
            pts = [(cx, cy + s * 0.45)]
            for i in range(4):
                pts.append((cx + side * s * (0.42 + 0.34 * i), cy + s * (0.22 - 0.3 * i)))
            pts.append((cx, cy - s * 0.15))
            draw.polygon(P(pts), outline=color, width=line)
        draw.ellipse(box(cx - s * 0.34, cy - s * 0.3, cx + s * 0.34, cy + s * 0.38), outline=faint, width=line)
    elif name == "prism":
        draw.polygon(P([(cx, cy - s * 0.9), (cx + s * 0.8, cy), (cx, cy + s * 0.9), (cx - s * 0.8, cy)]), outline=color, width=line)
        for dx in (-0.45, 0, 0.45):
            draw.line(P([(cx + s * dx, cy - s * 0.9 + abs(dx) * s), (cx + s * dx, cy + s * 0.9 - abs(dx) * s)]), fill=faint, width=max(2, line - 1))
    elif name == "flame":
        draw.polygon(P([(cx, cy - s), (cx + s * 0.55, cy + s * 0.1), (cx + s * 0.22, cy + s * 0.8), (cx - s * 0.22, cy + s * 0.8), (cx - s * 0.55, cy + s * 0.1)]), outline=color, width=line)
        draw.polygon(P([(cx, cy - s * 0.1), (cx + s * 0.2, cy + s * 0.55), (cx - s * 0.2, cy + s * 0.55)]), outline=faint, width=line)
    elif name == "leaf":
        draw.polygon(P([(cx, cy - s * 0.95), (cx + s * 0.62, cy), (cx, cy + s * 0.95), (cx - s * 0.62, cy)]), outline=color, width=line)
        draw.line(P([(cx, cy - s * 0.9), (cx, cy + s * 0.9)]), fill=faint, width=max(2, line - 1))
        for k in (-0.45, 0, 0.45):
            draw.line(P([(cx, cy + s * k), (cx + s * 0.5, cy + s * k - s * 0.34)]), fill=faint, width=max(2, line - 1))
            draw.line(P([(cx, cy + s * k), (cx - s * 0.5, cy + s * k - s * 0.34)]), fill=faint, width=max(2, line - 1))
    elif name == "snowflake":
        for i in range(6):
            a = math.radians(60 * i - 90)
            x2, y2 = cx + math.cos(a) * s, cy + math.sin(a) * s
            draw.line(P([(cx, cy), (x2, y2)]), fill=color, width=line)
            for f in (0.55, 0.78):
                bx, by = cx + math.cos(a) * s * f, cy + math.sin(a) * s * f
                for da in (-0.6, 0.6):
                    draw.line(P([(bx, by), (bx + math.cos(a + da) * s * 0.26, by + math.sin(a + da) * s * 0.26)]), fill=faint, width=max(2, line - 1))
    elif name == "rose":
        draw.ellipse(box(cx - s * 0.62, cy - s * 0.95, cx + s * 0.62, cy + s * 0.29), outline=color, width=line)
        draw.ellipse(box(cx - s * 0.34, cy - s * 0.64, cx + s * 0.34, cy - s * 0.02), outline=faint, width=line)
        draw.line(P([(cx, cy + s * 0.29), (cx, cy + s * 0.98)]), fill=color, width=line)
        draw.line(P([(cx, cy + s * 0.62), (cx + s * 0.46, cy + s * 0.34)]), fill=faint, width=line)
    elif name == "scale":
        r = s * 0.34
        for row, y in enumerate((cy - s * 0.6, cy - s * 0.12, cy + s * 0.36)):
            offset = 0 if row % 2 == 0 else r
            for col in range(-2, 3):
                x = cx + col * r * 2 + offset
                if abs(x - cx) > s * 0.95:
                    continue
                draw.arc(box(x - r, y - r, x + r, y + r), 180, 360, fill=color if row == 1 else faint, width=line)
    elif name == "halo":
        draw.ellipse(box(cx - s * 0.72, cy - s * 0.72, cx + s * 0.72, cy + s * 0.72), outline=color, width=line)
        draw.ellipse(box(cx - s * 0.86, cy - s * 1.06, cx + s * 0.86, cy - s * 0.62), outline=faint, width=line)
        for i in range(8):
            a = math.radians(45 * i)
            draw.line(P([(cx + math.cos(a) * s * 0.74, cy + math.sin(a) * s * 0.74), (cx + math.cos(a) * s * 0.96, cy + math.sin(a) * s * 0.96)]), fill=faint, width=max(2, line - 1))
    elif name == "star":
        pts = []
        for i in range(10):
            a = math.radians(36 * i - 90)
            rr = s if i % 2 == 0 else s * 0.42
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        draw.polygon(P(pts), outline=color, width=line)
        draw.ellipse(box(cx - s * 0.16, cy - s * 0.16, cx + s * 0.16, cy + s * 0.16), fill=faint)
    elif name == "horn":
        for side in (-1, 1):
            draw.arc(box(cx + side * s * 0.95 - s * 0.95, cy - s * 0.95, cx + side * s * 0.95 + s * 0.95, cy + s * 0.95),
                     200 if side < 0 else 260, 340 if side < 0 else 40, fill=color, width=line)
        draw.polygon(P([(cx - s * 0.5, cy + s * 0.85), (cx, cy - s * 0.15), (cx + s * 0.5, cy + s * 0.85)]), outline=faint, width=line)
    elif name == "eye":
        draw.arc(box(cx - s, cy - s * 0.72, cx + s, cy + s * 0.72), 200, 340, fill=color, width=line)
        draw.arc(box(cx - s, cy - s * 0.72, cx + s, cy + s * 0.72), 20, 160, fill=color, width=line)
        draw.ellipse(box(cx - s * 0.22, cy - s * 0.22, cx + s * 0.22, cy + s * 0.22), outline=faint, width=line)
        draw.ellipse(box(cx - s * 0.06, cy - s * 0.16, cx + s * 0.06, cy + s * 0.16), fill=faint)
    elif name == "duality":
        draw.polygon(P([(cx - s * 0.16, cy - s * 0.9), (cx + s * 0.16, cy - s * 0.9), (cx + s * 0.16, cy + s * 0.9), (cx - s * 0.16, cy + s * 0.9)]), fill=faint)
        draw.polygon(P([(cx - s * 0.92, cy - s * 0.6), (cx - s * 0.15, cy - s * 0.6), (cx - s * 0.15, cy + s * 0.6), (cx - s * 0.92, cy + s * 0.6)]), outline=color, width=line)
        draw.polygon(P([(cx + s * 0.15, cy - s * 0.6), (cx + s * 0.92, cy - s * 0.6), (cx + s * 0.92, cy + s * 0.6), (cx + s * 0.15, cy + s * 0.6)]), outline=color, width=line)


def letter_spaced(draw, xy, text, font, fill, spacing=0):
    """PIL 没有字距，手动一个字一个字画"""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing
    return x


def build(race, dry=False):
    slug, name, color_hex, epithet, glyph = race
    color = hex_rgb(color_hex)
    img = vertical_gradient((W, H), BASE_TOP, BASE_BOTTOM)
    glow = radial_glow((W, H), (W * 0.72, H * 0.34), min(W, H) * 0.62, color, 0.5)
    img = Image.blend(img, Image.blend(img, glow, 0.85), 0.5)
    draw = ImageDraw.Draw(img, "RGBA")

    # 底纹：细网格（像图纸），很淡，不抢主体
    for x in range(0, W, 64):
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, H, 64):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)

    # 右侧的符号 + 两圈细环
    cx, cy, s = W * 0.74, H * 0.42, H * 0.19
    draw.ellipse([cx - s * 1.5, cy - s * 1.5, cx + s * 1.5, cy + s * 1.5], outline=(*color, 42), width=2)
    draw.ellipse([cx - s * 1.9, cy - s * 1.9, cx + s * 1.9, cy + s * 1.9], outline=(*color, 20), width=1)
    draw_glyph(draw, glyph, cx, cy, s, color)

    # 左侧文字
    f_name = ImageFont.truetype(FONT_BD, 96)
    f_epi = ImageFont.truetype(FONT_LT, 34)
    f_tag = ImageFont.truetype(FONT_MONO, 22)
    draw.text((96, H * 0.36), name, font=f_name, fill=(240, 250, 255))
    draw.line([(96, H * 0.36 + 128), (96 + 132, H * 0.36 + 128)], fill=(*color, 190), width=4)
    letter_spaced(draw, (96, H * 0.36 + 158), epithet, f_epi, (*mix(color, (255, 255, 255), 0.35), 235), spacing=4)

    # 角上的占位标记：提醒这是临时图，别当成成品。
    # 用等宽英文字体 —— Consolas 没有中文字形，中文会渲染成方块（踩过）。
    draw.text((96, H - 82), "PLACEHOLDER - ART TBD", font=f_tag, fill=(*color, 150))
    draw.text((W - 96 - 210, H - 82), f"{slug}.webp", font=f_tag, fill=(255, 255, 255, 60))

    if dry:
        return None
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{slug}.webp")
    img.save(path, "WEBP", quality=86, method=6)
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"生成 {len(RACES)} 枚种族徽记（{W}×{H}）")
    total = 0
    for race in RACES:
        path = build(race, args.dry_run)
        if path:
            size = os.path.getsize(path)
            total += size
            print(f"  ✓ {os.path.basename(path):<22} {race[1]:<6} {race[2]}  {size / 1024:5.0f} KB")
        else:
            print(f"  · {race[0]:<22} {race[1]:<6} {race[2]}  {race[4]}")
    if not args.dry_run:
        print(f"\n共 {len(RACES)} 枚，合计 {total / 1024:.0f} KB，输出到 {os.path.relpath(OUT_DIR, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
