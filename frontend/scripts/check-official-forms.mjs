/**
 * Stamp every official form with a full set of answers and report what landed.
 *
 * The point of this script is the thing a unit test cannot tell you: a
 * coordinate can be perfectly valid and still be the wrong box. It writes real
 * PDFs you can open, and prints each form's slot inventory so an unfilled box
 * is visible as a line of text rather than something you have to notice by eye.
 *
 *   node scripts/check-official-forms.mjs [formId ...]
 *
 * Run it after touching a *-boxes.json or anything under src/lib/official,
 * then look at the PDFs. Step 7 of the build log explains why looking is not
 * optional here.
 *
 * It discovers forms rather than listing them: every module under
 * `src/lib/official` except the shared stamper is a form, and its `id` is
 * matched against the templates' `officialForm`. A new form is picked up as
 * soon as it has answers below.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// The form modules do a plain `import boxes from '...json'`, which the bundler
// accepts and Node rejects without `with { type: 'json' }`. Supplying the
// attribute here lets this script exercise the real modules rather than
// near-copies that drift away from them.
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
// so the modules under test run unmodified rather than in copies that drift.
globalThis.fetch = async (url) => {
  const path = resolve(root, 'public', String(url).replace(/^\//, ''))
  const bytes = readFileSync(path)
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

const { buildOfficialPdf } = await import('../src/lib/officialPdf.js')

/**
 * Answers per form, and the slots each form knowingly leaves alone.
 *
 * `unused` is judgement and has to be written down: without it the orphan check
 * cannot tell a box nobody filled from a box nobody was meant to fill. Every
 * entry says which item on the paper form it is, so the claim can be checked.
 */
const FIXTURES = {
  form93: {
    unused: {
      'office.': 'item 6 — only for a card posted to a workplace',
      passport: 'item 8 — non-residents only',
      tin: 'item 9 — non-residents only',
      landline: 'item 10(iii) — "if any"',
      'ao.': 'item 16 — the PAN centre looks this up from the address',
      'ra.': 'items 17-21, 24 — not applicable when applying for yourself',
      'comm.ra': 'item 22 — no representative assessee',
      'comm.office': 'item 22 — no office address collected',
    },
    cases: {
      /** The everyday case: two parents, every optional question answered. */
      complete: {
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
      },
      /**
       * The branch that is easy to get wrong: a single parent, so items 14 and
       * 15 were never asked, and both optional questions were skipped. Nothing
       * here may end up half-written — a blank mother's row with "Mother"
       * ticked at item 15 would produce a card with no parent name on it.
       */
      'single-parent-skipped': {
        post_office: '',
        email: '',
        single_parent: 'Yes',
        mother_name: undefined,
        print_parent: undefined,
      },
    },
  },

  'ujjwala-kyc': {
    unused: {
      'household.': 'section c — six members, asked on paper, see the note',
      contactMobile: 'section b — the second Mobile No., boxes do not match the label',
      // The address rows below have no answer to draw from: FormMitra holds one
      // address string, and this form wants eleven separately labelled rows.
      // The citizen is told which were left empty by the addressSplit note.
      'address.city': 'section b.5 — one address string cannot say which part is a city',
      'address.village': 'section b.6 — the form asks city and village separately',
      'address.block': 'section b.7 — sub-district is not part of a stored address',
      'address.building': 'section b.3 — housing complex name, not stored',
      'address.floorNo': 'section b.2 right — floor number, not stored',
      'address.landmark': 'section b.3 right — landmark, not stored',
      'address.areaPostOffice2': 'section b.4-5 right — second line of the area/post office field',
    },
    cases: {
      /** The everyday case: a migrant, every optional question answered. */
      complete: {
        full_name: 'Sunita Devi Sharma',
        dob: '14/08/1961',
        aadhaar: '234567890124',
        mobile: '9876543210',
        caste: 'SC',
        migrant: 'Yes',
        migrant_certificate: 'Yes',
        poa_code: '04',
        address: 'House No. 42, Ward 7, Gandhi Nagar, Jaipur, Rajasthan',
        pincode: '302015',
        email: 'sunita.devi@example.com',
        ration_state: 'Rajasthan',
        ration_number: 'RJ13070123456',
        account_name: 'Sunita Devi Sharma',
        bank_name: 'State Bank of India',
        branch_name: 'Gandhi Nagar',
        ifsc: 'SBIN0001234',
        bank_account: '30123456789',
        declaration_14point: 'Yes',
        cylinder: '14.2 kg',
        burner: '2 - Burner',
      },
      /**
       * Not a migrant, so the Annexure I question was never asked; no email;
       * and an address proof that is not one of the seven we offer. All three
       * must come out as reported blanks, never as a half-written row.
       */
      'not-migrant-off-list-poa': {
        migrant: 'No',
        migrant_certificate: undefined,
        email: '',
        poa_code: 'other',
      },
    },
  },
}

const templates = readdirSync(resolve(root, 'src/data/forms'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(root, 'src/data/forms', f), 'utf8')))

const modules = readdirSync(resolve(root, 'src/lib/official'))
  .filter((f) => f.endsWith('.js') && f !== 'stamper.js')

const wanted = process.argv.slice(2)
let failed = false

for (const file of modules) {
  const path = resolve(root, 'src/lib/official', file)
  const form = (await import(path)).default
  if (wanted.length && !wanted.includes(form.id)) continue

  const fixture = FIXTURES[form.id]
  if (!fixture) {
    console.error(`FAIL: ${file} has no fixture in this script — add one, or it is untested`)
    failed = true
    continue
  }

  const template = templates.find((t) => t.officialForm === form.id)
  if (!template) {
    console.error(`FAIL: no template carries officialForm "${form.id}"`)
    failed = true
    continue
  }

  const names = Object.keys(fixture.cases)
  const base = fixture.cases[names[0]]

  // Every field the template can produce must be exercised, or this script
  // quietly stops covering the thing it was written to cover.
  const missing = template.fields.map((f) => f.id).filter((id) => !(id in base))
  if (missing.length) {
    console.error(`FAIL: ${form.id} template fields not covered: ${missing.join(', ')}`)
    failed = true
  }

  // Every slot in the geometry is either written by the form's module or
  // listed as knowingly unused. This is the check that would have caught the
  // four slots (post office, email, mother's name, residential status) that
  // sat extracted but unwritten for two sessions without anything complaining.
  const source = readFileSync(path, 'utf8')
  const orphans = Object.keys(form.boxes.slots).filter((name) => {
    // Numbered rows are written in a loop, as `aadhaarName.${i}`.
    const looped = name.replace(/\.\d+$/, '.${')
    return (
      !source.includes(`'${name}'`) &&
      !source.includes(looped) &&
      !Object.keys(fixture.unused).some((prefix) => name.startsWith(prefix))
    )
  })
  if (orphans.length) {
    console.error(`FAIL: ${form.id} slots neither written nor declared unused: ${orphans.join(', ')}`)
    failed = true
  }

  for (const name of names) {
    // Later cases are written as differences from the first, so that what a
    // case is actually testing is the part you can see.
    const answers = name === names[0] ? base : { ...base, ...fixture.cases[name] }
    const { blob, notes } = await buildOfficialPdf(form.id, answers)
    const out = resolve(here, `${form.id}-${name}.pdf`)
    writeFileSync(out, Buffer.from(await blob.arrayBuffer()))

    console.log(`\n=== ${form.id} / ${name} → ${out}`)
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

  const total = Object.keys(form.boxes.slots).length
  console.log(`\n${form.id}: ${total} slots in the geometry, ${total - orphans.length} accounted for`)
}

if (failed) process.exitCode = 1
