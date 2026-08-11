/**
 * Voice input and output, on top of the browser's built-in Web Speech API.
 *
 * Nothing here talks to a server, so speaking and listening both keep working
 * with the phone offline. Bhashini replaces the internals of this file in V1;
 * everything above it calls the same four functions either way.
 *
 * Browser reality check: speech *recognition* is Chrome/Edge only. Speech
 * *synthesis* works nearly everywhere. So the app must stay fully usable by
 * typing — voice is an accelerator, never a requirement.
 */

const LOCALE = { hi: 'hi-IN', en: 'en-IN' }

// --- Capability detection --------------------------------------------------

const Recognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined

export const canListen = Boolean(Recognition)
export const canSpeak =
  typeof window !== 'undefined' && 'speechSynthesis' in window

// --- Text to speech --------------------------------------------------------

/**
 * Voices load asynchronously in Chrome — getVoices() returns [] on first call
 * and fills in later. Resolve once we actually have them.
 */
let voicesReady = null
function loadVoices() {
  if (!canSpeak) return Promise.resolve([])
  if (voicesReady) return voicesReady
  voicesReady = new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices()
    if (existing.length) return resolve(existing)
    const onChange = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    // Some browsers never fire the event; do not hang forever.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1200)
  })
  return voicesReady
}

async function pickVoice(lang) {
  const voices = await loadVoices()
  const locale = LOCALE[lang] ?? LOCALE.hi
  return (
    voices.find((v) => v.lang === locale) ??
    voices.find((v) => v.lang?.startsWith(lang)) ??
    null
  )
}

/**
 * Speak a line and resolve when it finishes.
 *
 * Deliberately slower than default (rate 0.85) — our users are elderly and a
 * government field name read at normal speed is genuinely hard to follow.
 */
export async function speak(text, lang = 'hi', { rate = 0.85 } = {}) {
  if (!canSpeak || !text) return
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = LOCALE[lang] ?? LOCALE.hi
  utterance.rate = rate
  utterance.pitch = 1

  const voice = await pickVoice(lang)
  if (voice) utterance.voice = voice

  return new Promise((resolve) => {
    utterance.onend = resolve
    utterance.onerror = resolve // never let a speech failure block the flow
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel()
}

// --- Speech to text --------------------------------------------------------

/**
 * Start listening for a single answer.
 *
 * @returns {{stop: function}} call stop() to cancel early
 */
export function listenOnce(
  lang = 'hi',
  { onResult, onPartial, onError, onEnd } = {},
) {
  if (!Recognition) {
    onError?.('unsupported')
    return { stop: () => {} }
  }

  const recognition = new Recognition()
  recognition.lang = LOCALE[lang] ?? LOCALE.hi
  recognition.interimResults = true
  recognition.maxAlternatives = 3
  recognition.continuous = false

  let settled = false

  recognition.onresult = (event) => {
    let finalText = ''
    let partialText = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) finalText += result[0].transcript
      else partialText += result[0].transcript
    }
    if (partialText) onPartial?.(partialText)
    if (finalText) {
      settled = true
      onResult?.(finalText.trim())
    }
  }

  recognition.onerror = (event) => {
    settled = true
    onError?.(event.error)
  }

  recognition.onend = () => {
    if (!settled) onError?.('no-speech')
    onEnd?.()
  }

  try {
    recognition.start()
  } catch {
    onError?.('already-started')
  }

  return { stop: () => recognition.stop() }
}

// --- Making spoken answers usable ------------------------------------------

const DIGIT_WORDS = {
  // Hindi
  शून्य: '0', सुन्ना: '0', जीरो: '0',
  एक: '1', दो: '2', तीन: '3', चार: '4',
  पाँच: '5', पांच: '5', छह: '6', छै: '6', छे: '6',
  सात: '7', आठ: '8', नौ: '9',
  // English, as Chrome often returns these even in hi-IN mode
  zero: '0', oh: '0', o: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
}

/** Devanagari digits ०-९ to ASCII. */
function devanagariToAscii(text) {
  return text.replace(/[०-९]/g, (d) =>
    String(d.charCodeAt(0) - 0x0966),
  )
}

// --- Spoken amounts --------------------------------------------------------

const WORD_VALUES = {
  ...Object.fromEntries(
    Object.entries(DIGIT_WORDS).map(([word, digit]) => [word, Number(digit)]),
  ),
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50,
  साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90,
}

const SCALES = {
  hundred: 100, सौ: 100,
  thousand: 1000, हज़ार: 1000, हजार: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000, लाख: 100000,
  crore: 10000000, crores: 10000000, करोड़: 10000000, करोड: 10000000,
}

const AMOUNT_WORDS = new Set([
  ...Object.keys(WORD_VALUES),
  ...Object.keys(SCALES),
])

/**
 * Does this phrase contain spelled-out numbers?
 *
 * Token comparison rather than a regex, because JavaScript's `\b` is defined
 * over ASCII word characters and simply does not fire around Devanagari — a
 * regex here silently never matches "एक लाख अस्सी हज़ार".
 */
function hasNumberWords(text) {
  return text
    .toLowerCase()
    .split(/[\s,-]+/)
    .some((token) => AMOUNT_WORDS.has(token))
}

/**
 * Turn "one lakh eighty thousand" into 180000.
 *
 * This matters more than it looks. Indians state money in lakhs and thousands,
 * and simply keeping the digits from that phrase yields "1" — a valid-looking
 * number that is wrong by a factor of 180,000. A silently wrong income figure
 * gets a scholarship rejected, so ambiguity here must never pass validation
 * quietly.
 *
 * Returns a digit string, or null if the phrase could not be understood.
 */
