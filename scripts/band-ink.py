#!/usr/bin/env python3
"""Print every stroke that touches a y-band: verticals, and the horizontals
that could close cells between them.

    python3 scripts/band-ink.py <pdf> <page> <yTop> <yBot>
"""

import importlib.util
import sys
from pathlib import Path

EXTRACT = Path(__file__).resolve().parent / "extract-form-boxes.py"


def load():
    spec = importlib.util.spec_from_file_location("efb", EXTRACT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv):
    pdf, page = argv[1], int(argv[2])
    yt, yb = float(argv[3]), float(argv[4])
    efb = load()
    horiz, vert = [], []
    for (x0, y0), (x1, y1) in efb.segments(pdf, page):
        if abs(y1 - y0) < 0.3 and abs(x1 - x0) > 1.0:
            horiz.append((min(x0, x1), max(x0, x1), (y0 + y1) / 2))
        elif abs(x1 - x0) < 0.3 and abs(y1 - y0) > 1.0:
            vert.append(((x0 + x1) / 2, min(y0, y1), max(y0, y1)))
    print(f"--- horizontals with y in {yt}-{yb}")
    for hx0, hx1, hy in sorted(h for h in horiz if yt - 1 <= h[2] <= yb + 1):
        print(f"  y={hy:8.2f}  x={hx0:7.2f}-{hx1:7.2f} ({hx1 - hx0:6.2f})")
    print(f"--- verticals overlapping {yt}-{yb}")
    for vx, vy0, vy1 in sorted(v for v in vert if v[2] >= yt - 1 and v[1] <= yb + 1):
        print(f"  x={vx:8.2f}  y={vy0:7.2f}-{vy1:7.2f}")


if __name__ == "__main__":
    main(sys.argv)
