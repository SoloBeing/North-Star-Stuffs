/**
 * Generate the contributor context packs in docs/contributing/.
 *
 * A teammate without a Claude subscription cannot feed 44k tokens of repository
 * into a free model and get a usable change back. These packs are the answer:
 * one small self-contained document per kind of change, holding the schema, the
 * live list of valid names, one worked example, and strict rules about emitting
 * only the addition.
 *
 * Every fact in them is read out of the code at generation time — the rule
 * names come from validation.js, the string keys from i18n.js, the schema from
 * the ten templates themselves. A hand-written version of this would go stale
 * silently and feed teammates' models outdated facts, which is worse than no
 * document at all.
 *
 *   node scripts/build-context-packs.mjs            regenerate the packs
 *   node scripts/build-context-packs.mjs --check    fail if they are stale
 *
 * The --check form belongs in CI, so drift breaks the build instead of a PR.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const root = resolve(frontend, '..')
const formsDir = resolve(frontend, 'src/data/forms')
const outDir = resolve(root, 'docs/contributing')

const FENCE = '```'
const checkOnly = process.argv.includes('--check')

// --- Read the live code ----------------------------------------------------

const { RULES } = await import('../src/lib/validation.js')
const { STRINGS } = await import('../src/lib/i18n.js')

const indexCss = readFileSync(resolve(frontend, 'src/index.css'), 'utf8')
const uiSource = readFileSync(resolve(frontend, 'src/components/ui.jsx'), 'utf8')

/** The `@theme` block is the palette and type scale; nothing else is allowed. */
const themeBlock = indexCss.match(/@theme\s*{([\s\S]*?)\n}/)?.[1] ?? ''
const themeTokens = [...themeBlock.matchAll(/--(color|text|radius)-([a-z0-9-]+):\s*([^;]+);/g)].map(
  ([, group, name, value]) => ({ group, name, value: value.trim() }),
)

/** Exported components, with the props each accepts. */
const uiComponents = [...uiSource.matchAll(/export function (\w+)\(\s*{([^}]*)}/g)].map(
  ([, name, propsRaw]) => ({
    name,
    props: propsRaw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.replace(/\s*=\s*/, ' = ').replace(/\s+/g, ' ')),
  }),
)

/** The keys of a `styles`/`tone` lookup — the values a variant prop accepts. */
function variantsOf(componentName, objectName) {
  const fn = uiSource.split(`export function ${componentName}(`)[1] ?? ''
  const obj = fn.match(new RegExp(`const ${objectName} = {([\\s\\S]*?)}\\[`))?.[1] ?? ''
  return [...obj.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1])
}

const screenFiles = readdirSync(resolve(frontend, 'src/screens'))
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => ({
    file: f,
    lines: readFileSync(resolve(frontend, 'src/screens', f), 'utf8').split('\n').length,
  }))
  .sort((a, b) => a.lines - b.lines)

const templateFiles = readdirSync(formsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()

const templates = templateFiles.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(formsDir, f), 'utf8')),
}))

const allFields = templates.flatMap((t) => t.data.fields)

/** Every distinct value a field key takes across all ten templates. */
function distinct(pick) {
  return [...new Set(allFields.map(pick).filter(Boolean))].sort()
}

const ruleNames = Object.keys(RULES).sort()
const profileKeys = distinct((f) => f.profileKey)
const sources = distinct((f) => f.source)
const formIds = templates.map((t) => t.data.id).sort()
const digilockerTypes = [
  ...new Set(
    templates.flatMap((t) =>
      (t.data.documents ?? []).map((d) => d.digilockerType).filter(Boolean),
    ),
  ),
].sort()

/**
 * One real `example` value per rule, so the pack shows shape rather than prose.
 *
 * The most illustrative example is the longest one that still fits a table cell
 * — "180000" teaches more than "5", and "Government College, Jaipur" more than
 * a full sentence. Taking whichever happened to appear first gave both of the
 * bad ones.
 */
