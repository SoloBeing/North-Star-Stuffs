/**
 * Hold the two validators to each other.
 *
 * The rule table exists twice — frontend/src/lib/validation.js runs in the
 * citizen's browser, backend/validation.py backs the API — and until now
 * nothing but discipline kept them in step. PR #1 was exactly this failure: a
 * fix applied to the browser copy and missed on the server.
 *
 * For every case in shared/validation-cases.json this asserts that both
 * implementations clean the input to the same string, reach the same verdict,
 * and carry byte-identical messages. It also fails when a rule exists in one
 * language and not the other, or has no cases at all — so a contribution that
 * adds a rule to one side cannot be merged.
 *
 * Hand-written cases only test what someone thought to write down, and that is
 * how three live rules once disagreed on Bengali digits without anyone noticing:
 * Python's \d matches every Unicode decimal digit and JavaScript's matches 0-9.
 * So every declared input is also replayed in variants — its digits swapped for
 * other Indic scripts, and the two whitespace code points the languages disagree
 * about spliced in. Those variants assert only that the two files *agree*, not
 * what they agree on, which is the property that actually has to hold.
 *
 *   node scripts/check-rule-parity.mjs
 *
 * Needs Python. Only a change to a validation rule needs this check; adding a
 * form or an interface string does not, which is why it is not in `npm run
 * check`. CI runs `npm run check:all`, which includes it.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
// Optional argv: a repository root to check instead of this one. Only
// check-rule-parity.test.mjs passes it, so it can point the whole check at a
// fixture tree and break one thing at a time.
const root = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '../..')
const frontend = resolve(root, 'frontend')

const { RULES, trimEdges } = await import(
  pathToFileURL(resolve(frontend, 'src/lib/validation.js')).href
)
const cases = JSON.parse(readFileSync(resolve(root, 'shared/validation-cases.json'), 'utf8'))
delete cases._comment

/** The repo's venv first — it is what `uv sync` builds — then the system one. */
function findPython() {
  const candidates = [resolve(root, '.venv/bin/python'), 'python3', 'python']
  for (const exe of candidates) {
    if (exe.includes('/') && !existsSync(exe)) continue
    try {
      execFileSync(exe, ['-c', 'import sys; sys.path.insert(0, "."); import backend.validation'], {
        cwd: root,
        stdio: 'pipe',
      })
      return exe
    } catch {
      continue
    }
  }
  return null
}

const python = findPython()
if (!python) {
  console.error('Cannot import backend.validation with any available Python.')
  console.error('This check compares the two rule tables, so it needs both.')
  console.error('From the repository root:  uv sync')
  process.exit(1)
}

// --- Collect what each side does -------------------------------------------

/**
 * Variants of a declared input that probe where the two languages differ.
 *
 * Digits: Python's \d is every Unicode decimal, JavaScript's is 0-9. Only
 * Devanagari is normalised away, so any other Indic script reaches the pattern.
 * Whitespace: Python's \s and .strip() also take U+001C-U+001F and U+0085,
 * JavaScript's also take U+FEFF — the entire disagreement, by brute force over
 * every code point.
 */
const DIGIT_SCRIPTS = { bengali: 0x09e6, tamil: 0x0be6, arabic: 0x0660 }
const SPLIT_CHARS = { bom: '﻿', fileSep: '' }

function variantsOf(raw) {
  const out = []
  if (typeof raw !== 'string' || !raw) return out
  for (const [script, base] of Object.entries(DIGIT_SCRIPTS)) {
    const swapped = raw.replace(/[0-9]/g, (d) => String.fromCodePoint(base + Number(d)))
    if (swapped !== raw) out.push([`digits:${script}`, swapped])
  }
  for (const [name, ch] of Object.entries(SPLIT_CHARS)) {
    out.push([`${name}:lead`, ch + raw])
    out.push([`${name}:trail`, raw + ch])
    if (raw.length > 1) {
      out.push([`${name}:mid`, raw.slice(0, 1) + ch + raw.slice(1)])
    }
  }
  return out
}

/** Declared inputs first, then their variants — the split is tracked per rule. */
const inputsByRule = {}
const declaredCount = {}
const variantLabels = {}
for (const [rule, spec] of Object.entries(cases)) {
  const declared = [
    ...(spec.pass ?? []).map(([raw]) => raw),
    ...(spec.fail ?? []).map(([raw]) => raw),
  ]
  const derived = declared.flatMap(variantsOf)
  declaredCount[rule] = declared.length
  variantLabels[rule] = derived.map(([label]) => label)
  inputsByRule[rule] = [...declared, ...derived.map(([, value]) => value)]
}

function jsSide() {
  const out = {}
  for (const [rule, inputs] of Object.entries(inputsByRule)) {
    const r = RULES[rule]
    if (!r) continue
    out[rule] = {
      en: r.en,
      hi: r.hi,
      results: inputs.map((raw) => {
        const trimmed = trimEdges(raw ?? '')
        const cleaned = trimmed ? (r.normalise ? r.normalise(trimmed) : trimmed) : ''
        return [cleaned, cleaned ? Boolean(r.test(cleaned)) : false]
      }),
    }
  }
  return { rules: Object.keys(RULES).sort(), data: out }
}

function pySide() {
  const dir = mkdtempSync(join(tmpdir(), 'formmitra-parity-'))
  const inFile = join(dir, 'in.json')
  writeFileSync(inFile, JSON.stringify(inputsByRule))
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(root)})
from backend.validation import RULES, trim_edges

