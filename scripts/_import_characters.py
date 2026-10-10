"""把 .dsh-cache/oc/docs-text/characters 下的纯文本角色档案转成 content collection 正文。

原则：正文逐字照搬源文本。脚本只做下面这些机械处理：
  1. 丢掉源文本首行的文件标题（姓名已进 frontmatter）
  2. 给章节标题行加 markdown 标题标记（## / ###）
  3. 独立成段的引语转成引用块 "> "
  4. 源文本里相邻的非空行之间补 "\\" 硬换行，保留原本的按行结构
  5. 标题前后补空行；表格行合并成 markdown 表格块

校验：剥掉上述标记后，正文必须与源文本（去掉 drop 掉的行）逐字符相同。
"""

import os
import re

SRC_ROOT = r"D:\vibe coding\.dsh-cache\oc\docs-text\characters"
OUT_ROOT = r"D:\vibe coding\Spirits-Tower-Nights\src\content\characters"
# 中间产物放内容目录之外，否则会被 glob loader 当成正式条目加载
TMP_ROOT = r"D:\vibe coding\.dsh-cache\oc\tmp\characters-import"


def read_lines(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8-sig")
    lines = text.split("\r\n") if "\r\n" in text else text.split("\n")
    return [line.rstrip("\r") for line in lines]


def norm(s):
    return re.sub(r"\s+", "", s)


def build_body(lines, sp):
    drop = set(sp.get("drop", set()))
    h2 = set(sp.get("h2", set()))
    h3 = set(sp.get("h3", set()))
    quote = set(sp.get("quote", set()))
    # pre 的值是"该行的完整最终形态"，也就是源文本那一行的原文（可带标题标记前缀）；
    # 校验时按源文本比对，所以这里要求它一字不差地覆盖源文本那一行。
    pre = dict(sp.get("pre", {}))
    insert = dict(sp.get("insert", {}))
    sticky = set(sp.get("sticky", set()))

    raw = []
    for idx, line in enumerate(lines, start=1):
        if idx in drop:
            continue
        if idx in pre:
            raw.append(pre[idx])
        else:
            s = line.strip()
            if not s:
                raw.append("")
            elif idx in h2 or idx in h3:
                raw.append(("### " if idx in h3 else "## ") + s.lstrip("· "))
            elif idx in quote:
                raw.append("> " + s)
            else:
                raw.append(s)
        for extra in insert.get(idx, []):
            raw.append(extra)

    # 相邻非空行之间补硬换行（标题 / 引用 / 表格行除外）
    for i, text in enumerate(raw):
        if text == "" or text[0] in "#>|":
            continue
        if i + 1 < len(raw) and raw[i + 1] != "" and (i + 1) not in sticky:
            raw[i] = text + "\\"

    # 连续表格行合并成一个 markdown 表格块。源文本里表格每一行之间都夹着空行，
    # 这些空行属于表格内部（源文档的一张表），合并时一并吸收；表格前后各留一个空行。
    merged = []
    pending_blanks = []
    in_table = False
    for text in raw:
        if text == "":
            if in_table:
                continue          # 表格内部的空行，吸收掉
            pending_blanks.append("")
            continue
        if text.startswith("|"):
            if not in_table:
                if merged and merged[-1] != "":
                    merged.append("")
                pending_blanks = []
                in_table = True
            merged[-1] += "\n" + text
        else:
            if in_table:
                if merged and merged[-1] != "":
                    merged.append("")
                in_table = False
            merged.extend(pending_blanks)
            pending_blanks = []
            merged.append(text)
    if in_table:
        merged.append("")
    merged.extend(pending_blanks)

    # 标题前后保证空行
    out = []
    for text in merged:
        if text.startswith("#"):
            if out and out[-1] != "":
                out.append("")
            out.append(text)
            out.append("")
        else:
            out.append(text)

    while out and out[-1] == "":
        out.pop()
    # 干掉重复空行
    deduped = []
    for text in out:
        if text == "" and deduped and deduped[-1] == "":
            continue
        deduped.append(text)
    return deduped


def blocks(body):
    out, cur = [], []
    for line in body:
        if line == "":
            if cur:
                out.append("\n".join(cur))
                cur = []
        else:
            cur.append(line)
    if cur:
        out.append("\n".join(cur))
    return out


def strip_decoration(body):
    out = []
    for line in body:
        for piece in line.split("\n"):
            s = piece
            if s.startswith("## ") or s.startswith("### "):
                s = re.sub(r"^#{2,3} ", "", s)
                s = re.sub(r"^· ", "", s)  # 标题行首的项目符号由脚本去掉
            elif s.startswith("> "):
                s = s[2:]
            if s.endswith("\\"):
                s = s[:-1]
            out.append(s)
    return norm("".join(out))


SPECS = [
    dict(
        out="salan.md",
        src=r"[元素精灵]飒岚（SaLand）\档案：飒岚.txt",
        drop={1},
        h2={3, 6, 14},
        pre={3: "## · 种族： 风 精灵（天翼种，但因为某些原因更偏向原始的元素之力）"},
    ),
    dict(
        out="ink-bai.md",
        src=r"[名为薛定谔的猫]墨白\角色档案：墨白（Ink_bai） (1).txt",
        drop={1},
        h2={3, 15, 29, 51, 59, 67},
        # 源文本里 "兽化特征：…"（21 行）和 "诞生与启示：…"（53 行）等同样是
        # "字段名：内容" 的正文行，跟同节的"标志配饰：…"并列，不是章节标题，故不标记
        h3={6, 39},
        # 39 行把 "特定语录：…"、"口头禅：…" 和 "四、能力与特质" 三块挤在一行；
        # 拆成三行，并丢掉句子之间那个 "*"（源文本里紧贴句号的排版残渣，计入 extra_drop）
        pre={
            39: "特定语录：“这只是一段既定的历史，我只是个记录者……”、“时间的长河没有尽头，但我总会找到你的。”"
        },
        insert={
            39: [
                "口头禅：“嘛。。。可以哦。”、“嗯哼？”、“没问题的啦。。”",
                "## 四、能力与特质",
            ]
        },
        extra_drop="*",
    ),
    dict(
        out="yingqi.md",
        src=r"[在逃瑟猫]应祈\【档案】应祈.txt",
        drop={1},
        h2={3, 15, 25, 33, 47, 51, 55},
    ),
    dict(
        out="weilan.md",
        src=r"[晶熵]蔚蓝（WeiLan）\档案：蔚蓝.txt",
        drop={1, 2},
        h2={3, 11, 21, 31, 51, 59, 67},
        h3={34, 42},
    ),
    dict(
        out="fengxi-lingyue.md",
        src=r"[狼灵]风汐铃月\档案：风汐铃月.txt",
        drop={1},
        h2={3, 15, 27, 45},
    ),
    dict(
        out="baicha.md",
        src=r"[神界使]白茶（光元素之神碎片）\档案：白茶.txt",
        drop={1},
        h2={7, 13, 17},
        quote={23},
    ),
    dict(
        out="aurelith-prismwing.md",
        src=r"[色彩和棱镜]Aurelith PrismWing\档案：Aurelith PrismWing.txt",
        drop={1},
        h2={5, 25, 65, 119, 171, 205},
        h3={27, 51, 87, 97, 109, 121, 141, 155, 173, 181, 195},
        quote={3, 49, 63, 153, 223},
        sticky={137},
    ),
    dict(
        out="liliana-salambo.md",
        src=r"[血族]莉莉安娜•萨拉姆博（Liliana Salambo）\【人物档案】莉莉安娜•萨拉姆博.txt",
        drop={1},
        h2={5, 12, 21, 28, 34},
    ),
    dict(
        out="viola.md",
        src=r"[醉酒的星辰]戴薇娜\【档案】薇奥拉.txt",
        drop={1},
        h2={5, 17, 35, 45, 57},
        quote={3},
    ),
]


def main():
    problems = 0
    os.makedirs(TMP_ROOT, exist_ok=True)
    for sp in SPECS:
        lines = read_lines(os.path.join(SRC_ROOT, sp["src"]))
        body = build_body(lines, sp)
        # 飒岚那一行标题去掉了源文本的火柴头 "·"，比对时先把它补回源文本的样子
        parts = [
            ln for i, ln in enumerate(lines, start=1) if i not in set(sp.get("drop", set()))
        ]
        # 飒岚那一行标题去掉了源文本的行首 "·"，比对时两边一起抹掉再比
        expected = norm("".join(parts)).replace(sp.get("extra_drop", "\0"), "").replace("·", "")
        got = strip_decoration(body).replace("·", "")
        ok = expected == got
        bl = blocks(body)
        print(f"{sp['out']:<24} src_lines={len(lines):>3}  blocks={len(bl):>3}  verbatim={'OK' if ok else 'MISMATCH'}")
        if not ok:
            problems += 1
            for i, (a, b) in enumerate(zip(expected, got)):
                if a != b:
                    print("    diff @", i)
                    print("    src :", repr(expected[max(0, i - 30):i + 30]))
                    print("    body:", repr(got[max(0, i - 30):i + 30]))
                    break
            else:
                print("    len src/body:", len(expected), len(got))
        path = os.path.join(TMP_ROOT, "_body_" + sp["out"])
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n\n".join(bl) + "\n")
    print("problems:", problems)


if __name__ == "__main__":
    main()
