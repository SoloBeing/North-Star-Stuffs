/**
 * Deterministic field validation — the browser copy.
 *
 * This is the one that actually runs during a citizen's session, including
 * offline. Every rule is a regex or arithmetic. No model is consulted, so a
 * validation verdict cannot be hallucinated.
 *
 * Mirrors backend/validation.py. If you change a rule, change it in both.
 */

/** UIDAI's Verhoeff checksum. Catches nearly all typos and invented numbers. */
const D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

const P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

// --- Devanagari digit normaliser ------------------------------------------
const DEVANAGARI_MAP = {
  '०':'0','१':'1','२':'2','३':'3','४':'4',
  '५':'5','६':'6','७':'7','८':'8','९':'9'
}
const normaliseDevanagari = (v) =>
  v.replace(/[०-९]/g, d => DEVANAGARI_MAP[d] || d)

function verhoeffValid(number) {
  let c = 0
  const digits = number.split('').reverse()
  for (let i = 0; i < digits.length; i += 1) {
    c = D_TABLE[c][P_TABLE[i % 8][Number(digits[i])]]
  }
  return c === 0
}

function parseDate(value) {
  const m = value.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m.map(Number)
  const d = new Date(yyyy, mm - 1, dd)
  // Rejects 31/02/2020, which the Date constructor would silently roll over.
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return null
  }
  return d
}

const stripSpaces = (v) => v.replace(/[\s-]/g, '')
const collapse = (v) => v.trim().replace(/\s+/g, ' ')

