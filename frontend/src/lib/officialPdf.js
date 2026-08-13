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
 * ── Why coordinates and not form fields ────────────────────────────────────
 * Form 93 has no AcroForm (`pdfinfo` reports `Form: none`). The boxes are ink,
 * not fields, so there is nothing to `setText()`. Every cell position was read
 * out of the PDF's own vector strokes and lives in `form93-boxes.json`; see
 * docs/build-log/07-official-form-geometry.md for how, and for the two bugs
 * that silently truncated rows on the way.
 *
 * ── The rule this module follows ───────────────────────────────────────────
 * Never write a guess into a government form. Anything we cannot place with
 * confidence is left blank and reported back, so the citizen is told which
 * boxes they still have to complete rather than handed a form that is quietly
 * wrong. A blank box is an inconvenience; a wrong box is a rejected
 * application weeks later with no explanation.
 */

import boxes from '../data/official/form93-boxes.json'

const PDF_URL = `${import.meta.env?.BASE_URL ?? '/'}forms/form93.pdf`

/** Helvetica has no glyphs beyond WinAnsi — Devanagari would throw on encode. */
const ENCODABLE = /^[\x20-\x7E]*$/

/**
 * Everything this module might have to tell the citizen, in both languages.
 *
 * These end up on the last screen of the flow, read by exactly the people who
 * cannot read the form — so an English-only note would be useless precisely
 * where it matters most. Kept together here for the same reason `i18n.js`
 * keeps UI strings together: a missing translation is one visible gap rather
 * than a hunt through the file.
 */
