/**
 * Keep every interface string real, and in both languages.
 *
 * `t()` falls back to English when `hi` is missing, and returns the key itself
 * when the key is missing. Both failures render — a citizen who reads only
 * Hindi gets an English sentence, or the literal word `downloadPdf`, and the
 * build stays green. `STRINGS` is a plain object too, so a repeated key
 * silently overrides the earlier one and the wrong text ships.
 *
 * Nothing else in the project looks at this file, so this is the only place
 * those mistakes can be caught before a human notices them on a phone.
 *
 *   node scripts/check-text.mjs                     check src/lib/i18n.js
 *   node scripts/check-text.mjs some/i18n.js        check a fixture
 *   node scripts/check-text.mjs some/i18n.js src/   ...and cross-check its use
 *
 * The second and third forms exist so check-text.test.mjs can point this at
 * throwaway fixtures instead of breaking the real strings to see whether the
 * check bites.
 *
 * Errors fail the build. Warnings are for judgement calls a human should see.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')

const defaultFile = resolve(frontend, 'src/lib/i18n.js')
const stringsFile = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultFile
const sourceDir = process.argv[3]
  ? resolve(process.cwd(), process.argv[3])
  : stringsFile === defaultFile
    ? resolve(frontend, 'src')
    : null

/** The two languages the app ships. Anything else is a typo for one of them. */
const LANGUAGES = ['en', 'hi']

/** U+0900–U+097F. Hindi with none of this is English wearing a `hi:` label. */
const DEVANAGARI = /[ऀ-ॿ]/

/** The `{name}` slots a string expects to be given at render time. */
const placeholders = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))

const errors = []
const warnings = []

const raw = readFileSync(stringsFile, 'utf8')

/** Paths inside the project read better relative; a fixture elsewhere does not. */
const shortPath = (file) => {
  const short = relative(frontend, file)
  return short.startsWith('..') ? file : short
}
const rel = shortPath(stringsFile)

/**
 * Blank out string literals and comments, keeping every character position, so
 * a brace inside a sentence cannot be mistaken for a brace in the object.
 */
function masked(text) {
  const out = text.split('')
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') out[i++] = ' '
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      while (i < stop) {
        if (text[i] !== '\n') out[i] = ' '
        i += 1
      }
    } else if (c === "'" || c === '"' || c === '`') {
      out[i++] = ' '
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') {
          out[i] = ' '
          i += 1
        }
        if (i < text.length) {
          if (text[i] !== '\n') out[i] = ' '
          i += 1
        }
      }
      if (i < text.length) out[i++] = ' '
    } else {
      i += 1
    }
  }
  return out.join('')
}

const lineOf = (index) => raw.slice(0, index).split('\n').length

/**
 * Every key written at the top level of the `STRINGS` literal, in file order
 * and including repeats — which is the whole point, since importing the module
 * would have silently collapsed them.
 */
function writtenKeys() {
  const flat = masked(raw)
  const declared = flat.indexOf('STRINGS')
  if (declared === -1) return null
  const open = flat.indexOf('{', declared)
  if (open === -1) return null

  // Nesting depth at each character, so `en:` and `hi:` inside an entry sit at
  // depth 2 and only the entry names themselves are read at depth 1.
  const depthAt = new Array(flat.length).fill(0)
  let depth = 0
  let close = flat.length
  for (let i = open; i < flat.length; i += 1) {
    const c = flat[i]
    if (c === '{' || c === '[' || c === '(') {
      depth += 1
      depthAt[i] = depth
    } else if (c === '}' || c === ']' || c === ')') {
      depthAt[i] = depth
      depth -= 1
      if (depth === 0) {
        close = i
        break
      }
    } else {
      depthAt[i] = depth
    }
  }

  const found = []
  for (const m of flat.slice(open, close).matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) {
    const index = open + m.index
    if (depthAt[index] === 1) found.push({ name: m[1], index })
  }
  return found
}

const written = writtenKeys()
if (!written) {
  console.log(`FAIL ${rel}  no \`STRINGS\` object found — is this the strings file?`)
  process.exit(1)
}

let STRINGS
try {
  ;({ STRINGS } = await import(pathToFileURL(stringsFile).href))
} catch (e) {
  console.log(`FAIL ${rel}  the file does not parse as JavaScript:\n  ${e.message}`)
  process.exit(1)
}
if (!STRINGS || typeof STRINGS !== 'object') {
  console.log(`FAIL ${rel}  \`STRINGS\` is not an object`)
  process.exit(1)
}

// --- The keys themselves ---------------------------------------------------

const seen = new Map()
for (const { name, index } of written) {
  if (seen.has(name)) {
    errors.push(
      `${rel}:${lineOf(index)}  duplicate key "${name}" — also at line ${lineOf(seen.get(name))}. ` +
        `The later one silently wins and the earlier text never ships.`,
    )
  } else {
    seen.set(name, index)
  }

  if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
    errors.push(`${rel}:${lineOf(index)}  key "${name}" is not camelCase`)
  }
}

// If these disagree the file uses a shape this scanner cannot read — quoted
// keys, a spread, a computed name — and every check below is working from a
// list it cannot trust. Say so rather than reporting a clean run.
const imported = Object.keys(STRINGS)
const unreadable = imported.filter((k) => !seen.has(k))
if (unreadable.length) {
  errors.push(
    `${rel}  ${unreadable.length} key(s) exist at runtime but are not written as plain ` +
      `camelCase entries: ${unreadable.join(', ')}. Use \`keyName: { en, hi },\`.`,
  )
}

