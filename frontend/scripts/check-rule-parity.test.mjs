/**
 * Prove that check-rule-parity.mjs actually catches things.
 *
 * It was the only checker in this repo without a self-test, which is the worst
 * one to leave unproven: it is the guard on a rule table that exists twice, and
 * a validator that only ever prints "ok" buys confidence without earning it.
 *
 * Each case copies the three real files into a temporary repository, breaks
 * exactly one thing, runs the checker against that tree, and asserts the
 * failure is reported. The last case leaves the copy untouched and asserts it
 * passes, so a checker that failed everything could not pass this file either.
 *
 *   node scripts/check-rule-parity.test.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const realRoot = resolve(here, '../..')
const checker = resolve(here, 'check-rule-parity.mjs')

/** A throwaway repository holding just what the checker reads. */
function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'formmitra-parity-test-'))
  mkdirSync(join(dir, 'frontend/src/lib'), { recursive: true })
  mkdirSync(join(dir, 'backend'), { recursive: true })
  mkdirSync(join(dir, 'shared'), { recursive: true })
  cpSync(join(realRoot, 'frontend/src/lib/validation.js'), join(dir, 'frontend/src/lib/validation.js'))
  cpSync(join(realRoot, 'backend/validation.py'), join(dir, 'backend/validation.py'))
  cpSync(join(realRoot, 'shared/validation-cases.json'), join(dir, 'shared/validation-cases.json'))
  return dir
}

const paths = {
  js: (d) => join(d, 'frontend/src/lib/validation.js'),
  py: (d) => join(d, 'backend/validation.py'),
  cases: (d) => join(d, 'shared/validation-cases.json'),
}

function edit(file, from, to) {
  const before = readFileSync(file, 'utf8')
  if (!before.includes(from)) throw new Error(`fixture no longer contains: ${from}`)
  writeFileSync(file, before.replace(from, to))
}