inputs = json.load(open(${JSON.stringify(inFile)}))
out = {}
for rule, raws in inputs.items():
    r = RULES.get(rule)
    if r is None:
        continue
    results = []
    for raw in raws:
        trimmed = trim_edges(raw or "")
        norm = r.get("normalise")
        cleaned = norm(trimmed) if (norm and trimmed) else trimmed
        if not cleaned:
            results.append([cleaned, False])
            continue
        ok = bool(r["pattern"].fullmatch(cleaned)) if r["kind"] == "regex" else bool(r["fn"](cleaned))
        results.append([cleaned, ok])
    out[rule] = {"en": r["en"], "hi": r["hi"], "results": results}

print(json.dumps({"rules": sorted(RULES.keys()), "data": out}))
`
  try {
    const raw = execFileSync(python, ['-c', script], { cwd: root, encoding: 'utf8' })
    return JSON.parse(raw)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const js = jsSide()
const py = pySide()

// --- Compare ----------------------------------------------------------------

const problems = []

// 1. Same rules on both sides.
const onlyJs = js.rules.filter((r) => !py.rules.includes(r))
const onlyPy = py.rules.filter((r) => !js.rules.includes(r))
for (const r of onlyJs) {
  problems.push(`"${r}" exists in validation.js but not in backend/validation.py`)
}
for (const r of onlyPy) {
  problems.push(`"${r}" exists in backend/validation.py but not in validation.js`)
}

// 2. Every rule is covered by cases.
const shared = js.rules.filter((r) => py.rules.includes(r))
for (const r of shared) {
  if (!cases[r]) {
    problems.push(
      `"${r}" has no cases in shared/validation-cases.json — add pass and fail values so it is actually checked`,
    )
  }
}
for (const r of Object.keys(cases)) {
  if (!js.rules.includes(r) && !py.rules.includes(r)) {
    problems.push(`shared/validation-cases.json has cases for "${r}", which is not a rule`)
  }
}

// 3. Messages must match exactly — they are shown and spoken to the citizen.
for (const r of shared) {
  if (!js.data[r] || !py.data[r]) continue
  for (const lang of ['en', 'hi']) {
    if (js.data[r][lang] !== py.data[r][lang]) {
      problems.push(
        `"${r}" ${lang} message differs between the two files\n` +
          `        js: ${js.data[r][lang]}\n` +
          `        py: ${py.data[r][lang]}`,
      )
    }
  }
}

// 4. The two files must agree on every input — declared or derived.
let checked = 0
let variants = 0
const disagreed = new Set()
for (const [rule, spec] of Object.entries(cases)) {
  if (!js.data[rule] || !py.data[rule]) continue
  const inputs = inputsByRule[rule]
  const declared = declaredCount[rule]

  inputs.forEach((raw, i) => {
    const [jc, jv] = js.data[rule].results[i]
    const [pc, pv] = py.data[rule].results[i]
    if (i < declared) checked += 1
    else variants += 1
    if (jc === pc && jv === pv) return

    disagreed.add(`${rule}:${i}`)
    const origin = i < declared ? 'declared case' : `variant ${variantLabels[rule][i - declared]}`
    problems.push(
      `${rule}(${JSON.stringify(raw)}) the two files disagree — ${origin}\n` +
        `        js: ${JSON.stringify(jc)} ${jv ? 'accepted' : 'rejected'}\n` +
        `        py: ${JSON.stringify(pc)} ${pv ? 'accepted' : 'rejected'}`,
    )
  })

  // Declared cases additionally have to match what the contributor claimed.
  const expected = [
    ...(spec.pass ?? []).map(([raw, clean]) => ({ raw, clean, valid: true })),
    ...(spec.fail ?? []).map(([raw, clean]) => ({ raw, clean, valid: false })),
  ]
  expected.forEach((want, i) => {
    if (disagreed.has(`${rule}:${i}`)) return
    const [jc, jv] = js.data[rule].results[i]
    if (jc !== want.clean) {
      problems.push(
        `${rule}(${JSON.stringify(want.raw)}) should clean to ${JSON.stringify(want.clean)}, both files give ${JSON.stringify(jc)}`,
      )
    }
    if (jv !== want.valid) {
      problems.push(
        `${rule}(${JSON.stringify(want.raw)}) should be ${want.valid ? 'accepted' : 'rejected'}, both files ${jv ? 'accept' : 'reject'} it`,
      )
    }
  })
}

// 5. A rule whose values are one long alphanumeric run has to be readable
//    aloud, or the speech engine says it as a word. speakableValue has no
//    Python twin, so nothing above this line would ever notice.
const warnings = []
const jsSource = readFileSync(resolve(frontend, 'src/lib/validation.js'), 'utf8')
const spoken = new Set(
  [...jsSource.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]),
)
for (const rule of shared) {
  if (spoken.has(rule)) continue
  const passes = (cases[rule]?.pass ?? []).map(([, clean]) => clean)
  if (passes.length && passes.every((v) => /^[A-Za-z0-9]{5,}$/.test(v))) {
    warnings.push(
      `"${rule}" is not in the speakableValue switch in validation.js, and its ` +
        `values are one unbroken run of letters and digits.\n` +
        `        A citizen hears it read as a word. Add a case beside "pan" so it is spelled out.`,
    )
  }
}

// --- Report ------------------------------------------------------------------

console.log(`python:   ${python}`)
console.log(`rules:    ${shared.length} in both files`)
console.log(`cases:    ${checked} declared values through both implementations`)
console.log(`variants: ${variants} derived values, checked for agreement only`)
console.log()

for (const w of warnings) console.log(`  WARN ${w}`)
if (warnings.length) console.log()

if (problems.length) {
  for (const p of problems) console.log(`  FAIL ${p}`)
  console.log(`\n${problems.length} problem(s)`)
  process.exit(1)
}
console.log(`the two validators agree${warnings.length ? ` (${warnings.length} warning(s))` : ''}`)
