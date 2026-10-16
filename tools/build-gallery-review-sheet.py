#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把图池里「没有角色标注」的图拼成一张带编号与建议归属的对照图。

用途：作者要逐张核对「这张图该归谁」。一张图里带编号、文件名、我建议的归属，
对照着看比翻 JSON 快得多；核对完把改动告诉我，脚本改完这批就清零了。

建议归属来自下面的 PROPOSALS 表（**是待确认的提案，不是既成事实**）。

用法：
    python tools/build-gallery-review-sheet.py
输出：D:\\vibe_coding\\.dsh-cache\\gallery-review\\review.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "src", "data", "gallery-meta.json")
GAL = os.path.join(ROOT, "public", "gallery")
OUT_DIR = r"D:\vibe_coding\.dsh-cache\gallery-review"
OUT = os.path.join(OUT_DIR, "review.png")

FONT_BD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_RG = r"C:\Windows\Fonts\msyh.ttc"

"""
建议归属：文件名 → (归属角色, 一句话理由)
留空字符串表示「不挂角色」（例如曲绘、标志这类本来就没有角色）。
"""
PROPOSALS = {
    "回响之殿__No.1_Lum1n0u2-Late-Glow-Twin-Trails.webp": ("", "曲绘：淼渺 × 金发角色"),
    "回响之殿__No.2_ああああ-アドベンチャー・パレード.webp": ("", "曲绘：淼渺 × 凛"),
    "回响之殿__No.3_Kyakii-OBLIVION.webp": ("", "曲绘：白发角色·紫黑配色"),
    "回响之殿__No.4_Halv-Snowflower.webp": ("", "曲绘：淼渺 Q 版抱雪狐"),
    "回响之殿__No.5_CS4W-Subjugator.webp": ("", "曲绘：淼渺"),
    "回响之殿__No.6_米虾Fomiki-Ventus-Murorum.webp": ("", "曲绘：淼渺 × 狐"),
    "回响之殿__No.7_Dabbling-梅干茶漬け.webp": ("", "曲绘：像素风小游戏画面"),
    "回响之殿__OC世界观音乐企划No.7_梅干茶漬け-Dabbling-封面.webp": ("", "曲绘：同一首的封面版"),
    "平行时空__浅水的六岁生日合照图.webp": ("浅水", "同人：一堆 Q 版角色合影，署浅水"),
    "水塔夜谈__世界观logo.webp": ("", "标志：站子自己的字标"),
    "讯息__131-魔药双人.webp": ("淼渺", "魔药店场景的淼渺 × 白发角色"),
    "讯息__【参考文献】キャラクター画像.webp": ("淼渺", "参考文献用的淼渺设定页"),
    "讯息__和RT的合作提供的资料-墨白1.webp": ("墨白", "与 RT 合作资料里的墨白"),
    "讯息__和RT的合作提供的资料-墨白2.webp": ("墨白", "与 RT 合作资料里的墨白"),
    "讯息__插画-Halv合作曲绘.webp": ("淼渺", "与 Halv 合作，画面是淼渺 Q 版"),
    "讯息__插画-魔法药剂师.webp": ("淼渺", "温室里的淼渺"),
}

TILE_W = 460
COLS = 4
PAD = 18


def main() -> int:
    meta = json.load(open(META, encoding="utf-8"))
    items = meta["items"]
    rows = [(k, v) for k, v in sorted(items.items()) if not (v.get("character") or "").strip()]

    if not rows:
        print("图池里已经没有未标注的图了。")
        return 0

    f_no = ImageFont.truetype(FONT_BD, 30)
    f_name = ImageFont.truetype(FONT_RG, 17)
    f_prop = ImageFont.truetype(FONT_RG, 20)
    f_prop_b = ImageFont.truetype(FONT_BD, 20)

    tiles = []
    for index, (name, info) in enumerate(rows, 1):
        path = os.path.join(GAL, name)
        img = Image.open(path).convert("RGBA")
        w, h = img.size
        tile_h = round(TILE_W * 9 / 16)
        # 缩略图按 16:9 裁中，和卡片显示一致
        scale = max(TILE_W / w, tile_h / h)
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        left = (img.width - TILE_W) // 2
        top = (img.height - tile_h) // 2
        img = img.crop((left, top, left + TILE_W, top + tile_h))

        tile = Image.new("RGB", (TILE_W, tile_h + 96), (16, 27, 38))
        bg = Image.new("RGB", (TILE_W, tile_h), (10, 18, 26))
        bg.paste(img, (0, 0), img.split()[-1])
        tile.paste(bg, (0, 0))

        draw = ImageDraw.Draw(tile)
        draw.text((10, tile_h + 8), f"{index:02d}", font=f_no, fill=(127, 233, 240))
        draw.text((52, tile_h + 10), name if len(name) < 34 else name[:33] + "…", font=f_name, fill=(150, 170, 185))

        who, why = PROPOSALS.get(name, ("？", "未在对表里"))
        label = f"→ {who}" if who else "→ 不挂角色"
        color = (255, 214, 138) if who else (150, 170, 185)
        draw.text((52, tile_h + 36), label, font=f_prop_b, fill=color)
        draw.text((52, tile_h + 64), why if len(why) < 30 else why[:29] + "…", font=f_prop, fill=(120, 140, 155))

        if who and who not in [v.get("character") for v in items.values()]:
            pass
        tiles.append(tile)

    row_count = (len(tiles) + COLS - 1) // COLS
    sheet_w = COLS * TILE_W + (COLS + 1) * PAD
    sheet_h = row_count * (tiles[0].height + PAD) + PAD + 54
    sheet = Image.new("RGB", (sheet_w, sheet_h), (8, 14, 20))
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (PAD, 16),
        f"图池里未标注角色的图：{len(tiles)} 张 —— 下面是建议归属，核对后告诉我要改哪几行",
        font=ImageFont.truetype(FONT_BD, 24),
        fill=(230, 245, 255),
    )
    for i, tile in enumerate(tiles):
        x = PAD + (i % COLS) * (TILE_W + PAD)
        y = 54 + PAD + (i // COLS) * (tile.height + PAD)
        sheet.paste(tile, (x, y))

    os.makedirs(OUT_DIR, exist_ok=True)
    sheet.save(OUT)
    print(f"对照图：{OUT}")
    print(f"  {sheet.width}×{sheet.height}  {os.path.getsize(OUT) / 1024:.0f} KB  {len(tiles)} 张")
    print()
    for i, (name, info) in enumerate(rows, 1):
        who, why = PROPOSALS.get(name, ("？", "未在对表里"))
        print(f"  {i:2d}. {name[:46]:<46} → {who or '不挂角色':<6} {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
