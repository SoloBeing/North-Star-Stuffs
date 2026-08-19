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
    module.segments = lambda pdf, page, ink=module.COMBS: segs
    found: list[dict] = module.rows("unused.pdf", 1)
    return [cell for row in found for cell in row["cells"]]


def trace_xml(paths: list[tuple[str, list[Point], bool]],
              page_height: float = 1000.0) -> str:
    """A mutool trace document, from (element, corners, closed) triples.

    Corners are given in the same top-down space the extractor returns, and
    flipped back here, because a case is unreadable written the other way up.
    """
    out: list[str] = ['<?xml version="1.0"?>', '<document name="t.pdf">',
                      f'<page mediabox="0 0 612 {page_height}">']
    for element, corners, closed in paths:
        out.append(f'<{element} transform="1 0 0 -1 0 {page_height}">')
        for i, (x, y) in enumerate(corners):
            verb: str = "moveto" if i == 0 else "lineto"
            out.append(f'<{verb} x="{x}" y="{page_height - y}"/>')
        if closed:
            out.append("<closepath/>")
        out.append(f"</{element}>")
    out.append("</page>")
    out.append("</document>")
    return "\n".join(out)


def box(x0: float, y_top: float, x1: float, y_bot: float) -> list[Point]:
    """The four corners of a rectangle, the way Word writes one."""
    return [(x0, y_top), (x1, y_top), (x1, y_bot), (x0, y_bot)]


def cells_from_xml(xml: str, ink: str) -> list[Cell]:
    """Run the real XML parser — the half of the extractor segs cases skip.

    Loads its own module because the cases above replace `segments` wholesale,
    and stubbing the trace only reaches the parser if the real one is intact.
    """
    module: ModuleType = load_extractor()
    module._trace = lambda pdf, page: xml
    found: list[dict] = module.rows("unused.pdf", 1, ink)
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


def parser_cases() -> list[tuple[str, str, str, list[Cell]]]:
    """Cases for the XML parse itself, which the cases above stub away.

    The Rajasthan caste form is 27 closed rectangles and almost nothing else,
    so it read as four cells until `closepath` counted. The combs cases below
    pin the parse both shipped maps were measured under; they are not an
    endorsement of it.
    """
    one_rect: list[tuple[str, list[Point], bool]] = [
        ("stroke_path", box(10.0, 100.0, 40.0, 120.0), True),
    ]
    return [
        (
            "a closed rectangle, the way Word draws a box",
            trace_xml(one_rect), "rects", [[10.0, 40.0]],
        ),
        (
            "the same rectangle with its closepath ignored (the shipped bug)",
            trace_xml([("stroke_path", box(10.0, 100.0, 40.0, 120.0), False)]),
            "rects", [],
        ),
        (
            "a clip path around a glyph run is not a box",
            trace_xml([("clip_path", box(10.0, 100.0, 40.0, 120.0), True)]),
            "rects", [],
        ),
        (
            "a fat filled rectangle is printed ink, not a rule",
            trace_xml([("fill_path", box(10.0, 100.0, 40.0, 120.0), True)]),
            "rects", [],
        ),
        (
            "a Word table drawn as hairline fills (the Aadhaar row)",
            # 0.5pt filled rectangles, which is how Word emits a table border:
            # three verticals and an edge above and below.
            trace_xml([("fill_path", box(10.0, 100.0, 10.5, 120.0), True),
                       ("fill_path", box(40.0, 100.0, 40.5, 120.0), True),
                       ("fill_path", box(70.0, 100.0, 70.5, 120.0), True),
                       ("fill_path", box(10.0, 100.0, 70.5, 100.5), True),
                       ("fill_path", box(10.0, 119.5, 70.5, 120.0), True)]),
            "rects", [[10.25, 40.25], [40.25, 70.25]],
        ),
        (
            "a hairline square is a dot, and closes nothing",
            trace_xml([("fill_path", box(10.0, 100.0, 11.0, 101.0), True)]),
            "rects", [],
        ),
        (
            "combs mode is unmoved by hairline fills, so no shipped row shifts",
            trace_xml([("stroke_path", box(10.0, 200.0, 40.0, 220.0), True),
                       ("fill_path", box(10.0, 100.0, 10.5, 120.0), True),
                       ("fill_path", box(40.0, 100.0, 40.5, 120.0), True)]),
            "combs", [],
        ),
        (
            "two rectangles sharing an edge give two cells, not three",
            trace_xml([("stroke_path", box(10.0, 100.0, 40.0, 120.0), True),
                       ("stroke_path", box(40.0, 100.0, 70.0, 120.0), True)]),
            "rects", [[10.0, 40.0], [40.0, 70.0]],
        ),
        (
            "combs mode builds cells out of clip-path ink, as both maps rely on",
            # Only the second box closes: combs never resets the point chain
            # between elements, so the stroke's last corner joins the first
            # box's first corner and drags that vertical into its own band.
            trace_xml([("stroke_path", box(10.0, 200.0, 40.0, 220.0), True),
                       ("clip_path", box(10.0, 100.0, 40.0, 120.0), True),
                       ("clip_path", box(40.0, 100.0, 70.0, 120.0), True)]),
            "combs", [[40.0, 70.0]],
        ),
        (
            "and only because a stroke_path set the transform they borrow",
            trace_xml([("clip_path", box(10.0, 100.0, 40.0, 120.0), True),
                       ("clip_path", box(40.0, 100.0, 70.0, 120.0), True)]),
            "combs", [],
        ),
        (
            "rects mode resets between elements, so neither is dragged",
            trace_xml([("stroke_path", box(10.0, 200.0, 40.0, 220.0), True),
                       ("stroke_path", box(10.0, 100.0, 40.0, 120.0), True),
                       ("stroke_path", box(40.0, 100.0, 70.0, 120.0), True)]),
            "rects", [[10.0, 40.0], [40.0, 70.0], [10.0, 40.0]],
        ),
    ]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    module: ModuleType = load_extractor()
    failures: int = 0
    total: int = 0

    for name, segs, expected in cases():
        total += 1
        actual: list[Cell] = cells_found(module, segs)
        if actual == expected:
            logger.info("  ok    %s", name)
        else:
            failures += 1
            logger.error("  FAIL  %s", name)
            logger.error("        expected %s", expected)
            logger.error("        got      %s", actual)

    for name, xml, ink, expected in parser_cases():
        total += 1
        actual = cells_from_xml(xml, ink)
        if actual == expected:
            logger.info("  ok    [%s] %s", ink, name)
        else:
            failures += 1
            logger.error("  FAIL  [%s] %s", ink, name)
            logger.error("        expected %s", expected)
            logger.error("        got      %s", actual)

    if failures:
        logger.error("%d of %d cases failed", failures, total)
        sys.exit(1)
    logger.info("%d cases passed", total)


if __name__ == "__main__":
    main()