const exampleForRule = {}
for (const rule of new Set(allFields.map((f) => f.rule))) {
  const seen = [
    ...new Set(allFields.filter((f) => f.rule === rule && f.example).map((f) => f.example)),
  ]
  if (seen.length === 0) continue
  const short = seen.filter((v) => v.length <= 30)
  exampleForRule[rule] = short.length
    ? short.reduce((a, b) => (b.length > a.length ? b : a))
    : seen.reduce((a, b) => (b.length < a.length ? b : a))
}

/** How often each field key appears — separates required from optional. */
const keyCounts = {}
for (const f of allFields) {
  for (const k of Object.keys(f)) keyCounts[k] = (keyCounts[k] ?? 0) + 1
}

// --- Shared blocks ---------------------------------------------------------

const WHAT_IS_IT = `FormMitra helps Indian citizens who cannot read bureaucratic
English fill government forms: it explains each field in plain Hindi, asks one
question at a time by voice, validates the answer with plain regex rather than a
model, and produces a filled printable PDF that never leaves the phone.

Everything a citizen hears or reads exists in **both English (\`en\`) and Hindi
(\`hi\`)**. A missing Hindi string is a citizen who cannot use the form.`

/**
 * The instruction block that makes the output reviewable.
 *
 * Repeated in full in every pack rather than linked, because each pack is read
 * on its own by a model that will not go and fetch a second document.
 */
function outputRules(deliverable, outOfScopeNote = '') {
  return `## Output rules — read before writing anything

You are writing a **contribution**, not a new version of the project. Someone
will paste your output into a repository they know well and you do not. They
will read every line you produce.

1. **Output only what is new.** Never reprint a file that already exists. If
   your change adds one object to a list of forty, output that one object.
2. **Never rewrite, reformat, reorder, rename or "improve" anything that already
   exists.** Not the indentation, not the key order, not a typo you spotted, not
   a comment you would have worded differently. Those are separate changes and
   they make a small contribution unreviewable.
3. **No diffs, no patches, no \`---\`/\`+++\` markers.** Output the literal text to
   be inserted, exactly as it should read in the file.
4. **One fenced code block, containing only the code.** No commentary, no
   \`// add this here\`, no ellipses standing in for omitted lines. Anything you
   want to explain goes in prose *outside* the block.
5. **State the destination in one line above the block** — the file path, and
   for an insertion, which existing entry it goes after.
6. **Closed lists are closed — but names you are creating are yours to choose.**
   Two different things get confused here, so be precise about which is which.
   *Closed*: wherever this document gives you the permitted values for something
   — \`rule\`, \`source\`, \`profileKey\`, \`digilockerType\`, or a string key you are
   *referring to* — you must pick from that list, and if what you need is not on
   it, stop and say so rather than inventing one.
   *Open*: the identifiers you are **creating** — a new field id, a new form id,
   a new string key — are yours to name. Follow the conventions given, reuse an
   existing name where one fits the same meaning, and otherwise invent a clear
   one. Do not stop merely because the name you need is not already in a list.
7. **Both \`en\` and \`hi\`, everywhere, always.** Hindi written for someone who
   cannot read English — not transliterated English, and not machine-literal.
8. **If the change cannot be made this way, say so and stop.** Do not improvise a
   larger change. "This needs a change to \`App.jsx\`, which is out of scope for
   this pack" is a useful answer and a welcome one.${outOfScopeNote}

**Your deliverable:** ${deliverable}

Files that are **out of scope** for every pack — never emit changes to these:
\`App.jsx\`, \`officialPdf.js\`, \`pdf.js\`, \`speech.js\`, \`ocr.js\`,
\`components/ui.jsx\`, anything under \`backend/\` except where a pack says
otherwise. They need the whole picture and are maintained by the repo owner.`
}

// Each pack has its own checker, and naming the wrong one is worse than naming
// none — the contributor runs it, sees it pass, and concludes nothing is wrong.
function howToSubmit(step) {
  return `## How this gets in

1. Save your output to the file path given above.
2. ${step}
3. Open a pull request with one sentence saying what the change is for.

The checker cannot tell whether your Hindi is *good* or whether your explanation
of a government rule is *true*. A human reviews meaning. The checker only
guarantees the shape is right, so review time goes to the part that matters.`
}

