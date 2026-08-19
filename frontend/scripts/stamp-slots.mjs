/**
 * Stamp a finished *-boxes.json onto its form, so a human can see whether the
 * names landed on the right boxes.
 *
 *   node frontend/scripts/stamp-slots.mjs <in.pdf> <boxes.json> <out.pdf>
 *
 * Every slot writes its own name across its cells, one letter per box, in a
 * colour that alternates between neighbours. A field that reads `VILLAGE` all
 * the way across is mapped right; one that starts three boxes late, runs into
 * the next field's colour, or spells itself inside a printed label is not.
 * Single-cell slots — every tick box on the form — get an X instead.
 *
 * stamp-form-boxes.mjs answers "did the extractor find the boxes"; this one
 * answers "did I name the right ones", which is the step that actually puts a
 * citizen's Aadhaar in the wrong government field.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const COLOURS = [
  rgb(0, 0, 0.75),
  rgb(0, 0.5, 0.1),
  rgb(0.7, 0, 0.5),
  rgb(0.75, 0.35, 0),
]

/** The slot name as fill letters: `address.houseNo` -> ADDRESSHOUSENO. */
function letters(name) {
  return name.replace(/[^a-z0-9]/gi, '').toUpperCase()
}

async function main() {
  const [, , inPath, boxesPath, outPath] = process.argv
  if (!inPath || !boxesPath || !outPath) {
    console.error('usage: stamp-slots.mjs <in.pdf> <boxes.json> <out.pdf>')
    process.exit(1)
  }

  const boxes = JSON.parse(readFileSync(boxesPath, 'utf8'))
  const pdf = await PDFDocument.load(readFileSync(inPath))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pageHeight = pdf.getPage(0).getHeight()

  const names = Object.keys(boxes.slots)
  for (let n = 0; n < names.length; n++) {
    const name = names[n]
    const slot = boxes.slots[name]
    const page = pdf.getPage(slot.page - 1)
    const colour = COLOURS[n % COLOURS.length]
    const h = slot.yBot - slot.yTop
    const yBase = pageHeight - slot.yBot
    const fill = slot.cells.length === 1 ? 'X' : letters(name)

    page.drawText(name, {
      x: slot.cells[0][0],
      y: yBase + h + 0.6,
      size: 2.6,
      font: bold,
      color: colour,
    })

    for (let i = 0; i < slot.cells.length; i++) {
      const [x0, x1] = slot.cells[i]
      const w = x1 - x0
      const size = Math.min(h * 0.6, w * 0.8)
      const glyph = fill[i % fill.length]
      const tw = font.widthOfTextAtSize(glyph, size)
      page.drawText(glyph, {
        x: x0 + (w - tw) / 2,
        y: yBase + (h - size * 0.72) / 2,
        size,
        font,
        color: colour,
      })
    }
  }

  writeFileSync(outPath, await pdf.save())
  const boxCount = names.reduce((n, k) => n + boxes.slots[k].cells.length, 0)
  console.log(`Wrote ${outPath}: ${names.length} slots, ${boxCount} boxes`)
}

await main()