export const RULES = {
  ifsc: {
    test: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
    normalise: (v) => stripSpaces(v).toUpperCase(),
    en: 'IFSC must be 11 characters: 4 letters, a zero, then 6 more. Example: SBIN0001234',
    hi: 'IFSC 11 अक्षर का होता है: 4 अक्षर, फिर शून्य, फिर 6 और। जैसे: SBIN0001234',
  },
  aadhaar: {
    test: (v) => /^[2-9]\d{11}$/.test(v) && verhoeffValid(v),
    normalise: (v) => stripSpaces(normaliseDevanagari(v)),
    en: 'Aadhaar must be 12 digits and pass the UIDAI check. Please read the number again.',
    hi: 'आधार 12 अंकों का होना चाहिए और UIDAI जाँच में सही होना चाहिए। कृपया नंबर दोबारा देखें।',
  },
  pan: {
    test: (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(v),
    normalise: (v) => stripSpaces(v).toUpperCase(),
    en: 'PAN must be 5 letters, 4 digits, then 1 letter. Example: ABCDE1234F',
    hi: 'PAN में 5 अक्षर, 4 अंक, फिर 1 अक्षर होता है। जैसे: ABCDE1234F',
  },
  mobile: {
    test: (v) => /^[6-9]\d{9}$/.test(v),
    normalise: (v) => {
    let s = stripSpaces(normaliseDevanagari(v))
    if (s.startsWith('+91') && s.length === 13) s = s.slice(3)
    else if (s.startsWith('91') && s.length === 12) s = s.slice(2)
    return s
    },
    en: 'Mobile number must be 10 digits starting with 6, 7, 8 or 9.',
    hi: 'मोबाइल नंबर 10 अंकों का हो और 6, 7, 8 या 9 से शुरू हो।',
  },
  pincode: {
    test: (v) => /^[1-9]\d{5}$/.test(v),
    normalise: (v) => stripSpaces(normaliseDevanagari(v)),
    en: 'PIN code must be 6 digits and cannot start with 0.',
    hi: 'पिन कोड 6 अंकों का होता है और 0 से शुरू नहीं होता।',
  },
  bank_account: {
    test: (v) => /^\d{9,18}$/.test(v),
    normalise: (v) => stripSpaces(normaliseDevanagari(v)),
    en: 'Bank account number must be between 9 and 18 digits.',
    hi: 'बैंक खाता संख्या 9 से 18 अंकों के बीच होनी चाहिए।',
  },
  date: {
    test: (v) => parseDate(v) !== null,
    normalise: (v) => v.trim().replace(/[-.]/g, '/'),
    en: 'Date must be in DD/MM/YYYY format. Example: 14/08/1961',
    hi: 'तारीख DD/MM/YYYY रूप में लिखें। जैसे: 14/08/1961',
  },
  date_past: {
    test: (v) => {
      const d = parseDate(v)
      return d !== null && d < new Date()
    },
    normalise: (v) => v.trim().replace(/[-.]/g, '/'),
    en: 'Date must be in the past, in DD/MM/YYYY format.',
    hi: 'तारीख आज से पहले की होनी चाहिए, DD/MM/YYYY रूप में।',
  },
  name: {
    // Latin or Devanagari. Devanagari block is U+0900-U+097F.
    test: (v) => /^[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .'-]{1,60}$/.test(v),
    normalise: collapse,
    en: 'Name should be 2 to 60 letters. Numbers are not allowed.',
    hi: 'नाम 2 से 60 अक्षरों का हो। अंक न लिखें।',
  },
  amount: {
    test: (v) => /^\d{1,9}$/.test(v),
    normalise: (v) => normaliseDevanagari(v.replace(/[,\s₹]/g, '')),
    en: 'Amount must be a whole number in rupees, without commas.',
    hi: 'राशि पूरे रुपये में लिखें, अल्पविराम के बिना।',
  },
  email: {
    test: (v) => /^[^@\s]+@[^@\s.]+\.[A-Za-z]{2,}$/.test(v),
    normalise: (v) => v.trim().toLowerCase(),
    en: 'Email must look like name@example.com',
    hi: 'ईमेल इस तरह होना चाहिए: name@example.com',
  },
  text: {
    test: (v) => v.length >= 1 && v.length <= 200,
    normalise: collapse,
    en: 'This field cannot be empty.',
    hi: 'यह जगह खाली नहीं छोड़ सकते।',
  },
}

const EMPTY = {
  en: 'This field cannot be empty.',
  hi: 'यह जगह खाली नहीं छोड़ सकते।',
}

/**
 * Validate one value.
 *
 * @param {object} field  a field object from a form template
 * @param {string} value  what the citizen said or typed
 * @returns {{valid: boolean, value: string, error: string|null}}
 *          `value` is the cleaned-up version — store this, not the raw input.
 */
export function validateField(field, value, lang = 'hi') {
  const raw = (value ?? '').trim()

  // "choice" fields are picked from a list, so the only failure is picking none.
  if (field.rule === 'choice') {
    const allowed = (field.options ?? []).map((o) => o.value)
    if (!raw) return { valid: false, value: '', error: EMPTY[lang] }
    return allowed.includes(raw)
      ? { valid: true, value: raw, error: null }
      : {
          valid: false,
          value: raw,
          error:
            lang === 'hi'
              ? 'कृपया दिए गए विकल्पों में से एक चुनें।'
              : 'Please choose one of the given options.',
        }
  }

  const rule = RULES[field.rule]
  if (!rule) return { valid: true, value: raw, error: null }

  const cleaned = raw ? rule.normalise(raw) : ''
  if (!cleaned) return { valid: false, value: '', error: EMPTY[lang] }

  return rule.test(cleaned)
    ? { valid: true, value: cleaned, error: null }
    : { valid: false, value: cleaned, error: rule[lang] }
}

/**
 * Turn a value into something worth reading aloud.
 *
 * Long digit strings are the whole problem here. A screen reader saying
 * "two billion three hundred forty five million..." for an Aadhaar number is
 * useless. Digits get spaced out so the speech engine reads them one at a time,
 * and IFSC codes get spelled out character by character.
 */
export function speakableValue(field, value) {
  if (!value) return ''
  const spaced = (v) => v.split('').join(' ')
  switch (field.rule) {
    case 'aadhaar':
      // Grouped in fours, with a pause between groups — the way people
      // actually read an Aadhaar number aloud to each other.
      return (value.match(/\d{1,4}/g) ?? []).map(spaced).join(', ')
    case 'mobile':
    case 'bank_account':
    case 'pincode':
    case 'ifsc':
    case 'pan':
      return spaced(value)
    case 'amount':
      return `${Number(value).toLocaleString('en-IN')} rupees`
    default:
      return value
  }
}

// --- Spoken input normalisation ------------------------------------------
const HINDI_NUMBER_WORDS = {
  'shoonya':'0','ek':'1','do':'2','teen':'3',
  'chaar':'4','char':'4','paanch':'5','panch':'5',
  'chhah':'6','chhe':'6','saat':'7','sat':'7',
  'aath':'8','ath':'8','nau':'9','nao':'9',
}

export function normaliseSpokenInput(raw) {
  if (!raw) return ''
  let v = normaliseDevanagari(raw.trim().toLowerCase())
  v = v.replace(
    /\b(shoonya|ek|do|teen|chaar|char|paanch|panch|chhah|chhe|saat|sat|aath|ath|nau|nao)\b/g,
    w => HINDI_NUMBER_WORDS[w] || w
  )
  return v
}

export function isSpokenYes(raw) {
  const v = (raw || '').trim().toLowerCase()
  return /^(haan|han|ha|ji haan|ji han|yes|yeah|sahi|theek|bilkul|correct)/.test(v)
}

export function isSpokenNo(raw) {
  const v = (raw || '').trim().toLowerCase()
  return /^(nahi|nah|na|naa|ji nahi|no|nope|galat|wrong)/.test(v)
}