const NOTES = {
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
  agriculture: {
    kind: 'assumed',
    label: { en: 'Source of income', hi: 'आय का स्रोत' },
    detail: {
      en: 'This form has no box for farming, so “Income from Other Sources” was ticked.',
      hi: 'इस फॉर्म में खेती का कोई खाना नहीं है, इसलिए “अन्य स्रोतों से आय” पर निशान लगाया गया है।',
    },
  },
  postOffice: {
    kind: 'blank',
    label: { en: 'Post Office', hi: 'डाकघर' },
    detail: {
      en: 'You said you did not know this, so it was left empty. Your PIN code is filled, which is what the post actually sorts by.',
      hi: 'आपने कहा था कि यह आपको नहीं पता, इसलिए खाली छोड़ा गया है। आपका पिन कोड भरा है, डाक छँटाई उसी से होती है।',
    },
  },
  email: {
    kind: 'blank',
    label: { en: 'Email address', hi: 'ईमेल पता' },
    detail: {
      en: 'You said you do not have one, so it was left empty. Your card will still arrive by post.',
      hi: 'आपने कहा था कि आपका ईमेल नहीं है, इसलिए खाली छोड़ा गया है। आपका कार्ड फिर भी डाक से आएगा।',
    },
  },
  communication: {
    kind: 'assumed',
    label: { en: 'Where your card will be posted', hi: 'कार्ड कहाँ भेजा जाएगा' },
    detail: {
      en: '“Residence Address” was ticked, because that is the only address on this form.',
      hi: '“निवास का पता” पर निशान लगाया गया है, क्योंकि इस फॉर्म पर वही एकमात्र पता है।',
    },
  },
  documents: {
    kind: 'assumed',
    label: { en: 'Proof documents ticked', hi: 'प्रमाण दस्तावेज़ों पर निशान' },
    detail: {
      en: 'The form now declares that you are attaching proof of identity, address and date of birth. Put all three in the envelope before you submit it, or the declaration will be untrue.',
      hi: 'फॉर्म अब यह घोषित करता है कि आप पहचान, पते और जन्म तिथि के प्रमाण साथ लगा रहे हैं। जमा करने से पहले तीनों लिफ़ाफ़े में रख लें, वरना यह घोषणा गलत हो जाएगी।',
    },
  },
  declarationDate: {
    kind: 'assumed',
    label: { en: 'Place and date', hi: 'स्थान और दिनांक' },
  },
  singleParentFather: {
    kind: 'assumed',
    label: { en: 'Parent’s name on the card', hi: 'कार्ड पर अभिभावक का नाम' },
    detail: {
      en: 'You said a single parent raised you, so only your father’s name was filled and “Father” was ticked for the card. If it is your mother who raised you, write her name at item 14 and tick “Mother” at item 15 instead.',
      hi: 'आपने कहा कि आपको एकल अभिभावक ने पाला, इसलिए केवल पिता का नाम भरा गया और कार्ड के लिए “पिता” पर निशान लगाया गया। अगर आपको माता ने पाला है, तो क्रमांक 14 पर उनका नाम लिखें और क्रमांक 15 पर “माता” चुनें।',
    },
  },
  motherMissing: {
    kind: 'blank',
    label: { en: 'Mother’s name', hi: 'माता का नाम' },
    detail: {
      en: 'This was left empty. Write it in at item 14 by hand.',
      hi: 'यह खाली रह गया है। इसे क्रमांक 14 पर हाथ से लिख दीजिए।',
    },
  },
  printParentMissing: {
    kind: 'blank',
    label: { en: 'Parent’s name on the card', hi: 'कार्ड पर अभिभावक का नाम' },
    detail: {
      en: 'Tick either Father or Mother at item 15, to say whose name should be printed on your card.',
      hi: 'क्रमांक 15 पर पिता या माता में से एक चुनिए, ताकि कार्ड पर किसका नाम छपे यह तय हो।',
    },
  },
  passportNeeded: {
    kind: 'blank',
    label: { en: 'Passport number and TIN', hi: 'पासपोर्ट नंबर और टिन' },
    detail: {
      en: 'You are not an ordinary resident, so the form requires your passport number, and your tax number abroad if you have one. FormMitra did not ask for either. Write them in at items 8 and 9.',
      hi: 'आप सामान्य निवासी नहीं हैं, इसलिए फॉर्म में पासपोर्ट नंबर ज़रूरी है, और विदेश का कर नंबर भी हो तो। फॉर्ममित्र ने ये नहीं पूछे। इन्हें क्रमांक 8 और 9 पर लिख दीजिए।',
    },
  },
  aoCode: {
    kind: 'blank',
    label: { en: 'Assessing Officer (AO) code', hi: 'निर्धारण अधिकारी (एओ) कोड' },
    detail: {
      en: 'This is looked up from your address. The PAN centre will fill it.',
      hi: 'यह आपके पते से देखा जाता है। पैन केंद्र इसे भर देगा।',
    },
  },
  officeAddress: {
    kind: 'blank',
    label: { en: 'Office address', hi: 'कार्यालय का पता' },
    detail: {
      en: 'Only needed if you want your card posted to your workplace. Leave it empty otherwise.',
      hi: 'यह तभी चाहिए जब आप कार्ड अपने काम की जगह पर मँगवाना चाहें। वरना खाली रहने दें।',
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
function toBoxText(value, { upper = true } = {}) {
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

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '')

/**
 * Split a full name into the form's first / middle / last boxes.
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
 * Split a flat address string across the form's address rows.
 *
 * DigiLocker hands back one string ("House No. 42, Ward 7, Gandhi Nagar,
 * Jaipur, Rajasthan") while the form wants six separately labelled rows.
 * Indian addresses are written specific → general, so assigning from the END
 * backwards is the reliable direction: the last comma-part is the state, the
 * one before it the district, and so on. Anything left over is joined into the
 * first line rather than dropped.
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

/** Which tick box a stored choice maps to. */
const GENDER_SLOT = {
  Male: 'gender.male',
  Female: 'gender.female',
  Transgender: 'gender.transgender',
}

/**
 * Our income options against the form's six heads.
 *
 * All six heads are reachable, so nobody is pushed into a box that does not
 * describe them. The form says "select one or more" where we ask for one, which
 * is a deliberate simplification: a second head changes nothing about how the
 * PAN is issued, and the question is hard enough asked once.
 *
 * "Agriculture" is the one option with no head of its own — agricultural income
 * is exempt, so Form 93 has no box for it — and goes under Other Sources, where
 * it is conventionally declared. Flagged as an assumption rather than done
 * silently.
 */
const INCOME_SLOT = {
  Salary: 'income.salary',
  Business: 'income.business',
  Agriculture: 'income.otherSources',
  'House Property': 'income.houseProperty',
  'Capital Gains': 'income.capitalGains',
  'No income': 'income.none',
}

const STATUS_SLOT = {
  Resident: 'status.resident',
  'Non Resident': 'status.nonResident',
  'Not Ordinarily Resident': 'status.notOrdinarily',
}

const SINGLE_PARENT_SLOT = { Yes: 'singleParent.yes', No: 'singleParent.no' }

const PRINT_PARENT_SLOT = {
  Father: 'printParent.father',
  Mother: 'printParent.mother',
}

/** dd/mm/yyyy, the format every box on this form is labelled with. */
function todayDdMmYyyy(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
}

class Stamper {
  constructor(pdf, font) {
    this.pdf = pdf
    this.font = font
    this.pageH = boxes.pageHeight
    this.notes = []
  }

  slot(name) {
    const s = boxes.slots[name]
    if (!s) throw new Error(`unknown slot: ${name}`)
    return s
  }

  /** Record one of the catalogued notes, optionally with a specific detail. */
  note(key, detail) {
    const n = NOTES[key]
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
}

/**
 * Fill the official Form 93 with the answers we hold.
 *
 * @param {object} answers  { fieldId: value } from the guided fill
 * @returns {Promise<{blob: Blob, notes: Array}>} the PDF, plus everything the
 *          citizen still needs to know: what was assumed, what was left blank.
 */
export async function buildOfficialPdf(answers = {}) {
  const [{ PDFDocument, StandardFonts }, bytes] = await Promise.all([
    import('pdf-lib'),
    fetch(PDF_URL).then((r) => {
      if (!r.ok) throw new Error(`could not load the official form (${r.status})`)
      return r.arrayBuffer()
    }),
  ])

  const pdf = await PDFDocument.load(bytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const s = new Stamper(pdf, font)

  const NAME_LABEL = { en: 'Your name', hi: 'आपका नाम' }
  const ADDRESS_LABEL = { en: 'Your address', hi: 'आपका पता' }

  // ── Name ────────────────────────────────────────────────────────────────
  const name = splitName(answers.full_name)
  if (name) {
    s.comb('name.first', name.first, NAME_LABEL)
    s.comb('name.middle', name.middle, NAME_LABEL)
    s.comb('name.last', name.last, NAME_LABEL)
    if (name.middle) {
      s.note('nameSplit', {
        en: `First “${name.first}”, middle “${name.middle}”, last “${name.last}”.`,
        hi: `पहला “${name.first}”, बीच का “${name.middle}”, अंतिम “${name.last}”।`,
      })
    }
    // "Name as per Aadhaar" is the same name, wrapped across three rows.
    const full = toBoxText(answers.full_name)
    const perRow = boxes.slots['aadhaarName.0'].cells.length
    for (let i = 0; i < 3; i++) {
      s.comb(`aadhaarName.${i}`, full.slice(i * perRow, (i + 1) * perRow))
    }
  } else if (answers.full_name) {
    s.note('notLatin')
  }

  // ── Gender ──────────────────────────────────────────────────────────────
  if (GENDER_SLOT[answers.gender]) s.tick(GENDER_SLOT[answers.gender])

  // ── Date of birth (stored dd/mm/yyyy) ───────────────────────────────────
  const dob = digitsOf(answers.dob)
  if (dob.length === 8) {
    s.comb('dob.dd', dob.slice(0, 2))
    s.comb('dob.mm', dob.slice(2, 4))
    s.comb('dob.yyyy', dob.slice(4, 8))
  } else if (answers.dob) {
    s.note('badValue', { en: 'Date of birth', hi: 'जन्म तिथि' })
  }

  // ── Aadhaar ─────────────────────────────────────────────────────────────
  const aadhaar = digitsOf(answers.aadhaar)
  if (aadhaar.length === 12) s.comb('aadhaar', aadhaar)
  else if (answers.aadhaar) s.note('badValue', { en: 'Aadhaar number', hi: 'आधार संख्या' })

  // ── Residence address ───────────────────────────────────────────────────
  const addr = splitAddress(answers.address)
  if (addr) {
    s.comb('res.flat', toBoxText(addr.flat), ADDRESS_LABEL)
    s.comb('res.road', toBoxText(addr.road), ADDRESS_LABEL)
    s.comb('res.area', toBoxText(addr.area), ADDRESS_LABEL)
    s.comb('res.district', toBoxText(addr.district), ADDRESS_LABEL)
    s.free('res.state', toBoxText(addr.state), ADDRESS_LABEL)
    s.free('res.country', 'INDIA')
    s.note('addressSplit')
  }

  // Optional, so an empty answer is a choice the citizen made, not a gap we
  // failed to fill — but they should still be told the box went out blank.
  if (!s.comb('res.po', toBoxText(answers.post_office), ADDRESS_LABEL)) {
    s.note('postOffice')
  }

  const pin = digitsOf(answers.pincode)
  if (pin) s.comb('res.pin', pin, { en: 'PIN code', hi: 'पिन कोड' })

  // ── Residential status (Part A, item 7) ─────────────────────────────────
  // A legal declaration, so it is ticked only from an explicit answer, never
  // inferred from the address. Anything but Resident makes items 8 and 9
  // mandatory, and this app collects neither.
  if (STATUS_SLOT[answers.residential_status]) {
    s.tick(STATUS_SLOT[answers.residential_status])
    if (answers.residential_status !== 'Resident') s.note('passportNeeded')
  }

  // ── Contact ─────────────────────────────────────────────────────────────
  const mobile = digitsOf(answers.mobile)
  if (mobile.length === 10) {
    s.comb('mobile.cc', '91')
    s.comb('mobile.number', mobile)
  } else if (answers.mobile) {
    s.note('badValue', { en: 'Mobile number', hi: 'मोबाइल नंबर' })
  }

  // Case is preserved here alone: every other box on this form wants block
  // capitals, but the local part of an address is case-sensitive by the spec
  // even though almost no provider enforces it. Not worth the risk.
  if (!s.free('email', toBoxText(answers.email, { upper: false }))) {
    s.note('email')
  }

  // ── Source of income (Part B) ───────────────────────────────────────────
  if (INCOME_SLOT[answers.source_of_income]) {
    s.tick(INCOME_SLOT[answers.source_of_income])
    if (answers.source_of_income === 'Agriculture') s.note('agriculture')
  }

  // ── Parents (Part C) ────────────────────────────────────────────────────
  if (SINGLE_PARENT_SLOT[answers.single_parent]) {
    s.tick(SINGLE_PARENT_SLOT[answers.single_parent])
  }

  const father = splitName(answers.father_name)
  if (father) {
    s.comb('father.first', father.first)
    s.comb('father.middle', father.middle)
    s.comb('father.last', father.last)
  } else if (answers.father_name) {
    s.note('notLatin')
  }

  const mother = splitName(answers.mother_name)
  if (mother) {
    s.comb('mother.first', mother.first)
    s.comb('mother.middle', mother.middle)
    s.comb('mother.last', mother.last)
  } else if (answers.mother_name) {
    s.note('notLatin')
  } else if (answers.single_parent === 'No') {
    // The question applies and has no answer. The flow tries hard not to let
    // this happen, but a blank row on a government form must never be silent.
    s.note('motherMissing')
  }

  // Item 15 — whose name is printed under yours on the card. With a single
  // parent we never asked, and only the father's name is on the form, so
  // ticking Mother would print a blank. Ticking Father is the only choice
  // consistent with the rest of the page, and the citizen is told so.
  if (PRINT_PARENT_SLOT[answers.print_parent]) {
    s.tick(PRINT_PARENT_SLOT[answers.print_parent])
  } else if (answers.single_parent === 'Yes' && father) {
    s.tick('printParent.father')
    s.note('singleParentFather')
  } else {
    s.note('printParentMissing')
  }

  // ── Address for communication (Part F, item 22) ─────────────────────────
  // Derived rather than asked: the residence address is the only one on the
  // form, so it is the only tick that can be true.
  if (addr) {
    s.tick('comm.residence')
    s.note('communication')
  }

  // ── Declaration (Part G) ────────────────────────────────────────────────
  // Item 23 declares that the three proofs are attached. The citizen must
  // attach all three for the application to be accepted at all, so these are
  // ticked — but it is a declaration made in their name, which is why the note
  // tells them plainly to check the envelope.
  s.tick('docs.identity')
  s.tick('docs.address')
  s.tick('docs.dob')
  s.note('documents')

  const declName = toBoxText(answers.full_name)
  if (declName) {
    s.free('decl.name', declName)
    s.free('decl.capacity', 'SELF')
  }

  const place = toBoxText(addr?.district || addr?.area)
  const date = todayDdMmYyyy()
  if (place) s.free('decl.place', place)
  s.free('decl.date', date)
  s.note('declarationDate', {
    en: `Filled in as ${place ? `“${place}”` : 'blank'} on ${date}. If you post the form on a different day, cross the date out and write the day you actually sign it.`,
    hi: `${place ? `“${place}”` : 'खाली'} और दिनांक ${date} भरा गया है। अगर आप फॉर्म किसी और दिन भेजें, तो दिनांक काटकर वही दिन लिखें जिस दिन आप हस्ताक्षर करें।`,
  })

  // ── What we deliberately did not touch ──────────────────────────────────
  s.note('officeAddress')
  s.note('aoCode')
  s.note('signature')

  const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
  return { blob, notes: s.notes }
}