function parseSpokenAmount(text) {
  const tokens = text
    .toLowerCase()
    .split(/[\s,-]+/)
    .filter(Boolean)
    .filter((t) => !['and', 'rupees', 'rupee', 'रुपये', 'रुपए', 'और'].includes(t))

  let total = 0
  let current = 0
  let sawAnything = false

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      current += Number(token)
      sawAnything = true
      continue
    }
    if (token in WORD_VALUES) {
      current += WORD_VALUES[token]
      sawAnything = true
      continue
    }
    if (token in SCALES) {
      const scale = SCALES[token]
      sawAnything = true
      if (scale === 100) {
        current = (current || 1) * 100
      } else {
        total += (current || 1) * scale
        current = 0
      }
      continue
    }
    return null // a word we do not understand — do not guess at someone's income
  }

  if (!sawAnything) return null
  return String(total + current)
}

/**
 * Turn a spoken answer into the raw value a field expects.
 *
 * The hard case is long numbers. Speech engines return Aadhaar and account
 * numbers in wildly inconsistent shapes — "2345 6789 0124", "दो तीन चार पाँच...",
 * "२३४५...", or one giant integer. Numeric fields therefore keep digits and
 * throw everything else away, after mapping number words and Devanagari digits.
 */
export function normaliseSpoken(text, field) {
  if (!text) return ''
  let out = devanagariToAscii(text.trim())

  // Amounts are their own problem: "one lakh eighty thousand" must become
  // 180000, not 1. Only fall back to bare digits when no number words appear.
  if (field?.rule === 'amount') {
    if (hasNumberWords(out)) {
      const parsed = parseSpokenAmount(out)
      // null means we did not understand it. Return the original text so
      // validation rejects it and the citizen is asked again, rather than
      // silently recording a wrong figure.
      return parsed ?? out.trim()
    }
    return out.replace(/[^\d]/g, '')
  }

  const numericRules = ['aadhaar', 'mobile', 'bank_account', 'pincode']

  if (numericRules.includes(field?.rule)) {
    // "double five" / "डबल पाँच" -> "five five"
    out = out.replace(
      /\b(double|डबल)\s+(\S+)/giu,
      (_, __, word) => `${word} ${word}`,
    )
    out = out
      .split(/[\s,.-]+/)
      .map((word) => DIGIT_WORDS[word.toLowerCase()] ?? word)
      .join('')
    return out.replace(/\D/g, '')
  }

  if (field?.rule === 'date' || field?.rule === 'date_past') {
    const digits = out.replace(/\D/g, '')
    if (digits.length === 8) {
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    }
    return out.replace(/[-.]/g, '/')
  }

  if (field?.rule === 'ifsc' || field?.rule === 'pan') {
    return out.replace(/[\s.-]/g, '').toUpperCase()
  }

  if (field?.rule === 'email') {
    return out
      .replace(/\s*(at the rate|at)\s*/gi, '@')
      .replace(/\s*(dot|डॉट)\s*/gi, '.')
      .replace(/\s+/g, '')
      .toLowerCase()
  }

  return out.replace(/\s+/g, ' ')
}

/**
 * Match a spoken answer against a choice field's options.
 *
 * Citizens rarely say the option back word for word — asked to pick a gender
 * they say "महिला", asked for an account type they say "जन धन". Look for any
 * option whose label appears inside what they said, in either language.
 */
export function matchChoice(text, field) {
  if (!text || !field?.options) return null
  const said = text.toLowerCase().trim()

  const labels = (option) =>
    [option.value, option.en, option.hi].filter(Boolean).map((c) => c.toLowerCase())

  // Exact match first. Without this pass, "female" matches the *Male* option,
  // because "male" is a substring of "female" — a wrong answer recorded on a
  // government form without the citizen ever seeing it happen.
  for (const option of field.options) {
    if (labels(option).includes(said)) return option.value
  }

  // Then whole-word containment, in either direction. Every option is scored
  // before any is chosen, and the longest matching label wins — otherwise
  // "अनुसूचित जनजाति" (ST) is claimed by "अनुसूचित जाति" (SC) purely because
  // SC is listed first.
  const asWords = (haystack, needle) =>
    new RegExp(`(^|[\\s(/,])${escapeRegex(needle)}($|[\\s)/,])`, 'iu').test(
      haystack,
    )

  let best = null
  for (const option of field.options) {
    for (const label of labels(option)) {
      if (asWords(said, label) || asWords(label, said)) {
        if (!best || label.length > best.length) {
          best = { value: option.value, length: label.length }
        }
      }
    }
  }
  if (best) return best.value

  // Last resort: the first significant word of a label, so someone saying
  // "zero" selects "Zero balance (Jan Dhan / BSBDA)". Only usable when that
  // word belongs to exactly one option — "अनुसूचित" opens both SC and ST, so
  // it must not decide anything.
  const firstWords = field.options.map((option) =>
    [option.en, option.hi]
      .filter(Boolean)
      .map((label) => label.toLowerCase().split(/[\s(/]+/)[0]),
  )
  const counts = new Map()
  for (const words of firstWords) {
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
  }

  for (let i = 0; i < field.options.length; i += 1) {
    for (const word of firstWords[i]) {
      if (word.length > 2 && counts.get(word) === 1 && asWords(said, word)) {
        return field.options[i].value
      }
    }
  }
  return null
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
