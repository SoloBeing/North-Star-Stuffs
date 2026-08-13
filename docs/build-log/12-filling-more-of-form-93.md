# Step 12 — Filling most of Form 93, not a ninth of it

**Session 3, Step 1**
**Date:** 13 August 2026

---

## The question that started it

> "I want to improve the already existing Form 93 filling, right now it only
> fills 9 things in that form. I want most of the form filled."

The count was exact. Form 93 has **24 numbered items** and step 9 wired up
**nine** of them. This step takes it to **seventeen**, and writes down why the
remaining seven are supposed to stay empty.

---

## What the audit found

Two different kinds of gap, and it is worth keeping them apart.

**Slots already extracted and simply never written.** `form93-boxes.json` had
39 slots; four things in it had been measured, committed, and then left idle:

| Slot | Item | Why it was idle |
|---|---|---|
| `res.po` | 5 — Post Office | reported as "DigiLocker does not hold this" |
| `email` | 10(ii) — Email ID | no template field existed |
| `mother.*` | 14 — Mother's name | reported as "FormMitra did not ask for this" |
| `status.*` | 7 — Residential status | refused as "a legal declaration" |

Three of those four notes told the citizen to write the box in by hand. That is
the correct behaviour for a value we do not have — and the wrong behaviour when
the fix is to ask a question.

**Slots never extracted at all.** Items 12, 15, 22 and 23, plus the whole
verification block, had no geometry. Step 7 extracted 946 cells across 64 rows
and only 39 slots were ever named, so most of that work was sitting unused.

---

## The extractor had to be written twice

Step 7's extraction script "lived in a temporary session scratchpad". It was
never committed, so this step rebuilt it from the prose description in
`07-official-form-geometry.md` — the four-edges rule, the ±0.75 pt line-cap
tolerance, the two bugs to avoid.

It reproduces the original almost exactly. Interior cell boundaries match to
three decimals:

```
name.first, first three cells
  original  [[180.36, 195.96], [195.96, 211.3 ], [211.3, 226.65]]
  rebuilt   [[180.61, 195.96], [195.96, 211.30], [211.30, 226.65]]
```

The only disagreement is the outer-left edge, by 0.25 pt — one line-cap width,
sub-pixel at any print resolution. All 39 original slots were left byte-for-byte
untouched regardless; the rebuilt extractor was used only to find new rows.

**This time it is committed**, as `scripts/extract-form-boxes.py`. The LPG form
identified in step 10 needs exactly this tool and should not need it written a
third time.

---

## The cell that would have gone wrong

Item 15 — *"Name of parent to be printed on PAN card"* — has two tick boxes,
Father and Mother. The extractor reports **three** cells:

```
[[333.07, 348.94], [348.94, 394.58], [394.58, 410.17]]
```

The middle one is 45.7 pt wide: it is the box drawn around the printed word
"Father", not a tick box. Taking "the first two cells" — the obvious reading,
and the one that works for gender and for item 12 — would have ticked Father
correctly and then written into a caption.

This is why every new row was checked against `pdftotext -bbox-layout` output
before being named, rather than inferred from its position in the list. The tick
labels sit at x=335.6 and x=397.0, which identifies cells 0 and 2 and rules out
cell 1.

---

## What is filled now

**Six new questions**, all with hand-written explanations in both languages:

| Field | Item | Notes |
|---|---|---|
| `post_office` | 5 | optional — the PIN code is what the post actually sorts by |
| `residential_status` | 7 | a legal declaration, so asked rather than assumed |
| `email` | 10(ii) | optional — this is how the e-PAN arrives |
| `single_parent` | 12 | gates item 14 |
| `mother_name` | 14 | only asked when item 12 is "No" |
| `print_parent` | 15 | only asked when item 12 is "No" |

**Four things derived with no question asked:**

- **Item 22, address for communication** — "Residence Address" is the only
  address on the form, so it is the only tick that can be true.
- **Item 23, the three proof boxes** — the application is not accepted without
  all three, so they are ticked, with a note telling the citizen in their own
  language to check the envelope. It is a declaration made in their name and
  they are told so plainly.
- **Verification block** — name, "SELF" as capacity, place from the district,
  and today's date. These are dotted leader lines rather than boxes, so they
  have no strokes to extract; their x-spans come from the bounding boxes of the
  words on either side.

**And a gap nobody had noticed.** The form has six heads of income; the template
offered four, so anyone living on rent from a shop was being pushed into "Income
from Other Sources". `income.houseProperty` and `income.capitalGains` are now
reachable. This was not found by reading the form — it was found by the coverage
check described below, which is the point of having one.

---

