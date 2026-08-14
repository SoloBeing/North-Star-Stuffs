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
 *   node scripts/check-rule-parity.mjs
 *
 * Needs Python. Only a change to a validation rule needs this check; adding a
 * form or an interface string does not, which is why it is not in `npm run
 * check`. CI runs `npm run check:all`, which includes it.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const root = resolve(frontend, '..')

const { RULES } = await import('../src/lib/validation.js')
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

/** Every input mentioned anywhere, per rule. */
const inputsByRule = {}
for (const [rule, spec] of Object.entries(cases)) {
  inputsByRule[rule] = [
    ...(spec.pass ?? []).map(([raw]) => raw),
    ...(spec.fail ?? []).map(([raw]) => raw),
  ]
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
        const trimmed = (raw ?? '').trim()
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
from backend.validation import RULES

inputs = json.load(open(${JSON.stringify(inFile)}))
out = {}
for rule, raws in inputs.items():
    r = RULES.get(rule)
    if r is None:
        continue
    results = []
    for raw in raws:
        trimmed = (raw or "").strip()
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

// 4. Same cleaned value, same verdict, and the verdict the cases demand.
let checked = 0
for (const [rule, spec] of Object.entries(cases)) {
  if (!js.data[rule] || !py.data[rule]) continue
  const expected = [
    ...(spec.pass ?? []).map(([raw, clean]) => ({ raw, clean, valid: true })),
    ...(spec.fail ?? []).map(([raw, clean]) => ({ raw, clean, valid: false })),
  ]
  expected.forEach((want, i) => {
    const [jc, jv] = js.data[rule].results[i]
    const [pc, pv] = py.data[rule].results[i]
    checked += 1

    if (jc !== pc || jv !== pv) {
      problems.push(
        `${rule}(${JSON.stringify(want.raw)}) the two files disagree\n` +
          `        js: ${JSON.stringify(jc)} ${jv ? 'accepted' : 'rejected'}\n` +
          `        py: ${JSON.stringify(pc)} ${pv ? 'accepted' : 'rejected'}`,
      )
      return
    }
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

// --- Report ------------------------------------------------------------------

console.log(`python: ${python}`)
console.log(`rules:  ${shared.length} in both files`)
console.log(`cases:  ${checked} values through both implementations`)
console.log()

if (problems.length) {
  for (const p of problems) console.log(`  FAIL ${p}`)
  console.log(`\n${problems.length} problem(s)`)
  process.exit(1)
}
console.log('the two validators agree')
