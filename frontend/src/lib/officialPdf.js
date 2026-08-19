/**
 * Stamping answers into the *real* government form.
 *
 * ── Why this exists alongside pdf.js ───────────────────────────────────────
 * `pdf.js` produces a FormMitra summary sheet: our layout, our labels, in the
 * citizen's language. It is the readable record. But a summary sheet still
 * leaves the citizen hand-copying every value into the official form's boxes,
 * in English block capitals, one letter per cell — which is exactly the task
 * they came to us unable to do. This module removes that last step.
 *
 * ── What this file is ──────────────────────────────────────────────────────
 * The dispatcher, and nothing else. A template opts in by carrying an
 * `officialForm` id (see `pan-93.json`); that id is the key below. Everything
 * about a particular form lives in its own module under `official/`, and the
 * drawing machinery they all share lives in `official/stamper.js`.
 *
 * Adding a form is: map its boxes (`scripts/build-boxes.py`), write one module
 * under `official/`, add one line here, and put the id on the template. No
 * existing form's code is touched, which is the whole point of the split. A
 * form printed on more than one blank declares `variants` instead of a
 * `pdfPath` — see `chooseBlank` — and still takes one line and one id.
 *
 * The modules are loaded on demand: a citizen filling a PAN application never
 * downloads the LPG geometry. Vite emits each as its own chunk and the service
 * worker precaches all of them, so this costs nothing offline.
 */

import { Stamper } from './official/stamper.js'

const FORMS = {
  form93: () => import('./official/form93.js'),
  'ujjwala-kyc': () => import('./official/ujjwalaKyc.js'),
  'caste-certificate': () => import('./official/casteCertificate.js'),
}

/**
 * Which blank a form prints on, and the geometry that goes with it.
 *
 * Most forms are one piece of paper and say so with a plain `pdfPath` and
 * `boxes`. A few are not: Rajasthan prints the caste certificate once per
 * category, on blanks that ask different questions, so that module declares
 * `variants` and a `variant(answers)` that picks one. This has to be resolved
 * here rather than inside `fill`, because the PDF is fetched and the Stamper
 * built before `fill` is ever called.
 */
function chooseBlank(form, answers) {
  if (!form.variants) return form
  const key = form.variant(answers)
  const blank = form.variants[key]
  if (!blank) throw new Error(`${form.id}: no variant "${key}"`)
  return blank
}

/**
 * Fill an official government form with the answers we hold.
 *
 * @param {string} officialForm  the template's `officialForm` id, e.g. 'form93'
 * @param {object} answers       { fieldId: value } from the guided fill
 * @returns {Promise<{blob: Blob, notes: Array}>} the PDF, plus everything the
 *          citizen still needs to know: what was assumed, what was left blank.
 */
export async function buildOfficialPdf(officialForm, answers = {}) {
  const load = FORMS[officialForm]
  if (!load) throw new Error(`no official form module for id: ${officialForm}`)
  const form = (await load()).default

  const blank = chooseBlank(form, answers)
  const url = `${import.meta.env?.BASE_URL ?? '/'}${blank.pdfPath}`
  const [{ PDFDocument, StandardFonts }, bytes] = await Promise.all([
    import('pdf-lib'),
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`could not load the official form (${r.status})`)
      return r.arrayBuffer()
    }),
  ])

  const pdf = await PDFDocument.load(bytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const s = new Stamper(pdf, font, blank.boxes, form.notes)

  form.fill(s, answers)

  const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
  return { blob, notes: s.notes }
}
