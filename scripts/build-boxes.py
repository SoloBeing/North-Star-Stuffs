"""Turn a named slot spec into the *-boxes.json an official form is filled from.

    python3 scripts/build-boxes.py <form.pdf> <slots-spec.json> <out-boxes.json>

extract-form-boxes.py measures the boxes; naming them is the judgement call.
This keeps the judgement in the spec — which row, which cells — and reads every
coordinate back out of the PDF, so no number is ever copied by hand.

The spec pins each row's cell count. Point this at a re-issued form and a row
that gained or lost a box fails loudly here, instead of quietly stamping a
citizen's Aadhaar one column to the left. Same reason `take` is an index range
rather than an x-span: indices survive a form that shifts on the page.

Tables declare one row shape and the rows it repeats over, so six household
members cost four lines rather than twenty-four.
"""

import json
import logging
import re
import subprocess
import sys
from importlib import util
from pathlib import Path
from types import ModuleType

logger = logging.getLogger(__name__)

EXTRACTOR: Path = Path(__file__).resolve().parent / "extract-form-boxes.py"

Cell = list[float]
Take = int | list[int]


def load_extractor() -> ModuleType:
    spec = util.spec_from_file_location("extract_form_boxes", EXTRACTOR)
    module: ModuleType = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def page_height(pdf: Path) -> float:
    info: str = subprocess.run(["pdfinfo", str(pdf)], capture_output=True,
                               text=True, check=True).stdout
    match = re.search(r"Page size:\s+([\d.]+) x ([\d.]+)", info)
    if not match:
        raise SystemExit(f"pdfinfo gave no page size for {pdf}")
    return float(match.group(2))


def resolve_rows(module: ModuleType, pdf: Path,
                 declared: dict[str, dict]) -> tuple[dict[str, dict], list[str]]:
    found: dict[int, list[dict]] = {}
    rows: dict[str, dict] = {}
    problems: list[str] = []
    for row_id, want in declared.items():
        page: int = want["page"]
        if page not in found:
            found[page] = module.rows(str(pdf), page)
        on_page: list[dict] = found[page]
        index: int = want["row"]
        if index >= len(on_page):
            problems.append(
                f'row "{row_id}": page {page} has {len(on_page)} rows, '
                f"no R{index}")
            continue
        row: dict = on_page[index]
        if len(row["cells"]) != want["cells"]:
            problems.append(
                f'row "{row_id}" (page {page} R{index}): spec says '
                f'{want["cells"]} cells, form has {len(row["cells"])}')
            continue
        rows[row_id] = row
    return rows, problems


def take_cells(row: dict, take: list[Take]) -> list[Cell]:
    cells: list[Cell] = []
    for item in take:
        if isinstance(item, int):
            cells.append(row["cells"][item])
        else:
            first, last = item
            cells.extend(row["cells"][first:last + 1])
    return cells


def build_slots(spec: dict, rows: dict[str, dict]) -> tuple[dict[str, dict], list[str]]:
    slots: dict[str, dict] = {}
    problems: list[str] = []

    def add(name: str, row_id: str, take: list[Take]) -> None:
        if row_id not in rows:
            problems.append(f'slot "{name}": row "{row_id}" was not resolved')
            return
        if name in slots:
            problems.append(f'slot "{name}" is declared twice')
            return
        row: dict = rows[row_id]
        slots[name] = {"page": row["page"], "yTop": row["yTop"],
                       "yBot": row["yBot"], "cells": take_cells(row, take)}

    for name, want in spec.get("slots", {}).items():
        add(name, want["row"], want["take"])
    for table in spec.get("tables", []):
        for line, row_id in enumerate(table["rows"]):
            for suffix, take in table["slots"].items():
                add(f'{table["prefix"]}.{line}.{suffix}', row_id, take)
    return slots, problems


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    pdf: Path = Path(sys.argv[1]).resolve()
    spec: dict = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    out: Path = Path(sys.argv[3])

    height: float = page_height(pdf)
    if "pageHeight" in spec and abs(spec["pageHeight"] - height) > 0.01:
        raise SystemExit(f'spec says pageHeight {spec["pageHeight"]}, '
                         f"{pdf.name} is {height}")

    module: ModuleType = load_extractor()
    rows, row_problems = resolve_rows(module, pdf, spec["rows"])
    slots, slot_problems = build_slots(spec, rows)
    problems: list[str] = row_problems + slot_problems
    for problem in problems:
        logger.error("  %s", problem)
    if problems:
        raise SystemExit(f"{len(problems)} problems; nothing written")

    out.write_text(json.dumps({"pageHeight": height, "slots": slots},
                              indent=2) + "\n", encoding="utf-8")
    boxes: int = sum(len(s["cells"]) for s in slots.values())
    logger.info("%s: %d slots, %d boxes, from %d rows",
                out.name, len(slots), boxes, len(rows))


if __name__ == "__main__":
    main()
