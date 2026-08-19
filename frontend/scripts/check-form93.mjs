/**
 * Stamp Form 93 with a full set of answers and report what landed where.
 *
 * The point of this script is the thing a unit test cannot tell you: a
 * coordinate can be perfectly valid and still be the wrong box. It writes a
 * real PDF you can open, and prints the slot inventory so an unfilled box is
 * visible as a line of text rather than something you have to notice by eye.
 *
 *   node scripts/check-form93.mjs [outfile.pdf]
 *
 * Run it after touching form93-boxes.json or official/form93.js, then look at the
 * PDF. Step 7 of the build log explains why looking is not optional here.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// `official/form93.js` does a plain `import boxes from '...json'`, which the bundler
// accepts and Node rejects without `with { type: 'json' }`. Supplying the
// attribute here lets this script exercise the real module rather than a
// near-copy that drifts away from it.
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context)
    return result.url.endsWith('.json')
      ? { ...result, importAttributes: { type: 'json' } }
      : result
  },
})

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// officialPdf.js reaches for import.meta.env.BASE_URL and fetch(); give it both
// so the module under test runs unmodified rather than in a copy that drifts.
globalThis.fetch = async (url) => {
  const path = resolve(root, 'public', String(url).replace(/^\//, ''))
  const bytes = readFileSync(path)
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
}

const { buildOfficialPdf } = await import('../src/lib/officialPdf.js')
const boxes = JSON.parse(readFileSync(resolve(root, 'src/data/official/form93-boxes.json')))
const form = JSON.parse(readFileSync(resolve(root, 'src/data/forms/pan-93.json')))

/** The everyday case: two parents, every optional question answered. */
const complete = {
  full_name: 'Sunita Devi Sharma',
  dob: '14/08/1961',
  gender: 'Female',
  aadhaar: '234567890124',
  address: 'House No. 42, Ward 7, Gandhi Nagar, Jaipur, Rajasthan',
  post_office: 'Gandhi Nagar',
  pincode: '302015',
  residential_status: 'Resident',
  mobile: '9876543210',
  email: 'sunita.devi@example.com',
  source_of_income: 'Agriculture',
  single_parent: 'No',
  father_name: 'Ram Prasad Sharma',
  mother_name: 'Kamla Devi',
  print_parent: 'Mother',
}

/**
 * The branch that is easy to get wrong: a single parent, so items 14 and 15
 * were never asked, and both optional questions were skipped. Nothing here may
 * end up half-written — a blank mother's row with "Mother" ticked at item 15
 * would produce a card with no parent name on it.
 */
const singleParentSkipped = {
  ...complete,
  post_office: '',
  email: '',
  single_parent: 'Yes',
  mother_name: undefined,
  print_parent: undefined,
}

// Every field the template can produce must be exercised, or this script
// quietly stops covering the thing it was written to cover.
const missing = form.fields.map((f) => f.id).filter((id) => !(id in complete))
if (missing.length) {
  console.error(`FAIL: template fields not covered by this script: ${missing.join(', ')}`)
  process.exitCode = 1
}

// Every slot in the geometry is either written by official/form93.js or listed
// here as knowingly unused. This is the check that would have caught the four
// slots (post office, email, mother's name, residential status) that sat
// extracted but unwritten for two sessions without anything complaining.
const UNUSED = {
  'office.': 'item 6 — only for a card posted to a workplace',
  'passport': 'item 8 — non-residents only',
  'tin': 'item 9 — non-residents only',
  'landline': 'item 10(iii) — "if any"',
  'ao.': 'item 16 — the PAN centre looks this up from the address',
  'ra.': 'items 17-21, 24 — not applicable when applying for yourself',
  'comm.ra': 'item 22 — no representative assessee',
  'comm.office': 'item 22 — no office address collected',
}
const source = readFileSync(resolve(root, 'src/lib/official/form93.js'), 'utf8')
const orphans = Object.keys(boxes.slots).filter((name) => {
  // Numbered rows are written in a loop, as `aadhaarName.${i}`.
  const looped = name.replace(/\.\d+$/, '.${')
  return (
    !source.includes(`'${name}'`) &&
    !source.includes(looped) &&
    !Object.keys(UNUSED).some((prefix) => name.startsWith(prefix))
  )
})
if (orphans.length) {
  console.error(`FAIL: slots neither written nor declared unused: ${orphans.join(', ')}`)
  process.exitCode = 1
}

for (const [name, answers] of [
  ['complete', complete],
  ['single-parent-skipped', singleParentSkipped],
]) {
  const { blob, notes } = await buildOfficialPdf('form93', answers)
  const out = resolve(here, `form93-${name}.pdf`)
  writeFileSync(out, Buffer.from(await blob.arrayBuffer()))

  console.log(`\n=== ${name} → ${out}`)
  for (const [kind, heading] of [
    ['assumed', 'Assumed — the citizen is asked to check'],
    ['truncated', 'Did not fit'],
    ['blank', 'Left blank on purpose'],
  ]) {
    const group = notes.filter((n) => n.kind === kind)
    if (!group.length) continue
    console.log(`  ${heading}:`)
    for (const n of group) console.log(`    - ${n.label.en}`)
  }
}

console.log(
  `\n${Object.keys(boxes.slots).length} slots in the geometry, ` +
    `${Object.keys(boxes.slots).length - orphans.length} accounted for`,
)
