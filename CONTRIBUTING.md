# Contributing to FormMitra

FormMitra is about 6,500 lines. You do not need to read them, and you should not
try to feed them to an AI assistant — the whole repository is roughly **44,000
tokens**, which will exhaust a free model's budget before it writes a line, and
produce a sprawling change nobody can review even if it fits.

Instead there are **context packs** in [`docs/contributing/`](docs/contributing/).
Each one is a small, self-contained document holding the schema, the current
list of valid names, a worked example, and strict rules about output. Give your
assistant **one pack** — not the repository — and it has everything it needs.

## Which pack do I need?

Give your assistant **one** of these. Each is a few thousand tokens; the exact
size of each is printed by `npm run context`.

| I want to… | Pack |
|---|---|
| add a government form FormMitra does not support yet | [`add-a-form.md`](docs/contributing/add-a-form.md) |
| add or fix a question, explanation or Hindi wording in a form | [`edit-a-form.md`](docs/contributing/edit-a-form.md) |
| add or fix text in the interface itself | [`add-text.md`](docs/contributing/add-text.md) |
| change how a screen looks — spacing, colour, layout | [`change-the-look.md`](docs/contributing/change-the-look.md) |
| add a validation rule (vehicle number, voter ID, …) | [`add-a-rule.md`](docs/contributing/add-a-rule.md) |

**Do not paste all five.** Together they are far bigger than any one of them,
and four of them are irrelevant to whatever you are doing.

Anything else — the screen flow, the PDF geometry, voice, OCR — needs the whole
picture. Open an issue describing what you want instead of writing it; those
parts are maintained by the repo owner. The packs tell your assistant to stop and
say so if your request lands there, which is the right answer rather than a
failure.

### A note on the UI pack

`change-the-look.md` is **presentation only**: how a screen looks, never what it
does. State, effects, handlers and props are off limits, because those live in
the same files and a plausible-looking edit to them breaks the flow in ways that
compile perfectly.

It is also the one pack whose output cannot be fully machine-checked. `npm run
check:ui` confirms you stayed inside the palette, the type scale and the tap
targets — it cannot tell whether the result reads well at arm's length in
sunlight. UI changes get a proper human look in a way form and text changes no
longer need.

## How to use a pack

1. Open the pack and copy **all** of it into your assistant.
2. Below it, write what you want in plain language. For `edit-a-form.md`, also
   paste the one form file you are changing — they are 100–270 lines each.
3. The pack tells the assistant to emit **only the addition**: one new file, or
   one object plus the id it goes after. No rewritten files, no diffs, no
   reformatting of code it was never asked to touch.
4. Save the output where the pack says.
5. Run the checker, fix what it reports, open a pull request.

## The checker

From the `frontend/` directory:

```bash
npm install          # first time only
npm run check:contrib
```

It validates every form template: required keys present, both languages on every
citizen-visible string, real rule names, `showIf` pointing at a field that
actually exists and can actually match. Run it before opening a PR — a failing
check is a PR that will be sent back.

To check a file that is not in the project yet:

```bash
npm run check:contrib -- path/to/your-form.json
```

Everything at once:

```bash
npm run check        # lint + templates + checker's own tests + pack freshness
```

### If you changed interface text

`i18n.js` holds every word the app says, and `t()` hides its own failures — a
missing `hi` falls back to English, a missing key renders as the key itself.
Both ship looking fine to anyone who reads English.

```bash
npm run check:text
```

It fails if a key is written twice, if either language is missing or empty, if
`hi` has no Devanagari in it, or if a screen asks for a string nobody wrote.

### If you changed a validation rule

Rules live twice — once in JavaScript for the browser, once in Python for the
server — and they must agree exactly. That check needs Python as well as Node:

```bash
npm run test:rules   # both implementations, every case in shared/validation-cases.json
npm run check:all    # everything, the way CI runs it
```

It fails if the two files disagree, if a rule exists in one and not the other,
if a rule has no test cases, or if the error messages are not byte-identical.
You do not need this for a form or a text change.

## Two things the checker cannot do

**It cannot tell whether your Hindi is good.** It only knows the `hi` key is
present, non-empty, and written in Devanagari rather than transliterated.
Hindi that reads like a machine translated it will be sent back by a human.

**It cannot tell whether your explanation is true.** If you write that an RTI
costs ₹20, the checker will happily pass it. Explanations concern people who
cannot verify them independently — that is the entire reason this app exists —
so say where you checked the fact.

## If you change the code, regenerate the packs

The packs are generated from the source, so they cannot drift into lying about
it. If you add a validation rule or an interface string, run:

```bash
npm run context
```

and commit the result. `npm run check` fails when the packs are stale, so CI
will catch you if you forget.

## Writing for a citizen

The person filling this form could not fill it without help. That shapes
everything:

- **Both languages, always.** Hindi is the default. A missing Hindi string is a
  citizen locked out.
- **`explain` says what the box is *for*,** and what goes wrong if it is wrong —
  not a restatement of the label. It is read aloud, so write it to be heard.
- **Be concrete.** "The tehsil office, the electricity board, or a specific
  hospital" beats "the relevant authority".
- **Name the trap** — the fee, the deadline, the thing that gets applications
  rejected weeks later with no explanation.
- **Never guess a government fact.** A wrong explanation is worse than none.