function runChecker(dir) {
  try {
    const stdout = execFileSync('node', [checker, dir], { encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out: stdout }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

// [name, what to break, what the report must mention]
const cases = [
  [
    'a rule only JavaScript has',
    (d) => edit(paths.py(d), '    "pincode": _regex_rule(\n        r"^[1-9][0-9]{5}$",', '    "pincode_removed": _regex_rule(\n        r"^[1-9][0-9]{5}$",'),
    'exists in validation.js but not',
  ],
  [
    'a rule only Python has',
    (d) => edit(paths.js(d), '  pincode: {', '  pincode_renamed: {'),
    'exists in backend/validation.py but not',
  ],
  [
    'a rule with no cases',
    (d) => {
      const c = JSON.parse(readFileSync(paths.cases(d), 'utf8'))
      delete c.pincode
      writeFileSync(paths.cases(d), JSON.stringify(c, null, 2))
    },
    'has no cases in shared/validation-cases.json',
  ],
  [
    'cases for a rule that does not exist',
    (d) => {
      const c = JSON.parse(readFileSync(paths.cases(d), 'utf8'))
      c.not_a_rule = { pass: [['x', 'x']], fail: [] }
      writeFileSync(paths.cases(d), JSON.stringify(c, null, 2))
    },
    'which is not a rule',
  ],
  [
    'the English messages drifting apart',
    (d) => edit(paths.py(d), '"PIN code must be 6 digits and cannot start with 0.",', '"PIN code must be six digits and cannot start with 0.",'),
    'en message differs between the two files',
  ],
  [
    'the Hindi messages drifting apart',
    (d) => edit(paths.py(d), '"पिन कोड 6 अंकों का होता है और 0 से शुरू नहीं होता।",', '"पिन कोड ६ अंकों का होता है और 0 से शुरू नहीं होता।",'),
    'hi message differs between the two files',
  ],
  [
    'a declared cleaned value that is wrong',
    (d) => edit(paths.cases(d), '["३०२०१७", "302017"]', '["३०२०१७", "३०२०१७"]'),
    'should clean to',
  ],
  [
    'a declared verdict that is wrong',
    (d) => edit(paths.cases(d), '["012345", "012345"],', '["302015", "302015"],'),
    'should be rejected',
  ],
  [
    // Not pincode: its leading [1-9] is ASCII-only, so Python rejects a Bengali
    // digit string on the first character and the two files agree by accident.
    // bank_account is bare \d, which is where the real bug lived.
    'the two files disagreeing on a value nobody wrote a case for',
    (d) => edit(paths.py(d), 'r"^[0-9]{9,18}$"', 'r"^\\d{9,18}$"'),
    'variant digits:',
  ],
  [
    'Python losing the whitespace character only JavaScript strips',
    (d) => edit(paths.py(d), '_WS = r"\\s\\ufeff"', '_WS = r"\\s"'),
    'variant bom:',
  ],
  [
    'JavaScript losing the whitespace characters only Python strips',
    (d) => edit(paths.js(d), "const WS = '\\\\s\\\\u001c-\\\\u001f\\\\u0085'", "const WS = '\\\\s'"),
    'variant fileSep:',
  ],
]

let failures = 0
let passes = 0

console.log('breaking one thing at a time — each must be caught\n')
for (const [name, breakIt, expected] of cases) {
  const dir = makeFixture()
  try {
    breakIt(dir)
    const { code, out } = runChecker(dir)
    if (code !== 0 && out.includes(expected)) {
      console.log(`  ok   ${name}`)
      passes += 1
    } else {
      console.log(`  MISS ${name}`)
      console.log(`       expected a failure mentioning ${JSON.stringify(expected)}, got exit ${code}`)
      console.log(
        out
          .trim()
          .split('\n')
          .map((l) => `       | ${l}`)
          .join('\n'),
      )
      failures += 1
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// A rule shaped like an identifier that nothing reads aloud is a warning, not a
// failure — the citizen hears it as a word, but plenty of rules legitimately
// read as-is, so this cannot be allowed to block a merge.
console.log('\nspoken-value coverage warns without failing')
{
  const dir = makeFixture()
  try {
    edit(
      paths.js(dir),
      '  text: {',
      `  scheme_code: {
    test: (v) => /^[A-Z]{3}[0-9]{4}$/.test(v),
    normalise: (v) => stripSpaces(v).toUpperCase(),
    en: 'Scheme code must be 3 letters then 4 digits.',
    hi: 'योजना कोड में 3 अक्षर फिर 4 अंक होते हैं।',
  },
  text: {`,
    )
    edit(
      paths.py(dir),
      '    "text": _regex_rule(',
      `    "scheme_code": _regex_rule(
        r"^[A-Z]{3}[0-9]{4}$",
        "Scheme code must be 3 letters then 4 digits.",
        "योजना कोड में 3 अक्षर फिर 4 अंक होते हैं।",
        normalise=lambda v: _upper(_strip_spaces(v)),
    ),
    "text": _regex_rule(`,
    )
    const c = JSON.parse(readFileSync(paths.cases(dir), 'utf8'))
    c.scheme_code = { pass: [['ABC1234', 'ABC1234']], fail: [['ABC123', 'ABC123']] }
    writeFileSync(paths.cases(dir), JSON.stringify(c, null, 2))

    const { code, out } = runChecker(dir)
    if (code === 0 && out.includes('speakableValue') && out.includes('scheme_code')) {
      console.log('  ok   an unspoken identifier rule warns')
      passes += 1
    } else {
      console.log(`  MISS an unspoken identifier rule warns — exit ${code}`)
      console.log(out.trim().split('\n').map((l) => `       | ${l}`).join('\n'))
      failures += 1
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// The control: an untouched copy has to pass, or every case above is meaningless.
console.log('\nan untouched copy of the real files must pass')
{
  const dir = makeFixture()
  try {
    const { code, out } = runChecker(dir)
    if (code === 0 && out.includes('the two validators agree')) {
      console.log('  ok   unmodified fixture passes')
      passes += 1
    } else {
      console.log(`  MISS unmodified fixture passes — exit ${code}`)
      console.log(out.trim().split('\n').map((l) => `       | ${l}`).join('\n'))
      failures += 1
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log()
if (failures) {
  console.log(`${failures} of ${passes + failures} checks did not behave as expected`)
  process.exit(1)
}
console.log(`all ${passes} checks passed`)