## What stays blank, and why

| Item | Reason |
|---|---|
| 6 — Office address | only for a card posted to a workplace; six questions for a rare case |
| 8 — Passport, 9 — TIN | non-residents only. Answering item 7 as anything but Resident now raises a note saying both are required |
| 10(iii) — Landline | "if any" |
| 16 — AO code | the PAN centre looks this up from the address |
| 17–21, 24 — Representative Assessee | not applicable when applying for yourself |
| Signature, photographs | physical, after printing |

---

## Two schema additions

`optional` and `showIf`, both usable by the other nine templates.

`optional` puts a **"I do not have this"** button where "Next" would be — one
button that says what it will do, rather than two the citizen has to choose
between. The wording matters: "Skip" invites a citizen to skip a question they
*could* answer, where this one only invites them past a thing they genuinely
lack.

`showIf` names an earlier field and the answers that unlock this one. The
interesting part is not hiding the question, it is what happens to the answer.

**A hidden field's answer is deleted, at source.** A citizen who gives their
mother's name and then goes back and says a single parent raised them must not
have that name stamped into the government's form. Rather than teach the confirm
screen, both PDFs and the overview counts about `showIf`, `App.jsx` drops the
answer the moment its question stops applying. Everything downstream already
ignores absent answers, so nothing else changed and nothing else can forget.

**And the reverse direction, which is easier to miss.** Changing that answer
back from Yes to No *unlocks* two questions that were never asked. The confirm
screen only lists answers it has, so those two would have reached the PDF blank
and unmentioned — the exact silent-wrong-form failure this project exists to
prevent. Confirm now sends the citizen back into the guided fill with exactly
what is outstanding. Its Back button goes to the overview rather than to confirm,
which would bounce straight back and look broken.

Both directions are covered by a browser test, because both are state bugs that
type-check perfectly.

---

## Verification

### The coverage check that found a real bug

`frontend/scripts/check-form93.mjs` stamps the form with two sets of answers,
writes real PDFs, and asserts that **every slot in the geometry is either
written by `officialPdf.js` or listed as knowingly unused**.

Run against the finished code it passes at 53/53. Run against the code as it
stood ten minutes earlier it printed:

```
FAIL: slots neither written nor declared unused:
  aadhaarName.1, aadhaarName.2, income.houseProperty, income.capitalGains
```

Two were false positives from a template-literal loop. The other two were the
missing income heads. **This is the check that would have caught the original
four idle slots**, which sat extracted-but-unwritten across two sessions with
nothing complaining.

### Looking at the output

Step 7 established that a systematic coordinate error produces a subtly wrong
government form, so both scenarios were rendered and read:

- **Complete** — every question answered, two parents. Post office, residential
  status, email, item 12, mother's name, item 15, item 22, all three proof
  boxes, and the verification block all land in the right boxes.
- **Single parent, optional questions skipped** — mother's rows blank, item 15
  ticked "Father", post office and email blank, item 12 ticked "Yes". Nothing
  half-written: a blank mother's row with "Mother" ticked at item 15 would
  produce a card with no parent name on it.

### The flow, in a real browser

Playwright drives the whole thing at phone size:

```
15 fields in this form, 0 already filled from DigiLocker
Question 10 of 13          <- items 14 and 15 correctly hidden until unlocked
15 questions asked, in the government form's own order
0 console errors

A. single parent No -> Yes : mother's name and item 15 dropped from confirm
B. single parent Yes -> No : app asks both again, then returns to confirm
```

### Not verified

- **On a phone.** Unchanged from step 11 — voice and camera need real hardware.
- **The other nine templates.** `optional` and `showIf` are additive and no
  existing template uses either, but none were re-walked.
- **Whether a PAN centre accepts the output.** Nobody has submitted one of these
  forms. Everything here is read off the form's own printed labels; it is not a
  substitute for one real submission.

---

## Notes for whoever picks this up

- **`pdftotext -bbox-layout` is the labelling tool.** Row order is not enough
  to name a row, as item 15 shows. Get the label coordinates and match them.
- **Node needs an import attribute for JSON that Vite adds for you.** The check
  script installs a `registerHooks` resolver so it can exercise the real
  `officialPdf.js` rather than a copy that drifts.
- **A dead i18n key silently won.** `skip` already existed, unused, *below* the
  new one — and in an object literal the later key wins, so the button would
  have read "Skip for now". `oxlint`'s `no-dupe-keys` caught it. Worth running
  the linter even for a two-line string change.
- **Field order now follows the government form**, not the old template order.
  It groups sensibly for the citizen (identity → address → contact → income →
  parents) and makes the template diffable against the form itself.
