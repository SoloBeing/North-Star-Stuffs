#!/usr/bin/env python3
"""Read the fill-in boxes out of an official form's own vector strokes.

    python3 scripts/extract-form-boxes.py frontend/public/forms/form93.pdf 1 2

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
"""

import re
import subprocess
import sys
from collections import defaultdict

TOL = 0.75   # line caps; anything tighter loses the outer cell of each row
SNAP = 0.6   # clustering tolerance when grouping verticals into a row


def _pt(line):
    m = re.search(r'x="([-\d.e]+)" y="([-\d.e]+)"', line)
    return float(m.group(1)), float(m.group(2))


def segments(pdf, page):
    """Every stroked line segment on the page, in top-down page coordinates."""
    xml = subprocess.run(
        ["mutool", "draw", "-F", "trace", "-o", "-", pdf, str(page)],
        capture_output=True, text=True, check=True,
    ).stdout

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


def rows(pdf, page):
    horiz, vert = [], []
    for (x0, y0), (x1, y1) in segments(pdf, page):
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
    pdf, pages = argv[1], [int(p) for p in argv[2:]] or [1]
    for page in pages:
        found = rows(pdf, page)
        total = sum(len(r["cells"]) for r in found)
        print(f"=== PAGE {page}: {len(found)} rows, {total} cells")
        for r in found:
            span = f'{r["cells"][0][0]:.1f}-{r["cells"][-1][1]:.1f}'
            print(f'  y={r["yTop"]:7.2f}-{r["yBot"]:<7.2f} x={span:>15s} '
                  f'n={len(r["cells"]):3d}')


if __name__ == "__main__":
    main(sys.argv)
