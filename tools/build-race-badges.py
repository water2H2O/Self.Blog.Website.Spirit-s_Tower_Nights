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
    # 「元素」用原子（核 + 两条轨道）—— 比一滴水更能说明这一族是什么
    ("elemental-spirit", "元素精灵", "#AFFFFF", "旧时代的遗民", "atom"),
    # 翅膀换成纸飞机：既是飞行，也顺着「风」的方向
    ("winged", "天翼种", "#8FD8FF", "未来过去的光影", "plane"),
    # 棱柱换成多面体：宝石的切面比单薄的菱形更像「晶体」
    ("crystal-kin", "晶裔", "#9BE7E0", "信息的闪光", "polyhedron"),
    ("human", "人类", "#FFD68A", "新世界的火种", "flame"),
    ("elf", "精灵族", "#8FDC9B", "名为信仰的诅咒", "leaf"),
    ("snowfox", "雪狐一族", "#D8ECFF", "冰雪中的晶花", "snowflake"),
    # 蔷薇换成血滴：这是血族，不是花店
    ("vampire", "血族", "#E06A7A", "染上血色的蔷薇", "droplet"),
    ("dragon", "龙族", "#E8B45C", "天下无敌（物理）", "scale"),
    ("angel", "天使", "#F4E7A8", "秩序的维护者", "halo"),
    ("divine-envoy", "神界使", "#C9A8FF", "眼中再无星辰", "star"),
    ("demon", "恶魔", "#C0605F", "混乱的可能性", "horn"),
    ("evil-god", "邪神", "#A66BE0", "千分之一的可能", "eye"),
    # 方脸不画五官：亚人是兽人 / 哥布林 / 人马那一类，不该只给一张具体的「猫脸」
    ("demi-human", "亚人", "#B9C6A8", "存在于新旧秩序的夹缝中", "demi-human"),
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
    cx, cy, s = round(cx), round(cy), s
    line = max(3, round(s / 26))
    fine = max(2, line - 1)
    faint = mix(color, (10, 20, 30), 0.55)

    def P(pts):
        return [(round(x), round(y)) for x, y in pts]

    def box(x0, y0, x1, y1):
        return [round(x0), round(y0), round(x1), round(y1)]

    def stroke(pts, tone=None, width=None):
        """折线：joint='curve' 让拐点不出现缺口（PIL 默认会在转角处断开）"""
        draw.line(P(pts), fill=tone or color, width=width or line, joint="curve")

    def ellipse_ring(rx, ry, rot=0.0, steps=120):
        """可旋转的椭圆点列 —— PIL 只能画正的椭圆，斜的轨道得自己算"""
        pts = []
        for i in range(steps + 1):
            t = 2 * math.pi * i / steps
            ex, ey = math.cos(t) * rx, math.sin(t) * ry
            pts.append(
                (
                    cx + ex * math.cos(rot) - ey * math.sin(rot),
                    cy + ex * math.sin(rot) + ey * math.cos(rot),
                )
            )
        return pts

    if name == "atom":
        # 「元素」最直白的写法：原子核 + 两条交叉轨道 + 两颗电子
        r = s * 0.16
        draw.ellipse(box(cx - r, cy - r, cx + r, cy + r), outline=color, width=line)
        for rot in (math.radians(34), math.radians(-34)):
            stroke(ellipse_ring(s * 0.94, s * 0.38, rot))
        for rot, t in ((math.radians(34), 0.0), (math.radians(-34), math.pi)):
            ex, ey = math.cos(t) * s * 0.94, math.sin(t) * s * 0.38
            px = cx + ex * math.cos(rot) - ey * math.sin(rot)
            py = cy + ex * math.sin(rot) + ey * math.cos(rot)
            rr = s * 0.07
            draw.ellipse(box(px - rr, py - rr, px + rr, py + rr), fill=faint)
    elif name == "plane":
        # 纸飞机：两块翼面沿中缝折起，尾巴留一个 V 口
        nose = (cx + s * 0.98, cy - s * 0.52)
        up_tip = (cx - s * 0.95, cy - s * 0.34)
        fold = (cx - s * 0.08, cy - s * 0.02)
        low_tip = (cx - s * 0.52, cy + s * 0.86)
        draw.polygon(P([nose, up_tip, fold]), outline=color, width=line)
        draw.polygon(P([nose, fold, low_tip]), outline=color, width=line)
        stroke([nose, fold], faint, fine)
    elif name == "polyhedron":
        # 八面体：上下两个四棱锥底对底，侧面看过去就是「菱形 + 一道中腰线」。
        # （等轴投影的六边形 + Y 更像立方体，所以没用那种画法）
        hw = s * 0.66
        hh = s * 0.98
        top = (cx, cy - hh)
        bot = (cx, cy + hh)
        left = (cx - hw, cy)
        right = (cx + hw, cy)
        draw.polygon(P([top, right, bot, left]), outline=color, width=line)
        # 中腰线 = 那个正方形底座的可见边
        stroke([left, right], faint, fine)
    elif name == "flame":
        draw.polygon(
            P(
                [
                    (cx, cy - s),
                    (cx + s * 0.55, cy + s * 0.1),
                    (cx + s * 0.22, cy + s * 0.8),
                    (cx - s * 0.22, cy + s * 0.8),
                    (cx - s * 0.55, cy + s * 0.1),
                ]
            ),
            outline=color,
            width=line,
        )
        draw.polygon(
            P([(cx, cy - s * 0.1), (cx + s * 0.2, cy + s * 0.55), (cx - s * 0.2, cy + s * 0.55)]),
            outline=faint,
            width=line,
        )
    elif name == "leaf":
        # 叶：两条对称的弧拼出叶形（菱形太硬），中脉 + 三对朝叶尖弯的侧脉
        tip_y, base_y = cy - s * 0.98, cy + s * 0.88
        for side in (-1, 1):
            pts = []
            for i in range(41):
                t = i / 40
                half = s * 0.60 * (math.sin(math.pi * t) ** 0.8)
                pts.append((cx + side * half, base_y + (tip_y - base_y) * t))
            stroke(pts)
        stroke([(cx, tip_y), (cx, base_y)], faint, fine)
        for f in (0.28, 0.48, 0.68):
            y0 = base_y + (tip_y - base_y) * f
            half = s * 0.60 * (math.sin(math.pi * f) ** 0.8)
            for side in (-1, 1):
                stroke([(cx, y0), (cx + side * half * 0.78, y0 - s * 0.20)], faint, fine)
    elif name == "snowflake":
        # 雪花：六道主臂 + 短侧枝 + 中心小六边形。
        # 侧枝原来又长又朝外，看着像六支箭；现在压短、压低角度。
        for i in range(6):
            a = math.radians(60 * i - 90)
            stroke([(cx, cy), (cx + math.cos(a) * s * 0.98, cy + math.sin(a) * s * 0.98)])
            for f in (0.38, 0.64):
                bx = cx + math.cos(a) * s * f
                by = cy + math.sin(a) * s * f
                # 侧枝压到 60°、长度只有主臂的 1/6 —— 再长就成箭头了
                for da in (-1.05, 1.05):
                    stroke(
                        [
                            (bx, by),
                            (bx + math.cos(a + da) * s * 0.16, by + math.sin(a + da) * s * 0.16),
                        ],
                        faint,
                        fine,
                    )
        r0 = s * 0.15
        draw.polygon(
            P(
                [
                    (cx + math.cos(math.radians(60 * k - 90)) * r0, cy + math.sin(math.radians(60 * k - 90)) * r0)
                    for k in range(6)
                ]
            ),
            outline=color,
            width=fine,
        )
    elif name == "droplet":
        # 血滴：一笔闭合的轮廓（尖顶 + 圆底），中间不留横线
        r = s * 0.50
        cy_c = cy + s * 0.50
        pts = [(cx, cy - s * 1.05)]
        for k in range(61):
            a = math.pi * (1 - k / 60)
            pts.append((cx + math.cos(a) * r, cy_c + math.sin(a) * r))
        pts.append((cx, cy - s * 1.05))
        draw.polygon(P(pts), outline=color, width=line)
        # 左上角一点高光，斜着的短弧，比画一个圆圈干净
        draw.arc(
            box(cx - s * 0.36, cy + s * 0.10, cx - s * 0.02, cy + s * 0.44),
            120,
            250,
            fill=faint,
            width=fine,
        )
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
            draw.line(
                P(
                    [
                        (cx + math.cos(a) * s * 0.74, cy + math.sin(a) * s * 0.74),
                        (cx + math.cos(a) * s * 0.96, cy + math.sin(a) * s * 0.96),
                    ]
                ),
                fill=faint,
                width=max(2, line - 1),
            )
    elif name == "star":
        pts = []
        for i in range(10):
            a = math.radians(36 * i - 90)
            rr = s if i % 2 == 0 else s * 0.42
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        draw.polygon(P(pts), outline=color, width=line)
        draw.ellipse(box(cx - s * 0.16, cy - s * 0.16, cx + s * 0.16, cy + s * 0.16), fill=faint)
    elif name == "horn":
        # 恶魔：左右各一道角 + 中间一个三角。
        # 原来右边那道弧用了 260→40，左边是 200→340 —— 角度没做镜像，看着就是歪的。
        # 现在两边都用 200→340，靠左右翻过来的圆框得到天然对称。
        for side in (-1, 1):
            ox = cx + side * s * 0.95
            draw.arc(
                box(ox - s * 0.95, cy - s * 0.95, ox + s * 0.95, cy + s * 0.95),
                200,
                340,
                fill=color,
                width=line,
            )
        draw.polygon(
            P([(cx - s * 0.5, cy + s * 0.85), (cx, cy - s * 0.15), (cx + s * 0.5, cy + s * 0.85)]),
            outline=faint,
            width=line,
        )
    elif name == "eye":
        draw.arc(box(cx - s, cy - s * 0.72, cx + s, cy + s * 0.72), 200, 340, fill=color, width=line)
        draw.arc(box(cx - s, cy - s * 0.72, cx + s, cy + s * 0.72), 20, 160, fill=color, width=line)
        draw.ellipse(box(cx - s * 0.22, cy - s * 0.22, cx + s * 0.22, cy + s * 0.22), outline=faint, width=line)
        draw.ellipse(box(cx - s * 0.06, cy - s * 0.16, cx + s * 0.06, cy + s * 0.16), fill=faint)
    elif name == "demi-human":
        # 亚人：方脸 + 一对耳，**不画五官**。
        # 这一族是兽人 / 哥布林 / 人马那一类，不该只给一张具体的「猫脸」。
        w = s * 0.66
        h = s * 0.60
        top_y = cy - h + s * 0.08
        bot_y = cy + h + s * 0.08
        draw.rounded_rectangle(
            box(cx - w, top_y, cx + w, bot_y),
            radius=round(s * 0.16),
            outline=color,
            width=line,
        )
        for side in (-1, 1):
            # 耳朵只画成「Λ」两条边，底边压在脸的顶线上 ——
            # 画成闭合三角形会多出一条横线，看着像插了两面小旗。
            # 比例收窄一点（宽 0.38w、高 0.34s），才像耳朵不像旗子。
            outer = (cx + side * w * 0.78, top_y)
            tip = (cx + side * w * 0.60, top_y - s * 0.34)
            inner = (cx + side * w * 0.40, top_y)
            stroke([outer, tip], color, line)
            stroke([tip, inner], color, line)


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
