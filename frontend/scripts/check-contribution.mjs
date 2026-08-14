/**
 * Validate form templates — the ones committed, and the ones being contributed.
 *
 * A teammate's model can produce something that looks like a template and is
 * quietly broken: a rule name that does not exist, a `showIf` pointing at a
 * field defined later, Hindi missing on one explanation out of nine. Those are
 * all invisible in review and all fatal at runtime.
 *
 *   node scripts/check-contribution.mjs                  check all ten templates
 *   node scripts/check-contribution.mjs path/to/new.json check one submission
 *
 * Structure only. It cannot tell whether the Hindi is good or whether the
 * explanation of a government rule is true — a human still reads for meaning.
 * What it guarantees is that review time goes to meaning instead of shape.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const formsDir = resolve(frontend, 'src/data/forms')

const { RULES } = await import('../src/lib/validation.js')

const VALID_RULES = new Set([...Object.keys(RULES), 'choice'])
const VALID_SOURCES = new Set(['ask', 'digilocker'])
// Derived from the committed templates rather than hard-coded, so a profile key
// added to the backend does not have to be remembered here as well.
const VALID_PROFILE_KEYS = new Set(
  readdirSync(formsDir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) =>
      JSON.parse(readFileSync(join(formsDir, f), 'utf8'))
        .fields.map((x) => x.profileKey)
        .filter(Boolean),
    ),
)

/** Twice the busiest existing form. Past this, a voice flow stops being usable. */
const MAX_COMFORTABLE_QUESTIONS = 20

const TOP_LEVEL = ['id', 'icon', 'name', 'issuer', 'summary', 'ocrKeywords', 'documents', 'fields']
const BILINGUAL_TOP = ['name', 'issuer', 'summary']
const FIELD_REQUIRED = ['id', 'label', 'rule', 'source', 'question', 'explain']
const BILINGUAL_FIELD = ['label', 'question', 'explain']

/** `{en, hi}` with both sides present and non-empty. */
function bilingualProblem(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `${what} must be an object with "en" and "hi"`
  }
  const missing = ['en', 'hi'].filter(
    (l) => typeof value[l] !== 'string' || !value[l].trim(),
  )
  return missing.length ? `${what} is missing ${missing.join(' and ')}` : null
}

