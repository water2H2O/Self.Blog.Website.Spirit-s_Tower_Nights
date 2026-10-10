"""把 docx 批量提取成纯文本（保留段落顺序与表格），供内容导入使用。

用法：
    python tools/extract-docx.py <源目录> <输出目录> [--recursive]

输出：
    <输出目录>/<相对路径>.txt         每个 docx 一个文本文件
    <输出目录>/_index.txt             清单（原文件、段落数、表格数、字符数）
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import docx  # python-docx
    from docx.document import Document as DocxDocument
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.table import Table
    from docx.text.paragraph import Paragraph
except ImportError:
    print("需要 python-docx：pip install python-docx", file=sys.stderr)
    raise SystemExit(1)


def iter_blocks(document: DocxDocument):
    """按文档顺序产出段落与表格。"""
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def para_to_md(paragraph: Paragraph) -> str:
    text = "".join(run.text for run in paragraph.runs).replace("\xa0", " ").strip()
    if not text:
        return ""
    style = (paragraph.style.name or "").lower() if paragraph.style is not None else ""
    if style.startswith("heading") or style.startswith("标题"):
        level = "".join(ch for ch in style if ch.isdigit()) or "2"
        level = min(int(level), 6)
        return f"{'#' * level} {text}"
    if style.startswith("list"):
        return f"- {text}"
    return text


def table_to_md(table: Table) -> list[str]:
    rows = []
    for row in table.rows:
        cells = [cell.text.replace("\xa0", " ").replace("\n", " ").strip() for cell in row.cells]
        rows.append("| " + " | ".join(cells) + " |")
    if len(rows) >= 1:
        # 补一行分隔，凑成合法 markdown 表格
        width = rows[0].count("|") - 1
        rows.insert(1, "|" + "---|" * width)
    return rows


def convert(src: Path, dst: Path) -> tuple[int, int, int]:
    document = docx.Document(str(src))
    lines: list[str] = []
    paragraphs = 0
    tables = 0
    for block in iter_blocks(document):
        if isinstance(block, Paragraph):
            line = para_to_md(block)
            if line:
                lines.append(line)
                paragraphs += 1
        else:
            tables += 1
            lines.extend(table_to_md(block))
            lines.append("")
    text = "\n\n".join(lines).strip() + "\n"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding="utf-8")
    return paragraphs, tables, len(text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("dest")
    parser.add_argument("--recursive", action="store_true")
    args = parser.parse_args()

    source = Path(args.source)
    dest = Path(args.dest)
    if not source.exists():
        print(f"source not found: {source}", file=sys.stderr)
        return 1

    walker = source.rglob("*") if args.recursive else source.glob("*")
    files = sorted(p for p in walker if p.suffix.lower() == ".docx" and not p.name.startswith("~$"))

    index_lines = [f"{'原文件':<60} {'段落':>5} {'表':>3} {'字符':>7}"]
    ok = 0
    failed = 0
    for path in files:
        rel = path.relative_to(source)
        out = dest / rel.with_suffix(".txt")
        try:
            paragraphs, tables, chars = convert(path, out)
            index_lines.append(f"{str(rel):<60} {paragraphs:>5} {tables:>3} {chars:>7}")
            ok += 1
        except Exception as exc:  # noqa: BLE001
            index_lines.append(f"{str(rel):<60}   读取失败: {exc}")
            failed += 1

    dest.mkdir(parents=True, exist_ok=True)
    (dest / "_index.txt").write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    print(f"converted={ok} failed={failed} -> {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