const runChecker = (command, what) => `Run the checker from the \`frontend/\` directory:
   ${FENCE}bash
   ${command}
   ${FENCE}
   ${what}
   Fix anything it reports before opening the PR.`

const SUBMIT_TEMPLATE = howToSubmit(
  runChecker(
    'npm run check:contrib',
    `It validates structure — every required key present, both languages, real
   rule names, \`showIf\` pointing at a field that exists.`,
  ),
)

const SUBMIT_TEXT = howToSubmit(
  runChecker(
    'npm run check:text',
    `It checks every key — both languages present, Hindi that is actually written
   in Hindi, no key written twice, and no screen asking for a string that
   nobody wrote.`,
  ),
)

const SUBMIT_AS_SHOWN = (what) =>
  howToSubmit(`Run ${what} shown above, and fix anything reported before opening the PR.`)

const GENERATED_BY = `<!-- Generated by frontend/scripts/build-context-packs.mjs. Do not edit by hand:
     run \`npm run context\` from frontend/ instead. Every fact below is read out
     of the code, so it cannot drift away from what the app actually does. -->`

function ruleTable() {
  const rows = ruleNames.map((name) => {
    const ex = exampleForRule[name] ? `\`${exampleForRule[name]}\`` : '—'
    // The English error message is the most precise description of what a rule
    // accepts that exists anywhere, and it is written for a citizen.
    const accepts = RULES[name].en.replace(/\|/g, '\\|')
    return `| \`${name}\` | ${accepts} | ${ex} |`
  })
  return [
    '| `rule` | what it accepts | example from a live template |',
    '|---|---|---|',
    ...rows,
    '| `choice` | one of the values listed in the field\'s own `options` | — |',
  ].join('\n')
}

function header(title, blurb) {
  return `${GENERATED_BY}

# ${title}

${blurb}

## What FormMitra is

${WHAT_IS_IT}`
}

// --- Pack 1: add a whole new form -----------------------------------------

function packAddForm() {
  const example = readFileSync(join(formsDir, 'rti-application.json'), 'utf8').trim()
  const required = Object.entries(keyCounts)
    .filter(([, n]) => n === allFields.length)
    .map(([k]) => k)
    .sort()

  return `${header(
    'Adding a new government form',
    `Use this pack when FormMitra should support a form it does not have yet.
A form is **one JSON file**. No JavaScript is involved, and nothing else in the
app needs to know the form exists beyond two lines in an index.`,
  )}

${outputRules(
  `one complete new file at \`frontend/src/data/forms/<form-id>.json\`, plus the
two lines to add to \`frontend/src/data/forms/index.js\` (an \`import\` and an
entry in the \`FORMS\` array).`,
)}

## First: does this form already exist?

FormMitra already has these ${formIds.length} forms:

${formIds.map((i) => `\`${i}\``).join(', ')}

**If the form you were asked for is in that list, stop.** Say it already exists,
name it, and say that changing an existing form is a different job needing
\`docs/contributing/edit-a-form.md\` instead. Do not reproduce the example
template below as if it were new work — an automated check rejects a duplicate
id, so it wastes a round trip.

Match on meaning, not on spelling: "RTI", "right to information" and
"suchna ka adhikar" are all \`rti-application\`.

## The shape of a template

Top level, all required:

| key | meaning |
|---|---|
| \`id\` | kebab-case, unique, matches the filename without \`.json\` |
| \`icon\` | one emoji, shown on the form grid |
| \`name\` | \`{en, hi}\` — the form's official name |
| \`issuer\` | \`{en, hi}\` — which office issues or receives it |
| \`summary\` | \`{en, hi}\` — one or two sentences: what it is for, what it costs |
| \`ocrKeywords\` | lowercase strings found on the printed form; used to identify a scanned page |
| \`documents\` | what to carry — each \`{en, hi}\`, optionally \`digilockerType\` |
| \`fields\` | the questions, in the order the citizen should be asked |

Each entry in \`fields\` requires ${required.map((k) => `\`${k}\``).join(', ')}
and may also carry:

