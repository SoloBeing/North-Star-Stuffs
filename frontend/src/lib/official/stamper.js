/**
 * The machinery for writing answers into a real government form's boxes.
 *
 * ── Why coordinates and not form fields ────────────────────────────────────
 * The blanks we ship have no AcroForm (`pdfinfo` reports `Form: none`). The
 * boxes are ink, not fields, so there is nothing to `setText()`. Every cell
 * position is read out of the PDF's own vector strokes by
 * `scripts/extract-form-boxes.py` and lives in a `*-boxes.json`; see
 * docs/build-log/07-official-form-geometry.md for how, and for the two bugs
 * that silently truncated rows on the way.
 *
 * ── The rule every form module follows ─────────────────────────────────────
 * Never write a guess into a government form. Anything we cannot place with
 * confidence is left blank and reported back, so the citizen is told which
 * boxes they still have to complete rather than handed a form that is quietly
 * wrong. A blank box is an inconvenience; a wrong box is a rejected
 * application weeks later with no explanation.
 *
 * ── What lives here and what does not ──────────────────────────────────────
 * Everything in this file is form-agnostic: it knows how to draw into a cell,
 * not which cell means what. A form's geometry, its slot names, its notes and
 * the order it fills things in all live in its own module under `official/`.
 * `officialPdf.js` maps a template's `officialForm` id to one of those.
 */

/** Helvetica has no glyphs beyond WinAnsi — Devanagari would throw on encode. */
const ENCODABLE = /^[\x20-\x7E]*$/

/** How far above a printed rule the writing sits, so the two do not merge. */
const LIFT = 1.5

/**
 * The notes any form might need, in both languages.
 *
 * These end up on the last screen of the flow, read by exactly the people who
 * cannot read the form — so an English-only note would be useless precisely
 * where it matters most. A form module spreads these into its own catalogue
 * and adds the ones only it can produce.
 */
export const SHARED_NOTES = {
  nameSplit: {
    kind: 'assumed',
    label: { en: 'How your name was split', hi: 'आपका नाम कैसे बाँटा गया' },
  },
  addressSplit: {
    kind: 'assumed',
    label: { en: 'How your address was split', hi: 'आपका पता कैसे बाँटा गया' },
    detail: {
      en: 'Your address was divided across the form’s rows. Please check each line.',
      hi: 'आपका पता फॉर्म की अलग-अलग पंक्तियों में बाँटा गया है। हर पंक्ति जाँच लें।',
    },
  },
  signature: {
    kind: 'blank',
    label: { en: 'Signature and photographs', hi: 'हस्ताक्षर और फोटो' },
    detail: {
      en: 'These must be done on paper after printing.',
      hi: 'ये छापने के बाद कागज़ पर ही करने होंगे।',
    },
  },
  notLatin: {
    kind: 'blank',
    label: { en: 'Written in Hindi', hi: 'हिंदी में लिखा है' },
    detail: {
      en: 'The government form only accepts English capital letters, so this was left blank.',
      hi: 'सरकारी फॉर्म में केवल अंग्रेज़ी के बड़े अक्षर चलते हैं, इसलिए यह खाली छोड़ा गया है।',
    },
  },
  badValue: {
    kind: 'blank',
    label: { en: 'Could not be read', hi: 'पढ़ा नहीं जा सका' },
  },
}

/**
 * Normalise a value for a box: block capitals, ASCII only.
 * Returns null when the text cannot be represented, so the caller can leave
 * the boxes blank and say so rather than write mojibake onto the form.
 */
export function toBoxText(value, { upper = true } = {}) {
  if (value === undefined || value === null) return null
  let text = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .replace(/\s+/g, ' ')
    .trim()
  if (upper) text = text.toUpperCase()
  if (!text) return null
  return ENCODABLE.test(text) ? text : null
}

export const digitsOf = (value) => String(value ?? '').replace(/\D/g, '')

/** dd/mm/yyyy, the format every date box on these forms is labelled with. */
export function todayDdMmYyyy(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
}

/**
 * Split a full name into a form's first / middle / last boxes.
 *
 * Two tokens means first + last; three or more puts everything between into
 * the middle box. This is a convention, not a fact about the person's name, so
 * the caller surfaces it as an assumption the citizen should check.
 */
export function splitName(full) {
  const parts = toBoxText(full)?.split(' ').filter(Boolean) ?? []
  if (parts.length === 0) return null
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' }
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] }
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(' '),
    last: parts[parts.length - 1],
  }
}

/**
 * Split a flat address string across a form's address rows.
 *
 * DigiLocker hands back one string ("House No. 42, Ward 7, Gandhi Nagar,
 * Jaipur, Rajasthan") while the form wants six separately labelled rows.
 * Indian addresses are written specific → general, so assigning from the END
 * backwards is the reliable direction: the last comma-part is the state, the
 * one before it the district, and so on. Anything left over is joined into the
 * first line rather than dropped.
 *
 * The five names returned are Form 93's rows. A form whose address block is
 * shaped differently needs its own split rather than a remapping of this one.
 */
