#!/usr/bin/env python3
"""Read the fill-in boxes out of an official form's own vector strokes.

    python3 scripts/extract-form-boxes.py frontend/public/forms/form93.pdf 1 2
    python3 scripts/extract-form-boxes.py caste.pdf 1 --ink=rects

Prints one line per row found: page, vertical extent, and the x-span of every
cell. Feed those into a `*-boxes.json` slot map by hand — naming a row is a
judgement call that has to be checked against the form's printed labels, and
guessing it is how data lands in the wrong government box.

── Why this exists ────────────────────────────────────────────────────────
Official forms have no AcroForm (`pdfinfo` reports `Form: none`), so the boxes
are ink rather than fields and there is nothing to `setText()`. Positions have
to be measured. Step 7 of the build log did this once with a throwaway script
that was never committed, and step 12 had to write it again from the prose
description. Hence this file.

── The rule ───────────────────────────────────────────────────────────────
A cell is an x-interval carrying a top stroke, a bottom stroke, AND a vertical
stroke down both sides. Requiring all four edges is not fussiness; the two
cheaper rules both fail silently:

  * Even-pitch runs break at the first wide cell and return the longest run
    found, turning a 12-cell Aadhaar row into 8.
  * Top-and-bottom only pairs one row's bottom edge with the next row's, so
    stacked address rows each appear twice.

Line caps leave a horizontal's endpoint up to ~0.25pt short of the vertical's
centreline, which is why the edge lookup is tolerant rather than exact — an
exact match drops the first and last cell of every row.

── Two families of ink ────────────────────────────────────────────────────
Form 93 and PMUY draw a row's edges as separate open strokes, so a box is
built from its neighbours' shared verticals. A form made in Word draws boxes
two other ways, and mixes them on one page: a shape is a closed rectangle
whose fourth side is a `closepath`, and a table's borders are 0.5pt filled
rectangles. `--ink=rects` reads both of those; `combs` is the default and the
parse both shipped maps were measured under. Do not change what `combs`
returns without re-deriving them — their specs pin rows by position.
"""

import re
import subprocess
import sys
from collections import defaultdict

TOL = 0.75   # line caps; anything tighter loses the outer cell of each row
SNAP = 0.6   # clustering tolerance when grouping verticals into a row

COMBS: str = "combs"   # edges drawn stroke by stroke, verticals shared
RECTS: str = "rects"   # closed rectangles, and table borders drawn as thin fills
INKS: tuple[str, ...] = (COMBS, RECTS)

HAIRLINE = 2.0   # a filled rectangle this thin is a rule, not a shape


def _pt(line):
    m = re.search(r'x="([-\d.e]+)" y="([-\d.e]+)"', line)
    return float(m.group(1)), float(m.group(2))


def _trace(pdf, page):
    return subprocess.run(
        ["mutool", "draw", "-F", "trace", "-o", "-", pdf, str(page)],
        capture_output=True, text=True, check=True,
    ).stdout


def _comb_segments(xml):
    """Both shipped maps were measured with this. Changing it moves their rows.

    It takes points from every element, not just stroked ones, and applies
    whichever transform the last stroke_path carried. That is arbitrary, but
    Form 93 and PMUY were verified box by box under it, and their specs pin
    rows by position — so a "fix" here silently renumbers them.
    """
    segs, tx, ty, cur = [], 0.0, 0.0, None
    for line in xml.splitlines():
        line = line.strip()
        if line.startswith("<stroke_path"):
            m = re.search(r'transform="([-\d.e ]+)"', line)
            # Every transform this tool emits is (1 0 0 -1 tx ty): the -1 flips
            # y, so tx/ty alone place the point in top-down page space.
            _, _, _, _, tx, ty = (float(v) for v in m.group(1).split())
            cur = None
        elif line.startswith("<moveto"):
            x, y = _pt(line)
            cur = (x + tx, ty - y)
        elif line.startswith("<lineto"):
            x, y = _pt(line)
            nxt = (x + tx, ty - y)
            if cur:
                segs.append((cur, nxt))
            cur = nxt
    return segs


