"""Self-test for extract-form-boxes.py — one hand-drawn form per case.

    python3 scripts/extract-form-boxes.test.py

The extractor measures ink nobody can check by eye, so a cell it misses
looks exactly like a form that has no box there. Each case draws strokes
directly, breaks one thing, and asserts what comes back.

The run-of-strokes case is the one that shipped broken: PMUY draws a row's
top and bottom edge segment by segment, so a cell spanning two of them is
closed by touching collinear strokes rather than one long one. Requiring a
single stroke silently dropped four cells from the caste row, the whole
e-mail box, and nine cells of Form 93 page 4.
"""

import importlib.util
import logging
import sys
from pathlib import Path
from types import ModuleType

logger = logging.getLogger(__name__)

EXTRACTOR: Path = Path(__file__).resolve().parent / "extract-form-boxes.py"

Point = tuple[float, float]
Segment = tuple[Point, Point]
Cell = list[float]


def load_extractor() -> ModuleType:
    spec = importlib.util.spec_from_file_location("extract_form_boxes", EXTRACTOR)
    module: ModuleType = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def vertical(x: float, y_top: float, y_bot: float) -> Segment:
    return ((x, y_top), (x, y_bot))


def horizontal(y: float, x_start: float, x_end: float) -> Segment:
    return ((x_start, y), (x_end, y))


def comb(y_top: float, y_bot: float, xs: list[float],
         edge_xs: list[float] | None = None, inset: float = 0.0) -> list[Segment]:
    """A row: a vertical at every x in xs, edges drawn between edge_xs."""
    stops: list[float] = xs if edge_xs is None else edge_xs
    segs: list[Segment] = [vertical(x, y_top, y_bot) for x in xs]
    for y in (y_top, y_bot):
        for left, right in zip(stops, stops[1:]):
            segs.append(horizontal(y, left + inset, right - inset))
    return segs


def one_long_edge(y_top: float, y_bot: float, xs: list[float]) -> list[Segment]:
    return comb(y_top, y_bot, xs, edge_xs=[xs[0], xs[-1]])


def cells_found(module: ModuleType, segs: list[Segment]) -> list[Cell]:
    module.segments = lambda pdf, page: segs
    found: list[dict] = module.rows("unused.pdf", 1)
    return [cell for row in found for cell in row["cells"]]


def cases() -> list[tuple[str, list[Segment], list[Cell]]]:
    return [
        (
            "a plain comb under one long edge",
            one_long_edge(100.0, 112.0, [0.0, 10.0, 20.0, 30.0]),
            [[0.0, 10.0], [10.0, 20.0], [20.0, 30.0]],
        ),
        (
            "a comb whose edges are drawn cell by cell",
            comb(100.0, 112.0, [0.0, 10.0, 20.0, 30.0]),
            [[0.0, 10.0], [10.0, 20.0], [20.0, 30.0]],
        ),
        (
            "a cell spanning two edge strokes (PMUY caste row)",
            comb(100.0, 112.0, [0.0, 10.0, 30.0, 40.0],
                 edge_xs=[0.0, 10.0, 20.0, 30.0, 40.0]),
            [[0.0, 10.0], [10.0, 30.0], [30.0, 40.0]],
        ),
        (
            "one wide box spanning twelve edge strokes (PMUY e-mail)",
            comb(100.0, 112.0, [0.0, 120.0],
                 edge_xs=[float(x) for x in range(0, 130, 10)]),
            [[0.0, 120.0]],
        ),
        (
            "an edge with a real gap in it closes nothing",
            comb(100.0, 112.0, [0.0, 10.0, 20.0, 30.0],
                 edge_xs=[0.0, 10.0, 20.0, 30.0])[:4]
            + [horizontal(y, a, b) for y in (100.0, 112.0)
               for a, b in ((0.0, 10.0), (20.0, 30.0))],
            [[0.0, 10.0], [20.0, 30.0]],
        ),
        (
            "line caps leaving each stroke a quarter point short",
            comb(100.0, 112.0, [0.0, 10.0, 20.0], inset=0.25),
            [[0.0, 10.0], [10.0, 20.0]],
        ),
        (
            "a registration mark above the page top",
            one_long_edge(-20.0, -8.0, [0.0, 10.0, 20.0]),
            [],
        ),
        (
            "a band too short to be a fill row",
            one_long_edge(100.0, 103.0, [0.0, 10.0, 20.0]),
            [],
        ),
        (
            "a page frame too wide to be a cell",
            one_long_edge(100.0, 112.0, [0.0, 500.0, 510.0]),
            [[500.0, 510.0]],
        ),
    ]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    module: ModuleType = load_extractor()
    failures: int = 0
    for name, segs, expected in cases():
        actual: list[Cell] = cells_found(module, segs)
        if actual == expected:
            logger.info("  ok    %s", name)
        else:
            failures += 1
            logger.error("  FAIL  %s", name)
            logger.error("        expected %s", expected)
            logger.error("        got      %s", actual)
    if failures:
        logger.error("%d of %d cases failed", failures, len(cases()))
        sys.exit(1)
    logger.info("%d cases passed", len(cases()))


if __name__ == "__main__":
    main()