| key | when to use it |
|---|---|
| \`example\` | a realistic sample answer, shown under the question |
| \`profileKey\` | **required when** \`source\` is \`digilocker\` — which profile value fills it |
| \`options\` | **required when** \`rule\` is \`choice\` — each \`{value, en, hi}\` |
| \`optional\` | \`true\` if the citizen may genuinely not have this; gives them a "I do not have this" button |
| \`showIf\` | only ask this when an earlier answer matches, e.g. \`{"single_parent": "No"}\` |

### \`source\`

${sources.map((s) => `- \`${s}\``).join('\n')} — \`digilocker\` means it is filled
automatically from the citizen's verified profile and never asked aloud. Use it
whenever the value is one of the profile keys below; every such field is one
fewer question.

### \`profileKey\` — the only valid values

${profileKeys.map((k) => `\`${k}\``).join(', ')}

### \`digilockerType\` on a document — the only valid values

${digilockerTypes.map((k) => `\`${k}\``).join(', ')}

### \`rule\` — the only valid values

${ruleTable()}

### Field ids — a vocabulary, not a permitted list

**You may and often must create new field ids.** A form asking something no
existing form asks needs a new id, and \`place_of_birth\` or \`informant_name\` are
exactly as valid as anything below. The only hard requirements are that an id is
\`snake_case\` and unique **within its own form**; ids are scoped per form, so
reusing one across forms is fine and expected.

The list below is the vocabulary already in use. Reuse a name when it means the
same thing — it keeps templates comparable and makes them diffable against each
other. Invent a clear one when it does not.

${distinct((f) => f.id)
  .map((i) => `\`${i}\``)
  .join(', ')}

## Writing the \`explain\` text

This is the part of FormMitra that matters most, and the part a model is most
likely to do badly. It is read aloud to someone who could not fill this form
without help.

- Say what the box is **for**, and what goes wrong if it is wrong. Not a
  restatement of the label.
- Concrete over general: "the tehsil office, the electricity board, or a
  specific hospital" beats "the relevant authority".
- Warn about the trap if there is one — a fee, a deadline, a common rejection.
- Hindi that a person actually speaks. Not transliterated English.

A good one, from the live RTI template:

> Ask for specific facts, documents or file notings — for example 'the current
> status of my pension application dated 12 March 2026'. Do not ask 'why'
> questions. The law requires them to give you information they hold, not to
> explain or justify their decisions.

## A complete working template

Below is the live \`rti-application.json\`, in full — included so you can see how
a real template is put together.

**It is a reference, not a starting point.** Do not return it, or a lightly
reworded version of it, as your answer. \`rti-application\` already exists. What
you copy from it is the *structure*: which keys appear, how the two languages
sit side by side, how long an \`explain\` runs, how an \`options\` list is written.
Everything else — the id, the questions, the explanations, the documents — must
be written for the form you were actually asked about.

${FENCE}json
${example}
${FENCE}

## Registering it

Two lines in \`frontend/src/data/forms/index.js\`. Output only these two lines
and say where they go — do not reprint the file.

${FENCE}js
import myNewForm from './my-new-form.json'
// ...and inside the existing FORMS array:
  myNewForm,
${FENCE}

${SUBMIT_TEMPLATE}
`
}

// --- Pack 2: change a field in a form that already exists ------------------