def _hairline(pts: list[tuple[float, float]]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """The centreline of a filled rectangle thin enough to be a rule.

    Word draws a table's borders as 0.5pt filled rectangles rather than
    strokes, so the Aadhaar and Bhamashah rows of the Rajasthan caste form are
    invisible to any parse that only reads strokes. A rectangle that thin is a
    line, and treating it as one puts both families of box on the same footing.
    """
    if len(pts) < 4:
        return None
    xs: list[float] = [p[0] for p in pts]
    ys: list[float] = [p[1] for p in pts]
    w: float = max(xs) - min(xs)
    h: float = max(ys) - min(ys)
    if h <= HAIRLINE < w:
        y: float = (min(ys) + max(ys)) / 2
        return ((min(xs), y), (max(xs), y))
    if w <= HAIRLINE < h:
        x: float = (min(xs) + max(xs)) / 2
        return ((x, min(ys)), (x, max(ys)))
    return None


def _rect_segments(xml: str) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Stroked ink where a closed path really closes, plus hairline fills."""
    segs: list[tuple[tuple[float, float], tuple[float, float]]] = []
    tx: float = 0.0
    ty: float = 0.0
    cur: tuple[float, float] | None = None
    start: tuple[float, float] | None = None
    stroking: bool = False
    filling: bool = False
    fill: list[tuple[float, float]] = []

    def flush_fill() -> None:
        rule = _hairline(fill) if filling else None
        if rule:
            segs.append(rule)
        fill.clear()

    for raw in xml.splitlines():
        line: str = raw.strip()
        if line.startswith("<stroke_path") or line.startswith("<fill_path"):
            flush_fill()
            m = re.search(r'transform="([-\d.e ]+)"', line)
            _, _, _, _, tx, ty = (float(v) for v in m.group(1).split())
            stroking = line.startswith("<stroke_path")
            filling = not stroking
            cur = start = None
        elif re.match(r"<(?!moveto|lineto|closepath)\w+", line):
            # A clip path repeats each glyph run's bounding box, so it invents a
            # box around every label. Only stroked ink and hairline fills count.
            flush_fill()
            stroking = filling = False
        elif filling and (line.startswith("<moveto") or line.startswith("<lineto")):
            x, y = _pt(line)
            fill.append((x + tx, ty - y))
        elif not stroking:
            continue
        elif line.startswith("<moveto"):
            x, y = _pt(line)
            cur = start = (x + tx, ty - y)
        elif line.startswith("<lineto"):
            x, y = _pt(line)
            nxt: tuple[float, float] = (x + tx, ty - y)
            if cur:
                segs.append((cur, nxt))
            cur = nxt
        elif line.startswith("<closepath"):
            # The fourth side. A rectangle is three linetos and this, so
            # without it every box drawn this way is missing an edge and the
            # row finder closes nothing at all.
            if cur and start and cur != start:
                segs.append((cur, start))
            cur = start
    flush_fill()
    return segs


def segments(pdf, page, ink=COMBS):
    """Every line segment on the page, in top-down page coordinates."""
    xml = _trace(pdf, page)
    return _rect_segments(xml) if ink == RECTS else _comb_segments(xml)


def rows(pdf, page, ink=COMBS):
    horiz, vert = [], []
    for (x0, y0), (x1, y1) in segments(pdf, page, ink):
        if abs(y1 - y0) < 0.3 and abs(x1 - x0) > 1.0:
            horiz.append((min(x0, x1), max(x0, x1), (y0 + y1) / 2))
        elif abs(x1 - x0) < 0.3 and abs(y1 - y0) > 1.0:
            vert.append(((x0 + x1) / 2, min(y0, y1), max(y0, y1)))

    bands = defaultdict(list)
    for x, yt, yb in vert:
        bands[(round(yt / SNAP), round(yb / SNAP))].append((x, yt, yb))

    def has_h(y, xa, xb):
        # A cell's edge is often not one stroke: forms that print a comb draw
        # it segment by segment, so a cell spanning two of them is closed by a
        # run of touching collinear strokes rather than a single long one.
        run = None
        for hx0, hx1 in sorted((h[0], h[1]) for h in horiz if abs(h[2] - y) <= TOL):
            if run is None or hx0 > run[1] + TOL:
                run = [hx0, hx1]
            else:
                run[1] = max(run[1], hx1)
            if run[0] <= xa + TOL and run[1] >= xb - TOL:
                return True
        return False

    out = []
    for verticals in bands.values():
        verticals.sort()
        yt = sum(v[1] for v in verticals) / len(verticals)
        yb = sum(v[2] for v in verticals) / len(verticals)
        if yb - yt < 5:                       # too short to be a fill row
            continue
        if yb <= 0:                           # registration marks off the page
            continue
        cells = []
        for i in range(len(verticals) - 1):
            x0, x1 = verticals[i][0], verticals[i + 1][0]
            if not (3 < x1 - x0 < 400):       # gutters and full-page frames
                continue
            if has_h(yt, x0, x1) and has_h(yb, x0, x1):
                cells.append([round(x0, 2), round(x1, 2)])
        if cells:
            out.append({"page": page, "yTop": round(yt, 2),
                        "yBot": round(yb, 2), "cells": cells})
    out.sort(key=lambda r: (r["yTop"], r["cells"][0][0]))
    return out


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    ink: str = COMBS
    args: list[str] = []
    for a in argv[1:]:
        if a.startswith("--ink="):
            ink = a.split("=", 1)[1]
            if ink not in INKS:
                sys.exit(f"--ink must be one of {', '.join(INKS)}")
        else:
            args.append(a)
    pdf, pages = args[0], [int(p) for p in args[1:]] or [1]
    for page in pages:
        found = rows(pdf, page, ink)
        total = sum(len(r["cells"]) for r in found)
        print(f"=== PAGE {page} [{ink}]: {len(found)} rows, {total} cells")
        for r in found:
            span = f'{r["cells"][0][0]:.1f}-{r["cells"][-1][1]:.1f}'
            print(f'  y={r["yTop"]:7.2f}-{r["yBot"]:<7.2f} x={span:>15s} '
                  f'n={len(r["cells"]):3d}')


if __name__ == "__main__":
    main(sys.argv)
