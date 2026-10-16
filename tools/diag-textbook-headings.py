#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""对照实验：搞清楚为什么有些「卷/章」标题在 PDF 里提取不到、量不到页码。

背景：修好标题层级之后，build_t6.py 量页码时有 22 条定位不到 —— 那些标题
在 PDF 提取出来的文本里字符顺序是乱的（例：'第一卷　 ：法 、魔力与施法者总论 则'）。
本脚本把骨架复制到 ASCII 路径下，分别导出 PDF，再检查这些标题能否按行首找到。

用法： python tools/diag-textbook-headings.py
"""
import os
import re
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from pypdf import PdfReader

WS = r"C:\Users\water2H2O\Desktop\oc相关\【原创&本家】水塔夜谈"
SKEL = os.path.join(WS, "_build", "skeleton.docx")
TMP = r"D:\vibe_coding\.dsh-cache\t6exp"
NODE = r"C:\Users\water2H2O\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
CLI = (
    r"C:\Users\water2H2O\AppData\Local\Programs\DeepSeek Harness\resources"
    r"\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js"
)
EA = "微软雅黑"
HEAD_RE = re.compile(r"^(第[一二三四五六七八九十]+卷|第[一二三四五六七八九十]+章)[\u3000 ]")


def convert(src: str, dst: str) -> bool:
    if os.path.exists(dst):
        os.remove(dst)
    result = subprocess.run(
        [NODE, CLI, "convert", "--input", src, "--output", dst],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if not os.path.exists(dst):
        print("  转换失败：", (result.stdout or "")[-300:], (result.stderr or "")[-300:])
        return False
    return True


def report(pdf_path: str, label: str):
    reader = PdfReader(pdf_path)
    titles = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for line in text.split("\n"):
            stripped = line.strip()
            if HEAD_RE.match(stripped):
                titles.append((index, stripped))
    print(f"  {label}：{len(reader.pages)} 页，能按行首找到的卷/章标题 {len(titles)} 个")
    for page, title in titles[:6]:
        print(f"    第{page}页 {title[:46]!r}")
    return len(titles)


def apply_explicit_font(src: str, dst: str) -> int:
    """给卷/章标题补上直接字体与字号（覆盖样式里继承的主题字体）。"""
    doc = Document(src)
    count = 0
    for para in doc.paragraphs:
        text = para.text.strip()
        if HEAD_RE.match(text):
            for run in para.runs:
                run.font.name = EA
                rpr = run._element.get_or_add_rPr()
                fonts = rpr.find(qn("w:rFonts"))
                if fonts is None:
                    fonts = OxmlElement("w:rFonts")
                    rpr.insert(0, fonts)
                for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
                    fonts.set(qn(attr), EA)
                run.font.size = Pt(16 if "卷" in text[:6] else 14)
            count += 1
    doc.save(dst)
    return count


def main() -> int:
    os.makedirs(TMP, exist_ok=True)
    plain_docx = os.path.join(TMP, "plain.docx")
    plain_pdf = os.path.join(TMP, "plain.pdf")
    fixed_docx = os.path.join(TMP, "fixed.docx")
    fixed_pdf = os.path.join(TMP, "fixed.pdf")

    shutil.copy2(SKEL, plain_docx)
    print("A 原样（标题只用样式）")
    if not convert(plain_docx, plain_pdf):
        return 1
    report(plain_pdf, "A")

    changed = apply_explicit_font(SKEL, fixed_docx)
    print(f"\nB 补直接字体与字号（改了 {changed} 个标题）")
    if not convert(fixed_docx, fixed_pdf):
        return 1
    report(fixed_pdf, "B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