function packEditForm() {
  const byShape = {}
  for (const t of templates) {
    for (const f of t.data.fields) {
      const shape = f.showIf
        ? 'conditional'
        : f.optional
          ? 'optional'
          : f.rule === 'choice'
            ? 'choice'
            : f.source === 'digilocker'
              ? 'digilocker'
              : 'plain'
      if (!byShape[shape]) byShape[shape] = { form: t.data.id, field: f }
    }
  }

  const shapeBlock = (key, title, note) => {
    const found = byShape[key]
    if (!found) return ''
    return `### ${title}

${note}

From \`${found.form}.json\`:

${FENCE}json
${JSON.stringify(found.field, null, 2)}
${FENCE}
`
  }

  return `${header(
    'Changing a field in an existing form',
    `Use this pack to add a question to a form, fix a wrong explanation, correct
a Hindi wording, or make a question conditional. Everything here is one JSON
object inside one template file.`,
  )}

${outputRules(
  `the single field object, complete, plus one line saying which form file it
belongs to and which existing field id it goes after. If you are correcting an
existing field, output the corrected object in full and name the id it replaces.`,
)}

## Forms you can edit

${templates
  .map(
    (t) =>
      `- \`${t.file}\` — ${t.data.name.en} (${t.data.fields.length} fields)`,
  )
  .join('\n')}

Ask for the one file you need. It is 100–270 lines; you do not need the rest of
the project.

## Field order is the order the citizen is asked

Fields are asked top to bottom. Group them the way a person thinks — identity,
then address, then contact, then the form-specific questions. For a form that
mirrors a printed government form, follow the printed numbering instead, so the
template can be checked against the paper.

## The five shapes a field can take

${shapeBlock('plain', 'A plain asked question', 'The common case: FormMitra asks it aloud and validates the answer.')}
${shapeBlock('digilocker', 'Filled from DigiLocker, never asked', `\`source: "digilocker"\` with a \`profileKey\`. Valid keys: ${profileKeys.map((k) => `\`${k}\``).join(', ')}. The citizen is never asked; it arrives verified.`)}
${shapeBlock('choice', 'A choice from fixed options', 'Set `rule` to `choice` and list `options`, each with `value` (stored, English, never shown) plus `en` and `hi` (shown and spoken).')}
${shapeBlock('optional', 'Something the citizen may not have', '`optional: true` turns the Next button into "I do not have this". Use it only when a citizen may genuinely lack the thing — not to make a hard question skippable.')}
${shapeBlock('conditional', 'Only asked when an earlier answer matches', '`showIf` names an earlier field and the answer that unlocks this one. The field named **must appear earlier in the array**. If the citizen goes back and changes that answer, this answer is deleted automatically — do not write anything that depends on it surviving.')}

## \`rule\` — the only valid values

${ruleTable()}

## Writing \`explain\`

Read aloud to someone who cannot read the form. Say what the box is *for* and
what goes wrong if it is wrong — not a restatement of the label. Be concrete,
name the trap, and write Hindi a person actually speaks.

${SUBMIT_TEMPLATE}
`
}

// --- Pack 3: interface text ------------------------------------------------

function packAddText() {
  const keys = Object.keys(STRINGS)
  const listing = keys
    .map((k) => `| \`${k}\` | ${STRINGS[k].en.replace(/\|/g, '\\|')} |`)
    .join('\n')

  return `${header(
    'Adding or fixing interface text',
    `Every word of the interface lives in one file: \`frontend/src/lib/i18n.js\`.
Use this pack to add a new string, or to fix an English or Hindi wording.`,
  )}

${outputRules(
  `the new entries only, as \`key: { en, hi },\` lines ready to paste into the
\`STRINGS\` object in \`frontend/src/lib/i18n.js\`. For a correction, output only
the entries that change.`,
)}

## The format

${FENCE}js
  keyName: { en: 'English text', hi: 'हिंदी पाठ' },
${FENCE}

Longer strings wrap:

${FENCE}js
  keyName: {
    en: 'A longer sentence that does not fit on one line.',
    hi: 'एक लंबा वाक्य जो एक पंक्ति में नहीं आता।',
  },
${FENCE}

Rules that are easy to get wrong:

