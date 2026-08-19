#!/bin/bash
# Do two PDFs draw the same marks?
#
#     scripts/pdf-same.sh <a.pdf> <b.pdf>
#
# Exits 0 when they do, 1 when they do not. Use it to prove a refactor of the
# overlay code changed nothing about the output.
#
# sha256 cannot answer this question. pdf-lib writes a fresh CreationDate,
# ModDate and file id on every save, so two runs of *identical* code differ in
# thousands of bytes — they land inside a compressed object stream, so the
# difference is not even confined to the dates. Decompressing first and then
# dropping those three keys leaves only what was actually drawn.
#
# Before trusting a SAME, check the comparison can still fail: run it on two
# outputs you know differ. A comparison that cannot report a difference is
# worse than no comparison, because it is believed.
set -uo pipefail

norm() {
    mutool clean -d "$1" "$2.pdf" 2>/dev/null
    LC_ALL=C grep -av "CreationDate\|ModDate\|/ID \[" "$2.pdf" > "$2.norm"
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

norm "$1" "$tmp/a"
norm "$2" "$tmp/b"

if cmp -s "$tmp/a.norm" "$tmp/b.norm"; then
    echo "SAME   $(basename "$1") == $(basename "$2")"
else
    echo "DIFFER $(basename "$1") != $(basename "$2")"
    echo "       $(cmp -l "$tmp/a.norm" "$tmp/b.norm" 2>/dev/null | wc -l) bytes differ"
    exit 1
fi