// --- The strings themselves ------------------------------------------------

for (const [name, index] of seen) {
  const at = `${rel}:${lineOf(index)}`
  const entry = STRINGS[name]

  if (!entry || typeof entry !== 'object') {
    errors.push(`${at}  "${name}" must be an object: { en: '…', hi: '…' }`)
    continue
  }

  for (const extra of Object.keys(entry)) {
    if (!LANGUAGES.includes(extra)) {
      errors.push(`${at}  "${name}" has an unknown language "${extra}" — only en and hi exist`)
    }
  }

  for (const lang of LANGUAGES) {
    const value = entry[lang]
    if (value === undefined) {
      errors.push(
        `${at}  "${name}" has no ${lang}` +
          (lang === 'hi' ? ' — t() falls back to English, so this ships looking fine' : ''),
      )
      continue
    }
    if (typeof value !== 'string') {
      errors.push(`${at}  "${name}".${lang} must be a string`)
      continue
    }
    if (value.trim() === '') {
      errors.push(`${at}  "${name}".${lang} is empty`)
      continue
    }
    if (value !== value.trim()) {
      errors.push(`${at}  "${name}".${lang} has leading or trailing whitespace`)
    }
  }

  if (typeof entry.hi === 'string' && entry.hi.trim() && !DEVANAGARI.test(entry.hi)) {
    errors.push(
      `${at}  "${name}".hi has no Devanagari — "${entry.hi}" is English under a hi label`,
    )
  }

  // A placeholder present in one language and not the other means the value is
  // silently dropped for whoever reads the other one — usually the Hindi.
  if (typeof entry.en === 'string' && typeof entry.hi === 'string') {
    const inEn = placeholders(entry.en)
    const inHi = placeholders(entry.hi)
    for (const slot of inEn) {
      if (!inHi.has(slot)) errors.push(`${at}  "${name}" uses {${slot}} in en but not in hi`)
    }
    for (const slot of inHi) {
      if (!inEn.has(slot)) errors.push(`${at}  "${name}" uses {${slot}} in hi but not in en`)
    }
  }
}

const byEnglish = new Map()
for (const name of seen.keys()) {
  const en = STRINGS[name]?.en
  if (typeof en !== 'string') continue
  const key = en.trim().toLowerCase()
  if (!byEnglish.has(key)) byEnglish.set(key, [])
  byEnglish.get(key).push(name)
}
for (const [, names] of byEnglish) {
  if (names.length > 1) {
    warnings.push(
      `${rel}  ${names.join(' and ')} say the same thing in English — reuse one instead`,
    )
  }
}

// --- Where the keys are used ----------------------------------------------

function sourceFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(jsx?|json)$/.test(entry.name) && full !== stringsFile) out.push(full)
    }
  }
  walk(dir)
  return out.sort()
}

let scanned = 0
if (sourceDir) {
  // Only `t('literal')` can be checked for existence. `t(title, lang)` picks its
  // key at runtime, which is why an unused key below is a warning and not a
  // failure — the reference may be a variable this scan cannot see.
  const called = /(?:^|[^A-Za-z0-9_$.])t\(\s*['"`]([^'"`]*)['"`]/g
  const quoted = /['"`]([A-Za-z][A-Za-z0-9]*)['"`]/g
  const mentioned = new Set()

  for (const file of sourceFiles(sourceDir)) {
    scanned += 1
    const text = readFileSync(file, 'utf8')
    const where = shortPath(file)

    for (const m of text.matchAll(called)) {
      if (!Object.hasOwn(STRINGS, m[1])) {
        errors.push(
          `${where}:${text.slice(0, m.index).split('\n').length}  t('${m[1]}') has no such ` +
            `string — t() returns the key, so the screen shows "${m[1]}"`,
        )
      }
    }

    // A bilingual string written straight into a component never reaches this
    // file, so it is invisible to every check here and to the contributor packs
    // that list what already exists. That is how near-duplicates get written.
    if (file.endsWith('.jsx')) {
      for (const m of text.matchAll(/lang\s*===\s*['"]hi['"]/g)) {
        errors.push(
          `${where}:${text.slice(0, m.index).split('\n').length}  an inline "lang === 'hi'" ` +
            `string — every word a screen shows belongs in i18n.js, with {slots} for values`,
        )
      }
    }

    for (const m of text.matchAll(quoted)) mentioned.add(m[1])
  }

  for (const name of seen.keys()) {
    if (!mentioned.has(name)) {
      warnings.push(`${rel}:${lineOf(seen.get(name))}  "${name}" is never used by any screen`)
    }
  }
}

// --- Report ----------------------------------------------------------------

console.log(`strings: ${seen.size} keys in ${rel}`)
console.log(sourceDir ? `checked: ${scanned} source files for use` : 'checked: strings only')
console.log()

for (const w of warnings) console.log(`  warn ${w}`)
for (const e of errors) console.log(`  FAIL ${e}`)

if (errors.length) {
  console.log(`\n${errors.length} problem(s), ${warnings.length} warning(s)`)
  process.exit(1)
}
console.log(`every string is in both languages, ${warnings.length} warning(s)`)