- **camelCase keys**, named for meaning and not for the screen they sit on.
- **A key must be unique.** \`STRINGS\` is a plain object, so a repeated key
  silently overrides the earlier one and the wrong text ships. This has happened
  in this project before. Check the list below before choosing a name.
- **Never delete or renumber an existing key.** Other screens read it.
- Hindi is the **default language** — most citizens using this app read Hindi
  only. Write it first if that helps; do not treat it as a translation.

## Every key that already exists

${keys.length} keys. This is a **collision list, not a permitted list** — you are
adding a new key, so you must choose a name that is not already here. Check
against it, then name yours freely in camelCase.

If a key below already says what you need, reuse it instead of adding a
near-duplicate.

| key | current English |
|---|---|
${listing}

${SUBMIT_TEXT}
`
}

// --- Pack 4: a new validation rule ----------------------------------------

function packAddRule() {
  return `${header(
    'Adding a validation rule',
    `Use this pack when a field needs a check that no existing rule performs —
a vehicle registration number, a voter ID, a GSTIN.

**Read this first:** the rule table exists twice, once in JavaScript and once in
Python, and the two must agree. Your contribution is therefore **two entries,
not one**. A rule added to only one side is the exact bug this project has
already shipped once.`,
  )}

${outputRules(
  `**three** things — an entry for \`RULES\` in \`frontend/src/lib/validation.js\`,
the matching entry for \`RULES\` in \`backend/validation.py\`, and a block of test
cases for \`shared/validation-cases.json\`. Output those three, nothing else.`,
  `
9. **All three or none.** A JavaScript entry without its Python twin will be sent
   back, and so will a rule with no cases — an automated check rejects both
   before a human reads the pull request.
10. **Your cases are assertions, not illustrations.** State exactly what each
   input becomes. If you are not certain, say you are unsure rather than
   guessing — a wrong expected value is caught, but it wastes a review round.`,
)}

## Why there are two copies

The browser copy is the one that runs during a citizen's session, offline
included. The Python copy backs the API used by operator tooling and is the
server-side source of truth. Neither can be dropped.

They are held together by \`shared/validation-cases.json\` and the check described
at the end of this document, which fails the build if the two ever disagree.
That is why your contribution is three pieces rather than one.

## Rules that already exist

${ruleTable()}

## The JavaScript entry

\`frontend/src/lib/validation.js\`, inside \`export const RULES = { ... }\`:

${FENCE}js
  vehicle: {
    test: (v) => /^[A-Z]{2}\\d{2}[A-Z]{1,2}\\d{4}$/.test(v),
    normalise: (v) => stripSpaces(v).toUpperCase(),
    en: 'Vehicle number must look like RJ14AB1234.',
    hi: 'वाहन नंबर इस तरह होना चाहिए: RJ14AB1234',
  },
${FENCE}

- \`test\` receives the **already normalised** value and returns a boolean.
- \`normalise\` cleans the raw input before testing. Helpers that already exist:
  \`stripSpaces\`, \`collapse\`, \`devanagariToAscii\`.
- \`en\` and \`hi\` are shown **and spoken** when the value is rejected. Say what a
  correct one looks like — "must be 11 characters: 4 letters, a zero, then 6
  more" tells a citizen what to do; "invalid format" does not.

## The Python entry

\`backend/validation.py\`, inside \`RULES: dict[str, Rule] = { ... }\`:

${FENCE}python
    "vehicle": _regex_rule(
        r"^[A-Z]{2}\\d{2}[A-Z]{1,2}\\d{4}$",
        "Vehicle number must look like RJ14AB1234.",
        "वाहन नंबर इस तरह होना चाहिए: RJ14AB1234",
        normalise=lambda v: _upper(_strip_spaces(v)),
    ),
${FENCE}

Use \`_regex_rule\` for a pattern, \`_fn_rule\` for anything needing arithmetic
(a checksum, a date comparison). The messages must be **byte-identical** to the
JavaScript ones.

## Devanagari digits

If the rule accepts digits, it must accept **०१२३४५६७८९** as well as 0123456789.
An Android phone set to Hindi returns Devanagari digits from voice input. Apply
\`devanagariToAscii\` (JS) / \`_devanagari_to_ascii\` (Python) in \`normalise\`.

## The test cases

\`shared/validation-cases.json\`, a new top-level key named after your rule.
Both implementations are run against every case and must agree with each other
**and** with what you wrote here.

Each case is \`[input, what it must normalise to]\`. \`pass\` cases must be
accepted after normalising; \`fail\` cases must be rejected.

${FENCE}json
  "vehicle": {
    "pass": [
      ["RJ14AB1234", "RJ14AB1234"],
      ["rj 14 ab 1234", "RJ14AB1234"]
    ],
    "fail": [
      ["RJ14AB123", "RJ14AB123"],
      ["1234RJ14AB", "1234RJ14AB"]
    ]
  }
${FENCE}

Stating the cleaned value is the whole point of the format, and it is where
contributions usually go wrong. A real example: a \`voter_id\` rule was submitted
claiming that \`एबीसी१२३४५६७\` would pass as \`ABC1234567\`. It does not —
\`devanagariToAscii\` converts Devanagari **digits**, and does nothing to
Devanagari **letters**, so the value stays \`एबीसी1234567\` and is rejected. The
rule was right; the claim about it was wrong. Write what actually happens.

Include a Devanagari-digit case for any rule that accepts digits.

## Before you submit

Run this from the \`frontend/\` directory — it needs Python as well as Node:

${FENCE}bash
npm run test:rules
${FENCE}

It runs every case through **both** implementations and fails if they disagree,
if a rule is missing from either file, if a rule has no cases, or if the \`en\`
and \`hi\` messages are not byte-identical across the two files.

${SUBMIT_AS_SHOWN('the parity check')}
`
}

