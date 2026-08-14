/**
 * Keep screens inside the design system.
 *
 * FormMitra's palette and type scale are defined in src/index.css and tuned for
 * one audience: elderly, often low-literacy citizens on cheap phones in bright
 * sunlight. An assistant that has not been told this reaches for Tailwind's
 * defaults — `bg-blue-600`, `text-gray-500`, `text-sm` — and every one of those
 * quietly lowers contrast or shrinks text below the floor.
 *
 * This is what a UI contribution can be checked for. It cannot tell whether a
 * layout is good; it can tell whether it stayed inside the system.
 *
 *   node scripts/check-ui.mjs              check src/
 *   node scripts/check-ui.mjs some/dir     check somewhere else
 *
 * The second form exists so check-ui.test.mjs can point this at throwaway
 * fixtures instead of editing real screens to see whether the check bites.
 *
 * Errors fail the build. Warnings are for judgement calls a human should see.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const target = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(frontend, 'src')
const srcDir = statSync(target).isDirectory() ? target : dirname(target)
const singleFile = statSync(target).isFile() ? target : null

/**
 * Tailwind's stock palette. Every one of these exists and renders, which is
 * exactly the problem — nothing fails, the screen just drifts off-palette.
 */
const STOCK_COLOURS = [
  'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo',
  'violet', 'purple', 'fuchsia', 'pink', 'rose',
]

/** Text sizes below the 18px floor. `text-sm` is allowed for supporting labels. */
const TOO_SMALL = ['text-xs', 'text-\\[10px\\]', 'text-\\[11px\\]', 'text-\\[12px\\]']

// The palette is always the real one — fixtures are checked against the
// project's actual tokens, not a copy that could drift.
const themeCss = readFileSync(resolve(frontend, 'src/index.css'), 'utf8')
const themeBlock = themeCss.match(/@theme\s*{([\s\S]*?)\n}/)?.[1] ?? ''
const definedColours = [...themeBlock.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1])

function jsxFiles() {
  if (singleFile) return [singleFile]
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsx')) out.push(full)
    }
  }
  walk(srcDir)
  return out.sort()
}

const errors = []
const warnings = []

for (const file of jsxFiles()) {
  const rel = relative(frontend, file)
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`

    // Off-palette colour utilities.
    const stock = new RegExp(
      `\\b(?:bg|text|border(?:-[trblxyse])?|from|via|to|ring|outline|fill|stroke|divide|placeholder|accent|caret|decoration|shadow)-(${STOCK_COLOURS.join('|')})-\\d{2,3}\\b`,
      'g',
    )
    for (const m of line.matchAll(stock)) {
      errors.push(
        `${at}  "${m[0]}" is off-palette. Use a project token: ${definedColours.join(', ')}`,
      )
    }

    // A raw hex colour in JSX bypasses the theme entirely.
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      // SVG path data and url fragments are not colours.
      if (/(?:href|xlinkHref|d)=/.test(line)) continue
      errors.push(`${at}  hardcoded colour "${m[0]}" — add a token to index.css instead`)
    }

    // Arbitrary values sidestep the scale that keeps tap targets big enough.
    for (const m of line.matchAll(/\b[a-z-]+-\[[^\]]+\]/g)) {
      if (/^(?:grid-cols|grid-rows|aspect)-/.test(m[0])) continue
      errors.push(`${at}  arbitrary value "${m[0]}" — use the scale in index.css`)
    }

    // Text below the readable floor.
    for (const pattern of TOO_SMALL) {
      if (new RegExp(`\\b${pattern}\\b`).test(line)) {
        errors.push(
          `${at}  text size below the 18px floor — the smallest allowed is text-sm, and only for supporting labels`,
        )
      }
    }

    // Interactive elements that may be too small to hit reliably.
    const minH = line.match(/\bmin-h-(\d+)\b/)
    if (minH && Number(minH[1]) < 11) {
      warnings.push(`${at}  min-h-${minH[1]} is under the 44px tap-target floor`)
    }
  })
}

console.log(`palette: ${definedColours.length} tokens defined in src/index.css`)
console.log(`checked: ${jsxFiles().length} .jsx files`)
console.log()

for (const w of warnings) console.log(`  warn ${w}`)
for (const e of errors) console.log(`  FAIL ${e}`)

if (errors.length) {
  console.log(`\n${errors.length} problem(s), ${warnings.length} warning(s)`)
  process.exit(1)
}
console.log(`inside the design system, ${warnings.length} warning(s)`)
