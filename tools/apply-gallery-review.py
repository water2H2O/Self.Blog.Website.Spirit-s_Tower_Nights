#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把「未标注图」的建议归属写进图池清单（核对通过后执行）。

配套 tools/build-gallery-review-sheet.py（那张对照图）。提案表在那边，
这里读同一份表，把每张图的 character 字段补上；**空字符串表示不挂角色**，
那种情况只补一个标记用的 character（`回响之殿` / `水塔夜谈`），让它不再算「未标注」。

安全性：
  · 只改 character（必要时连 owner / ownership），不动图片文件本身
  · 改前打印每一行的「原 → 新」，改后重跑一次核对
  · 已经是目标值就跳过；表里没有的文件名一律不动

用法：
    python tools/apply-gallery-review.py --dry-run   # 只看会改什么
    python tools/apply-gallery-review.py             # 真的写
"""
import argparse
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "src", "data", "gallery-meta.json")

# 与 build-gallery-review-sheet.py 的 PROPOSALS 同一份口径
# 值：(character, owner 或 None 表示不改)
ASSIGN = {
    # 曲绘：本来就不挂角色，给一个来源名，避免被当成「未标注」
    "回响之殿__No.1_Lum1n0u2-Late-Glow-Twin-Trails.webp": ("回响之殿", None),
    "回响之殿__No.2_ああああ-アドベンチャー・パレード.webp": ("回响之殿", None),
    "回响之殿__No.3_Kyakii-OBLIVION.webp": ("回响之殿", None),
    "回响之殿__No.4_Halv-Snowflower.webp": ("回响之殿", None),
    "回响之殿__No.5_CS4W-Subjugator.webp": ("回响之殿", None),
    "回响之殿__No.6_米虾Fomiki-Ventus-Murorum.webp": ("回响之殿", None),
    "回响之殿__No.7_Dabbling-梅干茶漬け.webp": ("回响之殿", None),
    "回响之殿__OC世界观音乐企划No.7_梅干茶漬け-Dabbling-封面.webp": ("回响之殿", None),
    "水塔夜谈__世界观logo.webp": ("水塔夜谈", None),
    # 同人 / 合作资料：有明确归属
    "平行时空__浅水的六岁生日合照图.webp": ("浅水", "浅水"),
    "讯息__131-魔药双人.webp": ("淼渺", None),
    "讯息__【参考文献】キャラクター画像.webp": ("淼渺", None),
    "讯息__和RT的合作提供的资料-墨白1.webp": ("墨白", None),
    "讯息__和RT的合作提供的资料-墨白2.webp": ("墨白", None),
    "讯息__插画-Halv合作曲绘.webp": ("淼渺", None),
    "讯息__插画-魔法药剂师.webp": ("淼渺", None),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(META, encoding="utf-8") as fh:
        meta = json.load(fh)
    items = meta["items"]

    changed = 0
    skipped = 0
    missing = []
    for name, (character, owner) in ASSIGN.items():
        if name not in items:
            missing.append(name)
            continue
        item = items[name]
        if (item.get("character") or "") == character and (owner is None or item.get("owner") == owner):
            skipped += 1
            continue
        old = item.get("character") or "（未标注）"
        print(f"  {name[:52]:<52} {old} → {character}" + (f"（设主 {owner}）" if owner else ""))
        if not args.dry_run:
            item["character"] = character
            if owner:
                item["owner"] = owner
        changed += 1

    if missing:
        print("\n清单里找不到这些文件名（跳过）：")
        for name in missing:
            print(f"  · {name}")

    print(f"\n{'将改' if args.dry_run else '已改'} {changed} 条，已是目标值 {skipped} 条")

    if args.dry_run:
        print("（dry-run，没有写文件）")
        return 0

    with open(META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent="\t")
        fh.write("\n")

    left = [k for k, v in items.items() if not (v.get("character") or "").strip()]
    print(f"写入 {os.path.relpath(META, ROOT)}")
    print(f"仍未标注的图：{len(left)} 张" + ("" if not left else " → " + "、".join(left[:5])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