// --- Pack 5: presentation changes to a screen ------------------------------

function packUiChange() {
  const colours = themeTokens.filter((t) => t.group === 'color')
  const text = themeTokens.filter((t) => t.group === 'text')
  const radius = themeTokens.filter((t) => t.group === 'radius')

  const componentList = uiComponents
    .map((c) => `| \`<${c.name}>\` | ${c.props.map((p) => `\`${p}\``).join(', ') || '—'} |`)
    .join('\n')

  return `${header(
    'Changing how a screen looks',
    `Use this pack for spacing, colour, layout, sizing and static markup on an
existing screen.

**This pack is presentation only.** You may change what a screen *looks like*.
You may not change what it *does* — no state, no effects, no handlers, no props,
no logic. Those live in the same files, and a plausible-looking edit to them
breaks the flow in ways that type-check perfectly and only show up in front of a
citizen.`,
  )}

${outputRules(
  `the complete replacement for the JSX element you are changing, plus one line
naming the file and quoting the element's current opening tag so it can be
located. Never output the whole file.`,
  `
9. **Never touch logic.** Do not add, remove, or modify \`useState\`, \`useEffect\`,
   \`useRef\`, \`useCallback\`, event handler bodies, function signatures, props,
   conditionals that decide *what* renders, or any call into \`validation\`,
   \`speech\`, \`ocr\` or \`pdf\`. Changing \`className\` on an element is in scope;
   changing when that element appears is not.
10. **Never write literal text into a screen.** Every visible word comes from
   \`t('key', lang)\`. If you need new words, that is a different pack —
   \`add-text.md\` — and you should say so.
11. **Only tokens from the palette below.** Not \`bg-blue-600\`, not
   \`text-gray-500\`, not \`p-[13px]\`, not \`#3366ff\`. An automated check rejects
   all four.`,
)}

## Who this is for

${indexCss.match(/Primary users are[\s\S]*?high-contrast colours only\./)?.[0]?.replace(/\s+/g, ' ') ?? ''}

These are not preferences. A 40px button is a button our users cannot reliably
hit; 14px text in sunlight is text they cannot read.

There are two tap-target tiers in the code, and the difference matters:

