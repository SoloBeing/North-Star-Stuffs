#!/usr/bin/env python3
"""Pair every row that extract-form-boxes.py found with the text near it.

    python3 scripts/label-form-rows.py path/to/form.pdf 1 2

Prints one line per row: the index within the page, its y-band, its cell count,
and the words sitting to the left of the row (or above it, if nothing is to the
left). That is enough to propose slot names — the "1 First Name" style labels
Indian government forms print inside the leftmost cells of a row come out as
the pairing.

Companion to extract-form-boxes.py and stamp-form-boxes.mjs. The three
together are the pipeline for adding an official-form overlay: extract the
geometry, read what each row is called, look at a stamped copy to check.
"""

import html
import importlib.util
import logging
import re
import subprocess
import sys
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

HERE: Path = Path(__file__).resolve().parent
EXTRACT: Path = HERE / "extract-form-boxes.py"

WORD_RE = re.compile(
    r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" '
    r'xMax="([-\d.]+)" yMax="([-\d.]+)">([^<]+)</word>'
)


def load_extractor():
    spec = importlib.util.spec_from_file_location("efb", EXTRACT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def bbox_words(pdf: Path, page: int) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
        out_path: Path = Path(tmp.name)
    try:
        subprocess.run(
            ["pdftotext", "-bbox-layout",
             "-f", str(page), "-l", str(page),
             str(pdf), str(out_path)],
            check=True, capture_output=True,
        )
        words: list[dict] = []
        for m in WORD_RE.finditer(out_path.read_text(encoding="utf-8")):
            x0, y0, x1, y1, txt = m.groups()
            words.append({
                "x0": float(x0), "y0": float(y0),
                "x1": float(x1), "y1": float(y1),
                "text": html.unescape(txt),
            })
        return words
    finally:
        out_path.unlink(missing_ok=True)


def labels_for(row: dict, words: list[dict]) -> str:
    yt: float = row["yTop"]
    yb: float = row["yBot"]
    x_left: float = row["cells"][0][0]
    x_right: float = row["cells"][-1][1]

    band: list[dict] = [w for w in words
                        if w["y0"] <= yb + 2 and w["y1"] >= yt - 2]
    left: list[dict] = [w for w in band if w["x1"] <= x_left + 1]
    left.sort(key=lambda w: w["x0"])
    if left:
        return " ".join(w["text"] for w in left)[:80]
    above: list[dict] = [w for w in words
                         if yt - 14 <= w["y1"] <= yt - 1
                         and w["x1"] >= x_left - 40
                         and w["x0"] <= x_right + 40]
    above.sort(key=lambda w: (w["y0"], w["x0"]))
    return "^ " + " ".join(w["text"] for w in above)[:78] if above else "(no label)"


def main(argv: list[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if len(argv) < 3:
        sys.exit("usage: label-form-rows.py <pdf> <page> [page ...]")
    pdf: Path = Path(argv[1]).resolve()
    pages: list[int] = [int(p) for p in argv[2:]]
    efb = load_extractor()

    for page in pages:
        rows: list[dict] = efb.rows(str(pdf), page)
        words: list[dict] = bbox_words(pdf, page)
        logger.info("\n=== PAGE %d — %d rows", page, len(rows))
        logger.info("%-4s %-16s %-4s  %s",
                    "idx", "y (top-bot)", "n", "label (left / ^above)")
        for i, r in enumerate(rows):
            y_range: str = f'{r["yTop"]:.1f}-{r["yBot"]:.1f}'
            n: int = len(r["cells"])
            logger.info("%-4d %-16s %-4d  %s", i, y_range, n, labels_for(r, words))


if __name__ == "__main__":
    main(sys.argv)
