/**
 * Prove the design-system check actually rejects things.
 *
 * `check-ui.mjs` passing on the current screens says nothing on its own — a
 * check that never fires looks identical to a clean codebase. Each case here is
 * a mistake an assistant working from `change-the-look.md` can plausibly make,
 * written to a throwaway file rather than a real screen.
 *
 *   node scripts/check-ui.test.mjs
 *
 * Add a case whenever a UI contribution slips something past the checker.
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const checker = join(here, 'check-ui.mjs')

/** A screen that stays inside the design system. Must always pass. */
const CLEAN = `
export default function Fixture({ lang }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-lg font-semibold text-ink-soft">{t('listen', lang)}</p>
      <button className="min-h-16 w-full rounded-xl bg-brand-600 text-xl text-white">
        {t('next', lang)}
      </button>
    </div>
  )
}
`

const CASES = [
  ['stock Tailwind background', '<div className="bg-blue-600" />', 'off-palette'],
  ['stock Tailwind text colour', '<p className="text-gray-500" />', 'off-palette'],
  ['stock Tailwind border', '<div className="border-slate-300" />', 'off-palette'],
  ['hardcoded hex in a style prop', '<div style={{ color: "#3366ff" }} />', 'hardcoded colour'],
  ['arbitrary spacing value', '<div className="p-[13px]" />', 'arbitrary value'],
  ['arbitrary colour value', '<div className="bg-[#abcdef]" />', 'arbitrary value'],
  ['text below the readable floor', '<span className="text-xs" />', 'below the 18px floor'],
]

/** Legal, but small enough that a human should confirm it is deliberate. */
const WARN_CASES = [
  ['tap target under 44px', '<button className="min-h-8" />', 'tap-target floor'],
]

const dir = mkdtempSync(join(tmpdir(), 'formmitra-ui-'))
let failures = 0

function run(body, name) {
  const path = join(dir, `${name}.jsx`)
  writeFileSync(path, `export default function F() {\n  return (\n    ${body}\n  )\n}\n`)
  try {
    return { code: 0, out: execFileSync('node', [checker, path], { encoding: 'utf8' }) }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

console.log('a clean screen must pass')
{
  const path = join(dir, 'clean.jsx')
  writeFileSync(path, CLEAN)
  let code = 0
  let out = ''
  try {
    out = execFileSync('node', [checker, path], { encoding: 'utf8' })
  } catch (e) {
    code = e.status ?? 1
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  const ok = code === 0
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} tokens, type scale and tap targets all in range`)
  if (!ok) {
    failures += 1
    console.log(out.replace(/^/gm, '        '))
  }
}

console.log('\noff-system markup must be rejected')
for (const [name, body, expect] of CASES) {
  const { code, out } = run(body, name.replace(/\W+/g, '-'))
  const ok = code !== 0 && out.includes(expect)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name}` +
      (ok ? '' : code !== 0 ? `  — rejected, but no message matching "${expect}"` : '  — NOT REJECTED'),
  )
  if (!ok) console.log(out.replace(/^/gm, '        '))
}

console.log('\nsmall-but-legal markup must warn, not fail')
for (const [name, body, expect] of WARN_CASES) {
  const { code, out } = run(body, name.replace(/\W+/g, '-'))
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