| what | floor | why |
|---|---|---|
| anything in the main flow — answering, continuing, listening | **56px** (\`min-h-14\`, usually \`min-h-16\`) | the citizen must hit it first time, every time |
| header chrome — language toggle, erase button | 44px (\`min-h-11\`) | absolute floor, used only where a mis-tap is harmless |
| body text | 18px (\`text-base\`) | \`text-sm\` is the smallest allowed anywhere, and only for supporting labels |
| colour | from the palette below | nothing else has been contrast-checked |

If you are unsure which tier something is in, use the larger one.

## The palette

Every colour available. There are no others — Tailwind's stock colours are
rejected by the checker.

| token | value | use as |
|---|---|---|
${colours.map((c) => `| \`${c.name}\` | \`${c.value}\` | \`bg-${c.name}\`, \`text-${c.name}\`, \`border-${c.name}\` |`).join('\n')}

## The type scale

${text.map((t) => `- \`${t.name.replace(/^/, 'text-')}\` — ${t.value}`).join('\n')}

Rounding: ${radius.map((r) => `\`rounded-${r.name}\` (${r.value})`).join(', ')}.

## Animation

- \`fm-rise\` — a short rise-and-fade on entry. \`<Screen>\` applies it already.
- \`fm-listening\` — the pulsing ring on the microphone while it is recording.

Both are disabled automatically under \`prefers-reduced-motion\`. Do not add new
animation; a moving interface is harder for our users, not easier.

## Components you should reuse

Import from \`../components/ui\`. Prefer these over hand-rolled markup — they
carry the tap-target and contrast rules with them.

| component | props |
|---|---|
${componentList}

\`<Button variant>\` accepts ${variantsOf('Button', 'styles').map((v) => `\`${v}\``).join(', ')}.
\`<Banner tone>\` accepts ${variantsOf('Banner', 'styles').map((v) => `\`${v}\``).join(', ')}.

## The screens

Ask for the one file you are changing and paste it in. Nothing else is needed.

${screenFiles.map((s) => `- \`src/screens/${s.file}\` — ${s.lines} lines`).join('\n')}

\`GuidedFill.jsx\` and \`Confirm.jsx\` hold the most logic. Be especially careful
there that you are changing appearance only.

## What your output looks like

> In \`src/screens/Checklist.jsx\`, replace the element beginning
> \`<div className="mb-4 flex items-start gap-3">\`:

${FENCE}jsx
        <div className="mb-4 flex items-start gap-4 rounded-2xl border border-line bg-white p-5">
          <CheckIcon size={26} />
          <p className="text-lg font-semibold text-ink">{t('youHaveThis', lang)}</p>
        </div>
${FENCE}

Keep the surrounding indentation so it drops straight in.

## Before you submit

${FENCE}bash
npm run check:ui     # palette, type scale, tap targets
npm run lint         # oxlint, including React hook rules
npm run build        # it must still compile
${FENCE}

## What these checks cannot do

They confirm you stayed inside the design system. They **cannot** tell whether
the result looks right, reads well at arm's length in sunlight, or still makes
sense to someone who cannot read the labels. Unlike a form template, a UI change
cannot be fully machine-verified — so say plainly what you changed and why, and
expect a human to look at it.

${SUBMIT_AS_SHOWN('the three checks')}
`
}

// --- Write, or check -------------------------------------------------------

const packs = {
  'add-a-form.md': packAddForm(),
  'edit-a-form.md': packEditForm(),
  'add-text.md': packAddText(),
  'add-a-rule.md': packAddRule(),
  'change-the-look.md': packUiChange(),
}

mkdirSync(outDir, { recursive: true })

let stale = 0
for (const [name, body] of Object.entries(packs)) {
  const path = join(outDir, name)
  const approxTokens = Math.round(body.length / 4)

  if (checkOnly) {
    let current = null
    try {
      current = readFileSync(path, 'utf8')
    } catch {
      current = null
    }
    if (current !== body) {
      console.error(`STALE: docs/contributing/${name}`)
      stale += 1
    }
    continue
  }

  writeFileSync(path, body)
  console.log(
    `wrote docs/contributing/${name}  ${body.split('\n').length} lines, ~${approxTokens} tokens`,
  )
}

if (checkOnly) {
  if (stale) {
    console.error(
      `\n${stale} pack(s) out of date. Run \`npm run context\` and commit the result.`,
    )
    process.exit(1)
  }
  console.log('context packs are up to date')
}