export function splitAddress(address) {
  const parts = String(address ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const out = { flat: '', road: '', area: '', district: '', state: '' }
  const rest = [...parts]
  for (const slot of ['state', 'district', 'area', 'road', 'flat']) {
    if (rest.length === 0) break
    // Flat/Door/Building is last and absorbs everything still unassigned.
    if (slot === 'flat') {
      out.flat = rest.join(', ')
      break
    }
    out[slot] = rest.pop()
  }
  return out
}

export class Stamper {
  constructor(pdf, font, boxes, notes) {
    this.pdf = pdf
    this.font = font
    this.boxes = boxes
    this.catalogue = notes
    this.pageH = boxes.pageHeight
    this.notes = []
  }

  slot(name) {
    const s = this.boxes.slots[name]
    if (!s) throw new Error(`unknown slot: ${name}`)
    return s
  }

  /** Record one of the catalogued notes, optionally with a specific detail. */
  note(key, detail) {
    const n = this.catalogue[key]
    if (!n) throw new Error(`unknown note: ${key}`)
    this.notes.push({
      kind: n.kind,
      label: n.label,
      detail: detail ?? n.detail ?? null,
    })
  }

  /** Vertically centre a glyph inside a cell, in pdf-lib's bottom-left space. */
  baseline(slot, size) {
    const h = slot.yBot - slot.yTop
    return this.pageH - slot.yBot + (h - size * 0.72) / 2
  }

  /** One character per cell. Text longer than the row is reported, not cut silently. */
  comb(name, text, label) {
    if (!text) return false
    const slot = this.slot(name)
    const page = this.pdf.getPage(slot.page - 1)
    const chars = [...text]
    const n = Math.min(chars.length, slot.cells.length)
    const h = slot.yBot - slot.yTop

    for (let i = 0; i < n; i++) {
      const [x0, x1] = slot.cells[i]
      const w = x1 - x0
      const size = Math.min(h * 0.66, w * 0.95)
      const tw = this.font.widthOfTextAtSize(chars[i], size)
      page.drawText(chars[i], {
        x: x0 + (w - tw) / 2,
        y: this.baseline(slot, size),
        size,
        font: this.font,
      })
    }

    if (label && chars.length > slot.cells.length) {
      this.notes.push({
        kind: 'truncated',
        label,
        detail: {
          en: `Only ${slot.cells.length} boxes on the form, but this needs ${chars.length}. The rest was left off.`,
          hi: `फॉर्म में केवल ${slot.cells.length} खाने हैं, पर इसके लिए ${chars.length} चाहिए। बाकी छूट गया है।`,
        },
      })
    }
    return true
  }

  /** A single wide box holding free text, shrunk until it fits. */
  free(name, text, label) {
    if (!text) return false
    const slot = this.slot(name)
    const page = this.pdf.getPage(slot.page - 1)
    const [x0, x1] = slot.cells[0]
    const w = x1 - x0
    const h = slot.yBot - slot.yTop
    const pad = 3

    let size = h * 0.62
    while (size > 4 && this.font.widthOfTextAtSize(text, size) > w - pad * 2) {
      size -= 0.25
    }
    if (label && this.font.widthOfTextAtSize(text, size) > w - pad * 2) {
      this.notes.push({
        kind: 'truncated',
        label,
        detail: {
          en: 'Too long for the box on the form.',
          hi: 'फॉर्म के खाने के लिए बहुत लंबा है।',
        },
      })
    }
    page.drawText(text, {
      x: x0 + pad,
      y: this.baseline(slot, size),
      size,
      font: this.font,
    })
    return true
  }

  /** A hand-drawn tick, so it does not depend on a symbol font being embedded. */
  tick(name) {
    const slot = this.slot(name)
    const page = this.pdf.getPage(slot.page - 1)
    const [x0, x1] = slot.cells[0]
    const w = x1 - x0
    const h = slot.yBot - slot.yTop
    const yb = this.pageH - slot.yBot
    const opts = { thickness: 1.4 }

    page.drawLine({
      start: { x: x0 + w * 0.22, y: yb + h * 0.5 },
      end: { x: x0 + w * 0.44, y: yb + h * 0.25 },
      ...opts,
    })
    page.drawLine({
      start: { x: x0 + w * 0.44, y: yb + h * 0.25 },
      end: { x: x0 + w * 0.8, y: yb + h * 0.75 },
      ...opts,
    })
  }

  /**
   * One part per run of underscores the form printed, e.g. a date.
   *
   * Some fields are not a box: the form prints `____/____/______` inside one,
   * and the slashes are its ink. Centring a date over the whole box writes
   * across them, which is the step 12 `dob` bug in a new form. A guide slot's
   * cells are the runs themselves and its yBot is the baseline they sit on, so
   * each part lands on its own run with the printed slashes left alone.
   */
  guide(name, parts) {
    const slot = this.slot(name)
    if (!slot.guide) throw new Error(`slot is not a guide: ${name}`)
    if (parts.some((part) => !part)) return false
    if (parts.length !== slot.cells.length) {
      throw new Error(
        `guide ${name} has ${slot.cells.length} runs, given ${parts.length} parts`,
      )
    }

    const page = this.pdf.getPage(slot.page - 1)
    // LIFT keeps the digits clear of the printed rule instead of sitting in it.
    const y = this.pageH - slot.yBot + LIFT
    const h = slot.yBot - slot.yTop

    for (let i = 0; i < parts.length; i++) {
      const [x0, x1] = slot.cells[i]
      const w = x1 - x0
      let size = Math.min(h * 0.72, 11)
      while (size > 4 && this.font.widthOfTextAtSize(parts[i], size) > w - 2) {
        size -= 0.25
      }
      const tw = this.font.widthOfTextAtSize(parts[i], size)
      page.drawText(parts[i], { x: x0 + (w - tw) / 2, y, size, font: this.font })
    }

    return true
  }
}
