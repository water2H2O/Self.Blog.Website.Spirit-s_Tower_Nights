#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""核对《T6 魔法指令集导论》的目录页码与实际页码是否一致。

做法：
  1. 从 docx 的第一个表格读出目录里印的「标题 → 页码」
  2. 从 PDF 里按页脚页码定位正文（跳过目录所在的页）
  3. 在正文里找每个标题第一次出现的那一页，跟印出来的比

只读，不改任何文件。用法：
    python tools/check-textbook-pdf.py <《T6魔法指令集导论》.pdf> <同名.docx>
"""
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

from docx import Document
from pypdf import PdfReader


def toc_entries(docx_path):
    """目录表 → [(标题, 印出来的页码)]，按表里的顺序。"""
    doc = Document(docx_path)
    if not doc.tables:
        return []
    out = []
    for row in doc.tables[0].rows:
        cells = row.cells
        if len(cells) < 2:
            continue
        title = cells[0].text.strip()
        page = cells[1].text.strip()
        if title and page.isdigit():
            out.append((title, int(page)))
    return out


def pages_of(pdf_path):
    """[(页脚页码 or None, 整页文本)]，按 PDF 物理页顺序。"""
    out = []
    for page in PdfReader(pdf_path).pages:
        text = page.extract_text() or ""
        found = re.search(r"—\s*(\d{1,3})\s*—", text)
        out.append((int(found.group(1)) if found else None, text))
    return out


# 目录行：一行标题后面跟一个页码（目录表导出成 PDF 后就是这个样子）
TOC_LINE = re.compile(r"^(.+?)[\s\u3000]+(\d{1,3})$")


def toc_pages(pages, entries):
    """目录占了哪几页（按物理页序号）。

    不能简单用「页码小于正文首页」来分 —— 这本册子的目录正好排到第 5 页，
    而序篇也从第 5 页开始，两者同页。
    做法：整本书从头扫，记下**最后一条目录行**在哪一页；目录从第 2 页（含「目　录」那页）
    到那一页为止。目录行 = 标题后面跟一个页码，且标题能对上目录表里的条目。
    """
    titles = {re.sub(r"[\s\u3000]+", "", title) for title, _ in entries}
    last_toc_index = None
    for index, (_, text) in enumerate(pages):
        for line in text.split("\n"):
            line = line.strip()
            match = TOC_LINE.match(line)
            if not match:
                continue
            title = re.sub(r"[\s\u3000]+", "", match.group(1))
            if any(t.startswith(title) or title.startswith(t) for t in titles):
                last_toc_index = index
    if last_toc_index is None:
        return []
    return list(range(0, last_toc_index + 1))


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    pdf_path, docx_path = sys.argv[1], sys.argv[2]
    for path in (pdf_path, docx_path):
        if not os.path.exists(path):
            print(f"文件不存在：{path}", file=sys.stderr)
            return 1

    entries = toc_entries(docx_path)
    pages = pages_of(pdf_path)
    print(f"目录条目 {len(entries)} 条 | PDF {len(pages)} 页")

    # 目录占的物理页：只从前面几页里找（目录不可能排到书末）
    head = pages[: min(12, len(pages))]
    skip = set(toc_pages(head, entries))
    print(f"目录页（跳过不查）：物理第 {[i + 1 for i in sorted(skip)] or '（未识别）'} 页")

    body_pages = [
        (no, text) for index, (no, text) in enumerate(pages) if index not in skip and no
    ]
    if body_pages:
        print(f"正文页码范围：{min(no for no, _ in body_pages)} – {max(no for no, _ in body_pages)}")

    def find_page(title: str):
        """在正文页里找这个标题第一次出现在哪一页（按页脚页码返回）。"""
        want = re.sub(r"[\s\u3000]+", "", title)
        for no, text in body_pages:
            for line in text.split("\n"):
                if re.sub(r"[\s\u3000]+", "", line.strip()).startswith(want):
                    return no
        return None

    ok = bad = missing = 0
    problems = []
    for title, printed in entries:
        actual = find_page(title)
        if actual is None:
            missing += 1
            problems.append((title, printed, None))
        elif actual == printed:
            ok += 1
        else:
            bad += 1
            problems.append((title, printed, actual))

    print(f"\n一致 {ok} | 页码不符 {bad} | 正文里找不到 {missing}")
    if problems:
        print("\n有问题的条目：")
        for title, printed, actual in problems:
            actual_text = "找不到" if actual is None else str(actual)
            print(f"  目录印 {printed:>3} | 实际 {actual_text:>4} | {title[:44]}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
