#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 13 枚种族徽记接进种族条目：补 cover 与 themeColor。

徽记由 tools/build-race-badges.py 生成（占位图，以后换真图只改 cover 的值）。
这一支只动 frontmatter 的两行，正文一个字不碰；改完把每个文件的新增行打出来核对。

用法： python tools/link-race-badges.py
"""
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RACES_DIR = os.path.join(ROOT, "src", "content", "races")

# 与 build-race-badges.py 里那套配色一致
COLORS = {
    "elemental-spirit": "#AFFFFF",
    "winged": "#8FD8FF",
    "crystal-kin": "#9BE7E0",
    "human": "#FFD68A",
    "elf": "#8FDC9B",
    "snowfox": "#D8ECFF",
    "vampire": "#E06A7A",
    "dragon": "#E8B45C",
    "angel": "#F4E7A8",
    "divine-envoy": "#C9A8FF",
    "demon": "#C0605F",
    "evil-god": "#A66BE0",
    "demi-human": "#B9C6A8",
}


def main() -> int:
    changed = 0
    skipped = 0
    for slug, color in COLORS.items():
        path = os.path.join(RACES_DIR, f"{slug}.md")
        if not os.path.exists(path):
            print(f"  ✗ 找不到 {slug}.md")
            continue
        text = open(path, encoding="utf-8").read()
        cover_line = f"cover: '../../assets/oc/races/{slug}.webp'"
        if "cover:" in text:
            print(f"  · {slug:<16} 已有 cover，跳过")
            skipped += 1
            continue

        new = text
        if re.search(r"^themeColor:", new, re.M):
            # 已有一行就改成对应该族的色
            new = re.sub(
                r"^themeColor:.*$",
                f"themeColor: '{color}'",
                new,
                count=1,
                flags=re.M,
            )
        else:
            # 没有这一行：插到 summary 之后（frontmatter 里 summary 一定有）
            inserted = re.sub(
                r"^(summary:.*)$",
                rf"\1\nthemeColor: '{color}'",
                new,
                count=1,
                flags=re.M,
            )
            if inserted == new:
                print(f"  ✗ {slug:<16} 没能插入 themeColor（没有 summary 行？）")
                continue
            new = inserted
        # cover 插在 themeColor 之后
        new = re.sub(
            r"^(themeColor:.*)$", rf"\1\n{cover_line}", new, count=1, flags=re.M
        )
        if new == text:
            print(f"  ✗ {slug:<16} 没能插入")
            continue
        open(path, "w", encoding="utf-8", newline="\n").write(new)
        changed += 1
        print(f"  ✓ {slug:<16} themeColor {color}  +  cover")

    print(f"\n改了 {changed} 个文件，跳过 {skipped} 个")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