function checkTemplate(data, label, knownIds) {
  const errors = []
  const warnings = []
  const err = (m) => errors.push(m)

  for (const key of TOP_LEVEL) {
    if (!(key in data)) err(`missing top-level "${key}"`)
  }

  if (typeof data.id === 'string') {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.id)) {
      err(`id "${data.id}" must be kebab-case (lowercase, hyphens)`)
    }
    if (knownIds && knownIds.has(data.id)) {
      err(`id "${data.id}" is already used by another form`)
    }
    const stem = basename(label, '.json')
    if (stem !== data.id) {
      warnings.push(`filename "${stem}.json" does not match id "${data.id}"`)
    }
  }

  if (typeof data.icon === 'string' && [...data.icon].length > 2) {
    warnings.push(`icon "${data.icon}" looks long; one emoji is expected`)
  }

  for (const key of BILINGUAL_TOP) {
    if (key in data) {
      const p = bilingualProblem(data[key], key)
      if (p) err(p)
    }
  }

  if (!Array.isArray(data.ocrKeywords) || data.ocrKeywords.length === 0) {
    err('ocrKeywords must be a non-empty array — a scanned form cannot be identified without it')
  } else {
    for (const k of data.ocrKeywords) {
      if (typeof k !== 'string') err(`ocrKeyword ${JSON.stringify(k)} is not a string`)
      else if (k !== k.toLowerCase()) {
        err(`ocrKeyword "${k}" must be lowercase — matching lowercases the OCR text`)
      }
    }
  }

  if (!Array.isArray(data.documents) || data.documents.length === 0) {
    err('documents must be a non-empty array')
  } else {
    data.documents.forEach((doc, i) => {
      const p = bilingualProblem(doc, `documents[${i}]`)
      if (p) err(p)
    })
  }

  if (!Array.isArray(data.fields) || data.fields.length === 0) {
    err('fields must be a non-empty array')
    return { errors, warnings }
  }

  const seen = new Set()
  data.fields.forEach((f, i) => {
    const at = `fields[${i}]${f?.id ? ` (${f.id})` : ''}`
    if (f === null || typeof f !== 'object') {
      err(`${at} is not an object`)
      return
    }

    for (const key of FIELD_REQUIRED) {
      if (!(key in f)) err(`${at} is missing "${key}"`)
    }

    if (typeof f.id === 'string') {
      if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(f.id)) {
        err(`${at} id must be snake_case`)
      }
      if (seen.has(f.id)) err(`${at} duplicate field id "${f.id}"`)
      seen.add(f.id)
    }

    for (const key of BILINGUAL_FIELD) {
      if (key in f) {
        const p = bilingualProblem(f[key], `${at}.${key}`)
        if (p) err(p)
      }
    }

    if ('rule' in f && !VALID_RULES.has(f.rule)) {
      err(`${at} unknown rule "${f.rule}" — valid: ${[...VALID_RULES].sort().join(', ')}`)
    }

    if ('source' in f && !VALID_SOURCES.has(f.source)) {
      err(`${at} source must be "ask" or "digilocker", got "${f.source}"`)
    }

    if (f.source === 'digilocker') {
      if (!f.profileKey) {
        err(`${at} source is "digilocker" but there is no profileKey to fill it from`)
      } else if (!VALID_PROFILE_KEYS.has(f.profileKey)) {
        err(
          `${at} unknown profileKey "${f.profileKey}" — valid: ${[...VALID_PROFILE_KEYS].sort().join(', ')}`,
        )
      }
    } else if (f.profileKey) {
      err(`${at} has a profileKey but source is "${f.source}" — it will never be used`)
    }

    if (f.rule === 'choice') {
      if (!Array.isArray(f.options) || f.options.length < 2) {
        err(`${at} rule is "choice" so it needs at least two options`)
      } else {
        const values = new Set()
        f.options.forEach((o, j) => {
          const oat = `${at}.options[${j}]`
          if (typeof o?.value !== 'string' || !o.value.trim()) {
            err(`${oat} needs a non-empty "value"`)
          } else {
            if (values.has(o.value)) err(`${oat} duplicate value "${o.value}"`)
            values.add(o.value)
          }
          const p = bilingualProblem(o, oat)
          if (p) err(p)
        })
      }
    } else if (f.options) {
      err(`${at} has options but rule is "${f.rule}" — only "choice" uses options`)
    }

    if ('optional' in f && typeof f.optional !== 'boolean') {
      err(`${at} optional must be true or false`)
    }

    if ('showIf' in f) {
      const cond = f.showIf
      if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) {
        err(`${at} showIf must be an object like {"single_parent": "No"}`)
      } else {
        for (const [target, allowed] of Object.entries(cond)) {
          const earlier = data.fields.slice(0, i)
          const found = earlier.find((x) => x?.id === target)
          if (!found) {
            const anywhere = data.fields.find((x) => x?.id === target)
            err(
              anywhere
                ? `${at} showIf names "${target}", which is defined later — it must come earlier or it can never be answered first`
                : `${at} showIf names "${target}", which is not a field in this form`,
            )
            continue
          }
          // A condition that no option can satisfy hides the field forever.
          if (found.rule === 'choice' && Array.isArray(found.options)) {
            const values = found.options.map((o) => o.value)
            const wanted = Array.isArray(allowed) ? allowed : [allowed]
            const impossible = wanted.filter((w) => !values.includes(w))
            if (impossible.length) {
              err(
                `${at} showIf expects ${target} to be ${impossible.map((v) => `"${v}"`).join('/')}, which is not one of its options (${values.join(', ')}) — this field could never be shown`,
              )
            }
          }
        }
      }
    }

    if ('example' in f && typeof f.example !== 'string') {
      err(`${at} example must be a string`)
    }
    // An example that its own rule rejects teaches the citizen the wrong shape.
    if (typeof f.example === 'string' && f.rule !== 'choice' && RULES[f.rule]) {
      const rule = RULES[f.rule]
      const cleaned = rule.normalise ? rule.normalise(f.example) : f.example
      if (cleaned && !rule.test(cleaned)) {
        warnings.push(`${at} example "${f.example}" does not pass its own "${f.rule}" rule`)
      }
    }
  })

  // Two fields sharing a profileKey both receive the identical DigiLocker
  // value, and neither is ever asked — so if the assumption is wrong (the
  // informant is not the parent) the citizen cannot see it, let alone fix it.
  const byProfileKey = {}
  for (const f of data.fields) {
    if (f?.profileKey) (byProfileKey[f.profileKey] ??= []).push(f.id)
  }
  for (const [key, ids] of Object.entries(byProfileKey)) {
    if (ids.length > 1) {
      warnings.push(
        `${ids.join(' and ')} both auto-fill from profileKey "${key}", so both get the same value and neither is ever asked — is that what you mean?`,
      )
    }
  }

  // Every asked field is one spoken question. The busiest form in the project
  // asks ten; far beyond that is a form a citizen will abandon halfway.
  const asked = data.fields.filter((f) => f?.source !== 'digilocker').length
  if (asked > MAX_COMFORTABLE_QUESTIONS) {
    warnings.push(
      `${asked} questions will be asked aloud, one at a time. The busiest existing form asks 10. Consider whether every field is needed, or whether some can be optional or gated behind showIf.`,
    )
  }

  return { errors, warnings }
}

// --- Run -------------------------------------------------------------------

const arg = process.argv[2]
let targets
let knownIds = null

if (arg) {
  targets = [resolve(process.cwd(), arg)]
  // A submission is new, so its id must not collide with one already committed.
  knownIds = new Set(
    readdirSync(formsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(formsDir, f), 'utf8')).id),
  )
  const stem = basename(targets[0])
  if (readdirSync(formsDir).includes(stem)) knownIds = null // editing in place
} else {
  targets = readdirSync(formsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(formsDir, f))
}

let failed = 0
let warned = 0

for (const path of targets) {
  const label = basename(path)
  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.log(`FAIL ${label}`)
    console.log(`       not valid JSON: ${e.message}`)
    failed += 1
    continue
  }

  const { errors, warnings } = checkTemplate(data, label, knownIds)
  warned += warnings.length

  if (errors.length) {
    failed += 1
    console.log(`FAIL ${label}  (${data.fields?.length ?? 0} fields)`)
    for (const e of errors) console.log(`       ${e}`)
  } else {
    console.log(`ok   ${label}  (${data.fields?.length ?? 0} fields)`)
  }
  for (const w of warnings) console.log(`  warn ${w}`)
}

console.log()
if (failed) {
  console.log(`${failed} of ${targets.length} failed, ${warned} warning(s)`)
  process.exit(1)
}
console.log(`all ${targets.length} template(s) valid, ${warned} warning(s)`)
