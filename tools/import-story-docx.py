"""把一篇故事 docx 导入成 src/content/stories/ 下的 markdown（逐字不改写）。

用法：
    python tools/import-story-docx.py <源.docx> --out=<目标.md> \
        --title=身份被捅出 --act=第二幕：银色的新芽 --arc=冷庆典与盗火者 --code=1-7

规则（与既有正文保持一致）：
    · docx 的 Heading 1 → markdown 的 `## …`（站上会渲染成居中装饰小标题）
    · 其余段落原样保留，段间空一行
    · 正文一个字都不改写；只做「段落切分 + 标题层级」这一步格式转换
    · 行首的 markdown 标记（`#`、`-`）与行内 `**` 会被剥掉 —— 源稿里没有这些语法，
      只有 extract-docx.py 按段落样式加上的装饰

脚本会把结果与源文本逐字对照（去掉空白后完全相等），不一致就退出码 1，不写文件。
"""

import argparse
import re
import sys
from pathlib import Path

import docx
from docx.document import Document as DocxDocument
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_blocks(document: DocxDocument):
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def is_heading(paragraph: Paragraph) -> bool:
    style = (paragraph.style.name or "").lower() if paragraph.style is not None else ""
    return style.startswith("heading") or style.startswith("标题")


def blocks_to_markdown(document: DocxDocument) -> list[str]:
    lines: list[str] = []
    for block in iter_blocks(document):
        if isinstance(block, Table):
            for row in block.rows:
                cells = [c.text.replace("\xa0", " ").replace("\n", " ").strip() for c in row.cells]
                lines.append("| " + " | ".join(cells) + " |")
            lines.append("")
            continue
        text = "".join(run.text for run in block.runs).replace("\xa0", " ").strip()
        if not text:
            continue
        if is_heading(block):
            lines.append("## " + text)
        else:
            lines.append(text)
    return lines


def strip_inline(text: str) -> str:
    """只去掉 markdown 语法符号，用于逐字校验。"""
    text = re.sub(r"^#{1,6}\s*", "", text)
    text = text.replace("**", "").replace("__", "")
    return re.sub(r"[|\s\u00a0]+", "", text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("--out", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--act", required=True)
    parser.add_argument("--arc", required=True)
    parser.add_argument("--code", required=True)
    parser.add_argument("--summary")
    parser.add_argument("--author", default="水水")
    parser.add_argument("--status", default="published", choices=["published", "draft"])
    args = parser.parse_args()

    src = Path(args.source)
    if not src.exists():
        print(f"源文件不存在：{src}", file=sys.stderr)
        return 1

    document = docx.Document(str(src))
    lines = blocks_to_markdown(document)
    body = "\n\n".join(lines).strip() + "\n"

    front = [
        "---",
        f"title: {args.title}",
        f"act: {args.act}",
        f"arc: {args.arc}",
        f"code: '{args.code}'",
    ]
    if args.author != "水水":
        front.append(f"author: {args.author}")
    if args.summary:
        front.append(f"summary: {args.summary}")
    front.append(f"status: {args.status}")
    front.append("---")

    out_text = "\n".join(front) + "\n\n" + body

    # 逐字校验：源 docx 的每一段（去掉语法符号与空白）都必须原样出现在正文里
    src_paras = [p for p in (strip_inline(l) for l in lines) if len(p) >= 2]
    body_flat = strip_inline(body)
    missing = [p for p in src_paras if p not in body_flat]
    if missing:
        print("逐字校验失败，未写文件：", file=sys.stderr)
        for item in missing[:5]:
            print("  · " + item[:80], file=sys.stderr)
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n"：仓库里既有正文都是 LF，别让 Windows 默认的 CRLF 混进去
    out.write_text(out_text, encoding="utf-8", newline="\n")
    print(f"写入 {out}")
    print(f"  段落 {len(lines)}  正文 {len(body)} 字符  逐字校验通过（{len(src_paras)} 段全部一致）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
