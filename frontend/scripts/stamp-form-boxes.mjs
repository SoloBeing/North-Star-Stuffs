/**
 * Stamp every extracted cell with its index, so a human can open the PDF and
 * see whether the geometry matches the printed boxes.
 *
 *   node frontend/scripts/stamp-form-boxes.mjs <in.pdf> <out.pdf> <page> [page ...]
 *   node frontend/scripts/stamp-form-boxes.mjs caste.pdf out.pdf 1 --ink=rects
 *
 * `--ink` is passed straight to the extractor: forms whose boxes are closed
 * rectangles rather than combs need `rects` or almost nothing is found.
 *
 * Each row is marked with `R{n}` in red at its left, and every cell in that
 * row gets a cycling 0-9 digit. If a stamped digit lands inside a printed
 * label instead of an empty box, the leftmost cells of that row are the label
 * column and should be sliced out of the slot definition. If a row has more
 * digits than the printed form has cells, the extractor picked up phantom
 * cells and its rule needs tightening.
 *
 * Same verification approach step 7 used on Form 93. Companion to
 * scripts/extract-form-boxes.py and scripts/label-form-rows.py.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXTRACT = resolve(HERE, '..', '..', 'scripts', 'extract-form-boxes.py')

function extractRows(pdfPath, pages, ink) {
  const py = `
import json, importlib.util
spec = importlib.util.spec_from_file_location("efb", ${JSON.stringify(EXTRACT)})
efb = importlib.util.module_from_spec(spec); spec.loader.exec_module(efb)
data = []
for p in ${JSON.stringify(pages)}:
    for r in efb.rows(${JSON.stringify(pdfPath)}, p, ${JSON.stringify(ink)}):
        r["page"] = p
        data.append(r)
print(json.dumps(data))
`
  return JSON.parse(execFileSync('python3', ['-c', py], { encoding: 'utf8' }))
}

async function main() {
  const [, , inPath, outPath, ...rest] = process.argv
  const inkArg = rest.find((a) => a.startsWith('--ink='))
  const ink = inkArg ? inkArg.slice('--ink='.length) : 'combs'
  const pageArgs = rest.filter((a) => !a.startsWith('--'))
  if (!inPath || !outPath || pageArgs.length === 0) {
    console.error('usage: stamp-form-boxes.mjs <in.pdf> <out.pdf> <page> [page ...] [--ink=combs|rects]')
    process.exit(1)
  }
  const pages = pageArgs.map(Number)

  const rows = extractRows(resolve(inPath), pages, ink)
  const pdf = await PDFDocument.load(readFileSync(inPath))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pageHeight = pdf.getPage(0).getHeight()

  // Number rows within each page separately so the indices restart per page —
  // easier to eyeball against the printed form.
  const perPage = new Map()
  for (const r of rows) {
    const arr = perPage.get(r.page) ?? []
    r.i = arr.length
    arr.push(r)
    perPage.set(r.page, arr)
  }

  for (const r of rows) {
    const page = pdf.getPage(r.page - 1)
    const h = r.yBot - r.yTop
    const yBase = pageHeight - r.yBot

    page.drawText(`R${r.i}`, {
      x: r.cells[0][0] - 22,
      y: yBase + (h - 4 * 0.72) / 2,
      size: 4,
      font: bold,
      color: rgb(0.8, 0, 0),
    })

    for (let i = 0; i < r.cells.length; i++) {
      const [x0, x1] = r.cells[i]
      const w = x1 - x0
      const size = Math.min(h * 0.62, w * 0.85)
      const digit = String(i % 10)
      const tw = font.widthOfTextAtSize(digit, size)
      page.drawText(digit, {
        x: x0 + (w - tw) / 2,
        y: yBase + (h - size * 0.72) / 2,
        size,
        font,
        color: rgb(0, 0, 0.7),
      })
    }
  }

  writeFileSync(outPath, await pdf.save())
  console.log(`Wrote ${outPath}`)
  for (const [page, rs] of perPage) console.log(`  page ${page}: ${rs.length} rows`)
}

await main()
