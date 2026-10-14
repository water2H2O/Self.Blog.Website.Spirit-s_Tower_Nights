#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""给图池里的图补 `characters` 字段：一张图里有多个人时，让它同时出现在各人的页面下。

背景：`character` 是单值，所以「淼渺×飒岚」这种图只挂在一个角色下面，
另一个人的页面里看不到。加一个 `characters` 数组记录画面里的所有人，
角色页据此筛选；`character` 保留为「主角色」（画廊分组、排序仍用它）。

判定：**文件名匹配 + 人工核对表**。文件名能对上的自动认；对不上的写进 OVERRIDES，
一条条写清楚依据（作者口径优先）。名字有歧义的（例如同事的 OC「凛」与单字「祈」）
**不猜**，留在 UNKNOWN 里等作者确认。

用法：
    python tools/tag-multi-character.py            # 只列出会改什么
    python tools/tag-multi-character.py --apply    # 写入 characters 字段
"""
import argparse
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "src", "data", "gallery-meta.json")

"""角色名 → 可用来匹配的别名（单字别名一律不放，太容易误命中）"""
ALIASES = {
    "淼渺": ["水水", "淼淼"],
    "飒岚": ["风精灵"],
    "薇奥拉": ["戴薇娜", "星轨魔女"],
    "风汐铃月": ["铃月"],
    "莉莉安娜·萨拉姆博": ["莉莉安娜", "萨拉姆博"],
    "Aurelith PrismWing": ["Aurelith"],
    "墨白": ["Ink_Bai"],
    "应祈": [],
    "白茶": [],
    "蔚蓝": [],
    "天涯": [],
    "缪伊伊": [],
    "芳基胺": ["苯胺"],
}

"""
人工核对表：文件名 → (画面里的人, 依据)
只写**有依据**的：作者明确说过的，或文件名括号里写了的。
"""
OVERRIDES = {
    # 作者原话：「1，2 都是淼渺×飒岚，6 是淼渺白茶和祈」
    "回响之殿__No.1_Lum1n0u2-Late-Glow-Twin-Trails.webp": (["淼渺", "飒岚"], "作者口径：No.1 为淼渺 × 飒岚"),
    "回响之殿__No.2_ああああ-アドベンチャー・パレード.webp": (["淼渺", "飒岚"], "作者口径：No.2 为淼渺 × 飒岚"),
    "回响之殿__No.6_米虾Fomiki-Ventus-Murorum.webp": (["淼渺", "白茶", "应祈"], "作者口径：No.6 为淼渺、白茶与祈"),
    # 文件名括号里已经写清楚的
    "淼渺__双人贴贴-灌药（淼渺×月月）.webp": (["淼渺", "风汐铃月"], "文件名括注：淼渺 × 月月（风汐铃月的昵称）"),
    "淼渺__双人贴贴-拍立得（水水×白茶）.webp": (["淼渺", "白茶"], "文件名括注：水水 × 白茶"),
    "淼渺__与天涯_13.webp": (["淼渺", "天涯"], "文件名：与天涯的联动表情"),
    "淼渺__与天涯_14.webp": (["淼渺", "天涯"], "文件名：与天涯的联动表情"),
    "淼渺__与天涯_15.webp": (["淼渺", "天涯"], "文件名：与天涯的联动表情"),
    "淼渺__与天涯_16_1.webp": (["淼渺", "天涯"], "文件名：与天涯的联动表情"),
    "淼渺__与天涯_16_2.webp": (["淼渺", "天涯"], "文件名：与天涯的联动表情"),
    "墨白__水水支付_04.webp": (["墨白", "淼渺"], "文件名同时出现两人，判为双人图（待作者确认画面内容）"),
}

"""
文件名自动判定与作者口径打架的：**以作者为准**，但逐个记下依据。
"""
AUTHOR_OVERRULES = {
    "回响之殿__No.3_Kyakii-OBLIVION.webp": (["风汐铃月"], "作者口径：No.3 里是铃月（文件名里看不出）"),
    "回响之殿__No.7_Dabbling-梅干茶漬け.webp": (["飒岚"], "作者口径：No.7 里是飒岚（文件名里看不出）"),
}

"""
暂时判不准的：列出来请作者认领，**不写进清单**。
"""
UNKNOWN = {
    "讯息__131-魔药双人.webp": "白发那位是谁？（像墨白，但不确定）",
    "平行时空__浅水的六岁生日合照图.webp": "合影里都有谁？现在只标了「浅水」",
    "淼渺__多人插-和鸟姐姐一起玩水花.webp": "「鸟姐姐」是谁？现在只标了淼渺",
    "淼渺__贴贴_17.webp": "「贴贴」是和谁的贴贴？",
}


def collect_known_names():
    """站上全部角色名（角色档案 + 签筒）—— 文件名优先拿它们来匹配"""
    names = set()
    for folder in ("characters", "draw"):
        directory = os.path.join(ROOT, "src", "content", folder)
        if not os.path.isdir(directory):
            continue
        for name in os.listdir(directory):
            if name.endswith(".md"):
                text = open(os.path.join(directory, name), encoding="utf-8").read(3000)
                match = re.search(r"^name:\s*(.+)$", text, re.M)
                if match:
                    names.add(match.group(1).strip().strip("'\""))
    return names


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    meta = json.load(open(META, encoding="utf-8"))
    items = meta["items"]
    known_names = collect_known_names()

    planned = {}
    for file, info in sorted(items.items()):
        current = (info.get("character") or "").strip()

        # 作者口径最优先（含他指认、文件名看不出来的那两张）
        if file in AUTHOR_OVERRULES:
            planned[file] = list(AUTHOR_OVERRULES[file][0])
            continue
        if file in OVERRIDES:
            planned[file] = list(OVERRIDES[file][0])
            continue

        # 文件名匹配：先用**站上已登记的完整角色名**，再用别名
        # （用完整名是为了避开别名撞车：苯胺是独立条目，不该被并到芳基胺）
        found = []
        for name in sorted(known_names):
            if len(name) >= 2 and name in file:
                found.append(name)
        for canonical, aliases in ALIASES.items():
            if canonical in file or any(a in file for a in aliases):
                found.append(canonical)
        # 最长优先消歧：短名若被某个更长的命中项包含（苯胺 ⊂ 芳基胺 这类写法差异），丢掉短的
        def drop_contained(names):
            unique = list(dict.fromkeys(names))  # 先按原序去重，否则会写成「同名两人」
            return [n for n in unique if not any(n != m and n in m for m in unique)]

        found = drop_contained([f for f in found if f])
        # 当前挂着的那个也算画面里的人，但同样要过一遍消歧
        # （否则「苯胺」会被当成第二个人加回来）
        if current:
            found = drop_contained([*found, current])
        if len(found) > 1:
            planned[file] = found

    print(f"=== 会写入 characters 的多角色图：{len(planned)} 张 ===")
    for file, chars in planned.items():
        reason = OVERRIDES.get(file, (None, "文件名匹配"))[1]
        print(f"  {file[:52]:<52} {len(chars)} 人: {'、'.join(chars):<24} [{reason}]")

    if UNKNOWN:
        print("\n=== 判不准、等你认领的 ===")
        for file, question in UNKNOWN.items():
            print(f"  {file[:52]:<52} {question}")

    if not args.apply:
        print("\n（以上只是计划；确认后加 --apply 写入）")
        return 0

    changed = 0
    for file, chars in planned.items():
        if items[file].get("characters") == chars:
            continue
        items[file]["characters"] = chars
        changed += 1
    with open(META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent="\t")
        fh.write("\n")
    print(f"\n写入 {changed} 张图的 characters 字段")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
