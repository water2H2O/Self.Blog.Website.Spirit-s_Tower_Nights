#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""比较「上一版已导入的教材」与「现在 docx 重新导入的结果」，列出作者改了什么。

用法：
    python tools/diff-textbook-import.py <旧的 md 目录> <新的 md 目录>

两侧都是 import-textbook-docx.py 的产出（同一批文件名）。
只报告：新增/删除的文件、段落级的增删改（按「去掉空白与标记」后比较）。
"""
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")


def units(path: str) -> list[str]:
    """把 md 正文切成「段」（去 frontmatter、去标记、去空白），用于逐段比较。"""
    text = open(path, encoding="utf-8").read()
    body = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)
    out = []
    for block in re.split(r"\n{2,}", body):
        flat = re.sub(r"[\s\u3000]+", "", block)
        flat = re.sub(r"^#{1,6}", "", flat)
        flat = re.sub(r"^[-*>|]+", "", flat)
        if flat:
            out.append(flat)
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    old_dir, new_dir = sys.argv[1], sys.argv[2]
    old_files = {f for f in os.listdir(old_dir) if f.endswith(".md")}
    new_files = {f for f in os.listdir(new_dir) if f.endswith(".md")}

    added = sorted(new_files - old_files)
    removed = sorted(old_files - new_files)
    if added:
        print("新增文件：", added)
    if removed:
        print("删除文件：", removed)

    total_changed = 0
    for name in sorted(old_files & new_files):
        before = units(os.path.join(old_dir, name))
        after = units(os.path.join(new_dir, name))
        if before == after:
            continue
        total_changed += 1
        print(f"\n=== {name} ===")
        before_set, after_set = set(before), set(after)
        gone = [u for u in before if u not in after_set]
        new = [u for u in after if u not in before_set]
        for u in gone:
            print(f"  - {u[:96]}")
        for u in new:
            print(f"  + {u[:96]}")
        if not gone and not new:
            print("  （段落集合相同，只是顺序或数量变了）")

    print(f"\n共 {total_changed} 个文件有内容变化")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
