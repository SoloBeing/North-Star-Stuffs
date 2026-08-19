#!/usr/bin/env python3
"""Print a row's cells and the words physically sitting inside its band.

    python3 scripts/row-detail.py <pdf> <page> [rowIdx ...]

label-form-rows.py only looks left of a row, so on this form (labels printed
inside the leftmost cells) it falls back to the band above and reports the
previous row's text. This prints both: every cell with its index and x-span,
and every word in the band with the cell index it lands in.
"""

import html
import importlib.util
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXTRACT = HERE / "extract-form-boxes.py"

WORD_RE = re.compile(
    r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" '
    r'xMax="([-\d.]+)" yMax="([-\d.]+)">([^<]+)</word>'
)


def load_extractor():
    spec = importlib.util.spec_from_file_location("efb", EXTRACT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def bbox_words(pdf, page):
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
        out = Path(tmp.name)
    try:
        subprocess.run(["pdftotext", "-bbox-layout", "-f", str(page),
                        "-l", str(page), str(pdf), str(out)],
                       check=True, capture_output=True)
        words = []
        for m in WORD_RE.finditer(out.read_text(encoding="utf-8")):
            x0, y0, x1, y1, txt = m.groups()
            words.append({"x0": float(x0), "y0": float(y0), "x1": float(x1),
                          "y1": float(y1), "text": html.unescape(txt)})
        return words
    finally:
        out.unlink(missing_ok=True)


def cell_of(row, x):
    for i, (a, b) in enumerate(row["cells"]):
        if a - 0.5 <= x <= b + 0.5:
            return i
    return None


def main(argv):
    pdf = Path(argv[1]).resolve()
    page = int(argv[2])
    want = [int(a) for a in argv[3:]]
    efb = load_extractor()
    rows = efb.rows(str(pdf), page)
    words = bbox_words(pdf, page)
    for i, r in enumerate(rows):
        if want and i not in want:
            continue
        print(f"\n=== R{i}  y={r['yTop']:.2f}-{r['yBot']:.2f}  cells={len(r['cells'])}")
        widths = []
        for j, (a, b) in enumerate(r["cells"]):
            widths.append(f"{j}:{a:.2f}-{b:.2f}({b - a:.2f})")
        print("  cells: " + "  ".join(widths))
        band = [w for w in words
                if w["y0"] <= r["yBot"] - 1 and w["y1"] >= r["yTop"] + 1]
        band.sort(key=lambda w: w["x0"])
        if not band:
            print("  words: (none inside band)")
        for w in band:
            c = cell_of(r, (w["x0"] + w["x1"]) / 2)
            print(f'  word x={w["x0"]:7.2f}-{w["x1"]:7.2f} '
                  f'cell={"-" if c is None else c:>3}  {w["text"]!r}')


if __name__ == "__main__":
    main(sys.argv)
