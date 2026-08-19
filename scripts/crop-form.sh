#!/bin/bash
# Render one horizontal band of a form page to PNG, so it can be looked at.
#
#     scripts/crop-form.sh <pdf> <page> <yTopPt> <yBotPt> <out.png> [dpi] [xLeftPt] [xRightPt]
#
# Coordinates are PDF points, the same ones extract-form-boxes.py and
# row-detail.py print, so a row's band can be pasted straight in from there.
#
# This is the tool that catches what no checker can. A slot map can name every
# box, pin every cell count and reproduce byte-identically from its spec, and
# still write the date of birth on top of the form's printed "D D M M Y Y Y Y"
# guide instead of into the empty row beneath it. That defect shipped, and was
# found by cropping the band at 400dpi and looking at it. Do that before
# believing any new map.
#
# The x range defaults to the full width of an A4 form's grid. Narrow it when
# checking a single field — 400dpi over 130pt is where overstruck glyphs and
# off-by-one columns become obvious.
set -euo pipefail

pdf=$1; page=$2; yt=$3; yb=$4; out=$5
dpi=${6:-200}; xl=${7:-40}; xr=${8:-560}

scale=$(python3 -c "print($dpi/72)")
px=$(python3 -c "print(int($xl * $scale))")
pw=$(python3 -c "print(int(($xr - $xl) * $scale))")
py=$(python3 -c "print(int($yt * $scale))")
ph=$(python3 -c "print(int(($yb - $yt) * $scale))")

pdftoppm -png -r "$dpi" -f "$page" -l "$page" \
    -x "$px" -y "$py" -W "$pw" -H "$ph" "$pdf" "${out%.png}"
ls -la "${out%.png}"*
