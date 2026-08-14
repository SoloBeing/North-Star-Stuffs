/**
 * Prove the contribution checker actually rejects things.
 *
 * A validator that only ever prints "ok" is worse than none: it buys confidence
 * without earning it. This takes the live RTI template, breaks it one way at a
 * time, and asserts the checker notices — and that an untouched template still
 * passes, so it is not simply failing everything.
 *
 *   node scripts/check-contribution.test.mjs
 *
 * Every case here is a mistake a model can plausibly make when writing a
 * template from the contributor packs. Add one whenever you find a new one.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const checker = join(here, 'check-contribution.mjs')
const base = JSON.parse(
  readFileSync(resolve(frontend, 'src/data/forms/rti-application.json'), 'utf8'),
)

/** Each case breaks one thing, and names the text the checker must produce. */
const CASES = [
  ['unknown rule name', (d) => { d.fields[3].rule = 'vehicle' }, 'unknown rule'],
  ['missing Hindi explanation', (d) => { delete d.fields[3].explain.hi }, 'missing hi'],
  ['blank Hindi question', (d) => { d.fields[3].question.hi = '   ' }, 'missing hi'],
  ['showIf naming a field that does not exist', (d) => { d.fields[5].showIf = { nope: 'Yes' } }, 'not a field in this form'],
  ['showIf naming a later field', (d) => { d.fields[1].showIf = { bpl_status: 'Yes' } }, 'defined later'],
  ['showIf on an impossible option', (d) => { d.fields[7].showIf = { bpl_status: 'Maybe' } }, 'could never be shown'],
  ['duplicate field id', (d) => { d.fields[4].id = 'address' }, 'duplicate field id'],
  ['digilocker field with no profileKey', (d) => { delete d.fields[0].profileKey }, 'no profileKey'],
  ['invented profileKey', (d) => { d.fields[0].profileKey = 'fathersName' }, 'unknown profileKey'],
  ['choice with no options', (d) => { delete d.fields[6].options }, 'at least two options'],
  ['options on a non-choice field', (d) => { d.fields[3].options = [{ value: 'x', en: 'x', hi: 'x' }] }, 'only "choice" uses options'],
  ['uppercase ocrKeyword', (d) => { d.ocrKeywords[0] = 'Right To Information' }, 'must be lowercase'],
  ['camelCase field id', (d) => { d.fields[3].id = 'publicAuthority' }, 'snake_case'],
  ['no ocrKeywords at all', (d) => { d.ocrKeywords = [] }, 'non-empty array'],
  ['profileKey on an asked field', (d) => { d.fields[3].profileKey = 'name' }, 'will never be used'],
  ['missing top-level summary', (d) => { delete d.summary }, 'missing top-level "summary"'],
  ['field missing its label', (d) => { delete d.fields[2].label }, 'is missing "label"'],
  ['duplicate option values', (d) => { d.fields[6].options[1].value = 'No' }, 'duplicate value'],
  // Runs after clone() has assigned a fresh id, so this deliberately collides.
  ['an id another form already uses', (d) => { d.id = 'pan-93' }, 'already used by another form'],
]

/** Legal, but a human should look. All three came out of a real contribution. */
const WARN_CASES = [
  ['example that fails its own rule', (d) => { d.fields[2].example = '99' }, 'does not pass its own'],
  ['invented Aadhaar failing the checksum', (d) => {
    d.fields.push({
      id: 'mother_aadhaar',
      label: { en: "Mother's Aadhaar", hi: 'माता का आधार' },
      rule: 'aadhaar',
      source: 'ask',
      question: { en: "Mother's Aadhaar?", hi: 'माता का आधार?' },
      explain: { en: 'Twelve digits.', hi: 'बारह अंक।' },
      example: '3456 7890 1234',
    })
  }, 'does not pass its own'],
  ['two fields sharing one profileKey', (d) => {
    d.fields.push({
      id: 'informant_address',
      label: { en: "Informant's address", hi: 'सूचक का पता' },
      rule: 'text',
      source: 'digilocker',
      profileKey: 'address',
      question: { en: "Informant's address?", hi: 'सूचक का पता?' },
      explain: { en: 'Where they live.', hi: 'वे कहाँ रहते हैं।' },
    })
  }, 'both get the same value'],
  ['a form with too many spoken questions', (d) => {
    for (let i = 0; i < 25; i += 1) {
      d.fields.push({
        id: `extra_${i}`,
        label: { en: `Extra ${i}`, hi: `अतिरिक्त ${i}` },
        rule: 'text',
        source: 'ask',
        question: { en: `Extra ${i}?`, hi: `अतिरिक्त ${i}?` },
        explain: { en: 'Padding.', hi: 'भराव।' },
      })
    }
  }, 'questions will be asked aloud'],
]

const dir = mkdtempSync(join(tmpdir(), 'formmitra-contrib-'))
let failures = 0

/** Run the checker on a template written to disk; never throws on exit code. */
function run(data, name) {
  const path = join(dir, `${name}.json`)
  writeFileSync(path, JSON.stringify(data, null, 2))
  try {
    return { code: 0, out: execFileSync('node', [checker, path], { encoding: 'utf8' }) }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

function clone(mutate) {
  const d = JSON.parse(JSON.stringify(base))
  // Give it a fresh id so "already used by another form" is not what trips.
  d.id = 'contribution-under-test'
  mutate(d)
  return d
}

console.log('a clean template must still pass')
{
  const { code, out } = run(clone(() => {}), 'clean')
  const ok = code === 0 && /all 1 template\(s\) valid/.test(out)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} untouched RTI template passes`)
  if (!ok) {
    failures += 1
    console.log(out.replace(/^/gm, '        '))
  }
}

console.log('\nbroken templates must be rejected')
for (const [name, mutate, expect] of CASES) {
  const { code, out } = run(clone(mutate), name.replace(/\W+/g, '-'))
  const rejected = code !== 0
  const explained = out.includes(expect)
  const ok = rejected && explained
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name}` +
      (ok ? '' : rejected ? `  — rejected, but no message matching "${expect}"` : '  — NOT REJECTED'),
  )
  if (!ok) console.log(out.replace(/^/gm, '        '))
}

console.log('\nsuspect-but-legal templates must warn, not fail')
for (const [name, mutate, expect] of WARN_CASES) {
  const { code, out } = run(clone(mutate), name.replace(/\W+/g, '-'))
  const ok = code === 0 && out.includes(expect)
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) console.log(out.replace(/^/gm, '        '))
}

rmSync(dir, { recursive: true, force: true })

const total = CASES.length + WARN_CASES.length + 1
console.log()
if (failures) {
  console.log(`${failures} of ${total} checks failed`)
  process.exit(1)
}
console.log(`all ${total} checks passed`)
