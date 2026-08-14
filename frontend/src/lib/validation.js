/**
 * Deterministic field validation — the browser copy.
 *
 * This is the one that actually runs during a citizen's session, including
 * offline. Every rule is a regex or arithmetic. No model is consulted, so a
 * validation verdict cannot be hallucinated.
 *
 * Mirrors backend/validation.py, and that is enforced rather than remembered:
 * every case in shared/validation-cases.json is run through both files by
 * `npm run test:rules`, which fails if they disagree on a cleaned value, a
 * verdict, or a message. A new rule needs an entry in all three places.
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

// Android's Hindi recogniser returns ०१२३ rather than 0123, and a citizen with
// a Devanagari keyboard types them that way too. U+0966-U+096F are contiguous,
// so the offset from ० is the digit. Duplicated from speech.js rather than
// imported, because that module reads `window` at load and this one is used by
// the backend-parity checks and must stay pure.
const devanagariToAscii = (v) =>
  v.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))

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
    normalise: (v) => stripSpaces(devanagariToAscii(v)),
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
      // Only strip 91 when the length proves it is a country code. A bare
      // /^\+?91/ also eats the first two digits of 9198765432, which is a
      // perfectly good number someone actually has.
      let s = stripSpaces(devanagariToAscii(v))
      if (s.startsWith('+91') && s.length === 13) s = s.slice(3)
      else if (s.startsWith('91') && s.length === 12) s = s.slice(2)
      return s
    },
    en: 'Mobile number must be 10 digits starting with 6, 7, 8 or 9.',
    hi: 'मोबाइल नंबर 10 अंकों का हो और 6, 7, 8 या 9 से शुरू हो।',
  },
  pincode: {
    test: (v) => /^[1-9]\d{5}$/.test(v),
    normalise: (v) => stripSpaces(devanagariToAscii(v)),
    en: 'PIN code must be 6 digits and cannot start with 0.',
    hi: 'पिन कोड 6 अंकों का होता है और 0 से शुरू नहीं होता।',
  },
  bank_account: {
    test: (v) => /^\d{9,18}$/.test(v),
    normalise: (v) => stripSpaces(devanagariToAscii(v)),
    en: 'Bank account number must be between 9 and 18 digits.',
    hi: 'बैंक खाता संख्या 9 से 18 अंकों के बीच होनी चाहिए।',
  },
  date: {
    test: (v) => parseDate(v) !== null,
    normalise: (v) => devanagariToAscii(v).trim().replace(/[-.]/g, '/'),
    en: 'Date must be in DD/MM/YYYY format. Example: 14/08/1961',
    hi: 'तारीख DD/MM/YYYY रूप में लिखें। जैसे: 14/08/1961',
  },
  date_past: {
    test: (v) => {
      const d = parseDate(v)
      return d !== null && d < new Date()
    },
    normalise: (v) => devanagariToAscii(v).trim().replace(/[-.]/g, '/'),
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
    normalise: (v) => devanagariToAscii(v.replace(/[,\s₹]/g, '')),
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

  // An optional field may be left empty — an email address the citizen does not
  // have, a post office they do not know. Empty passes; anything actually
  // entered is still held to the same rule, because a half-remembered email is
  // worse than none on a form that gets posted back.
  if (field.optional && !raw) return { valid: true, value: '', error: null }

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
