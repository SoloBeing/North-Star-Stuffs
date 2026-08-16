/**
 * Prove the strings checker actually rejects things.
 *
 * `check-text.mjs` printing "ok" on a healthy file says nothing on its own. This
 * takes the live `i18n.js`, breaks it one way at a time, and asserts the checker
 * notices — and that the untouched file still passes, so it is not simply
 * failing everything.
 *
 *   node scripts/check-text.test.mjs
 *
 * Every case is a mistake a model can plausibly make when writing strings from
 * `add-text.md`. Add one whenever a text contribution slips something past.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const checker = join(here, 'check-text.mjs')
const realFile = resolve(frontend, 'src/lib/i18n.js')
const BASE = readFileSync(realFile, 'utf8')

/** The line every structural case rewrites. */
const NEXT = "  next: { en: 'Next', hi: 'आगे' },"

/** Each case breaks one thing, and names the text the checker must produce. */
const CASES = [
  ['a repeated key', (s) => s.replace(NEXT, `${NEXT}\n  next: { en: 'Onward', hi: 'आगे' },`), 'duplicate key'],
  ['no Hindi at all', (s) => s.replace(NEXT, "  next: { en: 'Next' },"), 'has no hi'],
  ['no English at all', (s) => s.replace(NEXT, "  next: { hi: 'आगे' },"), 'has no en'],
  ['Hindi that is only spaces', (s) => s.replace(NEXT, "  next: { en: 'Next', hi: '   ' },"), 'is empty'],
  ['English wearing a hi label', (s) => s.replace(NEXT, "  next: { en: 'Next', hi: 'Aage' },"), 'no Devanagari'],
  ['transliteration instead of Hindi', (s) => s.replace(NEXT, "  next: { en: 'Next', hi: 'Agey badhein' },"), 'no Devanagari'],
  ['a misspelt language label', (s) => s.replace(NEXT, "  next: { en: 'Next', hn: 'आगे' },"), 'unknown language'],
  ['a stray space around a value', (s) => s.replace(NEXT, "  next: { en: 'Next ', hi: 'आगे' },"), 'trailing whitespace'],
  ['a bare string instead of an entry', (s) => s.replace(NEXT, "  next: 'Next',"), 'must be an object'],
  ['a value that is not a string', (s) => s.replace(NEXT, "  next: { en: 42, hi: 'आगे' },"), 'must be a string'],
  ['a snake_case key', (s) => s.replace(NEXT, "  next_step: { en: 'Next', hi: 'आगे' },"), 'not camelCase'],
  ['a quoted key', (s) => s.replace(NEXT, "  'next': { en: 'Next', hi: 'आगे' },"), 'not written as plain'],
  ['a file that does not parse', (s) => s.replace('export const STRINGS = {', 'export const STRINGS = {{'), 'does not parse'],
  ['some other file entirely', (s) => s.replaceAll('STRINGS', 'TEXTS'), 'no `STRINGS` object found'],
]

/** A whole strings file, small enough that the usage report stays readable. */
const SMALL = `export const STRINGS = {
  next: { en: 'Next', hi: 'आगे' },
  back: { en: 'Back', hi: 'पीछे' },
}

export function t(key, lang = 'hi') {
  const entry = STRINGS[key]
  if (!entry) return key
  return entry[lang] ?? entry.en
}
`

const SCREEN = `export default function F({ lang }) {
  return <button>{t('next', lang)}{t('back', lang)}</button>
}
`

/** Cases that need screens to check the strings against. */
const USE_CASES = [
  [
    'a key a screen asks for but nobody wrote',
    SMALL,
    SCREEN.replace("t('back', lang)", "t('bcak', lang)"),
    'has no such string',
    'fail',
  ],
  ['a string no screen ever shows', SMALL, SCREEN.replace("{t('back', lang)}", ''), 'never used by any screen', 'warn'],
  [
    'two keys saying the same thing',
    SMALL.replace("  back: { en: 'Back', hi: 'पीछे' },", "  back: { en: 'Back', hi: 'पीछे' },\n  goBack: { en: 'back', hi: 'वापस' },"),
    SCREEN.replace("t('back', lang)", "t('back', lang)}{t('goBack', lang)"),
    'say the same thing in English',
    'warn',
  ],
]

const dir = mkdtempSync(join(tmpdir(), 'formmitra-text-'))
let failures = 0

function run(strings, screen, name) {
  const box = mkdtempSync(join(dir, `${name}-`))
  const file = join(box, 'i18n.js')
  writeFileSync(file, strings)
  const args = [checker, file]
  if (screen !== null) {
    writeFileSync(join(box, 'screen.jsx'), screen)
    args.push(box)
  }
  try {
    return { code: 0, out: execFileSync('node', args, { encoding: 'utf8' }) }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

console.log('the real strings file must pass')
{
  const { code, out } = run(BASE, null, 'clean')
  const ok = code === 0
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} every key in both languages`)
  if (!ok) {
    failures += 1
    console.log(out.replace(/^/gm, '        '))
  }
}

console.log('\nbroken strings must be rejected')
for (const [name, mutate, expect] of CASES) {
  const strings = mutate(BASE)
  if (strings === BASE) {
    failures += 1
    console.log(`  FAIL ${name}  — the case changed nothing, so it proves nothing`)
    continue
  }
  const { code, out } = run(strings, null, name.replace(/\W+/g, '-'))
  const ok = code !== 0 && out.includes(expect)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name}` +
      (ok ? '' : code !== 0 ? `  — rejected, but no message matching "${expect}"` : '  — NOT REJECTED'),
  )
  if (!ok) console.log(out.replace(/^/gm, '        '))
}

console.log('\nstrings must be checked against the screens that use them')
for (const [name, strings, screen, expect, severity] of USE_CASES) {
  const { code, out } = run(strings, screen, name.replace(/\W+/g, '-'))
  const wanted = severity === 'fail' ? code !== 0 : code === 0
  const ok = wanted && out.includes(expect)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name}` +
      (ok ? '' : `  — expected a ${severity} matching "${expect}"`),
  )
  if (!ok) console.log(out.replace(/^/gm, '        '))
}

rmSync(dir, { recursive: true, force: true })

const total = CASES.length + USE_CASES.length + 1
console.log()
if (failures) {
  console.log(`${failures} of ${total} checks failed`)
  process.exit(1)
}
console.log(`all ${total} checks passed`)
