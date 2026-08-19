# Step 13 — The caste certificate, and the boxes the extractor could not see

**Session 5, Step 1**
**Date:** 19 August 2026

---

## Where this started

The task was "add more forms". Ujjwala closed out on 19 August, which left eight
templates still carrying their prototype contents, and
[step 10](10-sourcing-the-other-blanks.md) had already ranked what was possible.
With RTI off the table, the caste certificate is the next form step 10 says can
be done at all — and it is the one it warned would need a technique we do not
have.

Rajasthan stays the state. That was step 10's open product decision and it is
now a deliberate choice rather than an accident of the mock profile's Jaipur
address.

**Result: both category forms mapped and confirmed by eye — 36 slots on the
SC/ST form, 50 on the OBC one — and a writer that puts a date on the runs a form
prints instead of across its slashes.** Three defects found on the way, two of
them in code that shipped.

---

## Finding 1 — step 10 collected the wrong form

This is the most important thing in this step, because everything else was
downstream of nearly mapping the wrong document.

Step 10 fetched `caste-cert-raj-general.pdf` and labelled it "Rajasthan,
General category". It is a real, current government form. It is also one
**`caste-certificate.json` can never want**, because that template offers three
categories and none of them is General:

```
SC   अनुसूचित जाति
ST   अनुसूचित जनजाति
OBC  अन्य पिछड़ा वर्ग
```

There are **three forms in this series, one per category**, and the category is
pre-printed on the form rather than chosen on it. Both of the ones we need are
on the same official eMitra domain, and both are *newer* than the General blank
— a 2019 path rather than `USER_MGMT_OLD_DOCS`:

```bash
# SC/ST — परिशिष्ट-अ, 184,648 bytes, 3 pages, A4
curl -L -A "Mozilla/5.0" -o caste-raj-scst.pdf \
  "https://emitraapp.rajasthan.gov.in/emitrashared/USER_MGMT_DOCS/GUIDELINE_AND_EFORM/2019/7/30/GAndE_1564475215829.pdf"

# OBC/SBC — 276,286 bytes, 4 pages, 612 x 1008
curl -L -A "Mozilla/5.0" -o caste-raj-obc.pdf \
  "https://emitraapp.rajasthan.gov.in/emitrashared/USER_MGMT_DOCS/GUIDELINE_AND_EFORM/2019/7/30/GAndE_1564475156407.pdf"
```

Both are mapped here — the SC/ST form first, then the OBC one.

**What this means for the dispatcher: nothing.** `officialForm` stays one id per
template and the module picks its blank and geometry from the `category` answer.
One module, two geometries, two blanks — no change to `officialPdf.js`, and
`check-official-forms.mjs` still discovers it the same way.

---

## Finding 2 — the extractor found four cells on a page with thirty-one

Pointing the shipped pipeline at the form returned **2 rows and 4 cells** for
page 1, and nothing at all for pages 2 and 3. The form is not the problem; two
defects in the XML parse were.

### `closepath` was ignored, so every rectangle lost a side

`segments()` emitted a segment on `<lineto>` and nothing on `<closepath>`. A
rectangle is written

```xml
<moveto x="10" y="100"/><lineto .../><lineto .../><lineto .../><closepath/>
```

so three sides came back and the fourth — the one closing back to the start —
did not. One vertical is not a cell, so nothing closed.

It never mattered before because of what our two forms are: **27 of the caste
form's 28 stroke paths are closed rectangles, against 3 closepaths on all of
Form 93 page 1 and 3 on PMUY page 1.** Word draws shapes; the OMC and ITD forms
draw combs.

### A Word table's borders are not strokes at all

Even with rectangles closing, the Aadhaar and Bhamashah rows at the top of the
page were still missing. They are a Word *table*, and Word draws a table's
borders as **0.5pt filled rectangles**:

```
fill_path  x  52.9-  53.4  y 105.7-106.2     <- 0.5pt: a vertical
fill_path  x  53.4- 301.4  y 105.7-106.2     <- 0.5pt: a horizontal
```

A rectangle that thin is a line. `_hairline()` now takes its centreline, which
puts both families of box on the same footing and brings those two rows back —
with the printed label in cell 0 and the value box in cell 1.

Page 1 went from 4 cells to **31**.

### The default parse was left exactly as it was

The obvious cleanup — read only stroked ink — is not available. `combs` takes
points from *every* element, including clip paths, and applies whichever
transform the last `stroke_path` carried. That is arbitrary. It is also what
Form 93 and PMUY were verified box by box under, and **their specs pin rows by
position**, so any change renumbers two hand-checked maps. On LPG, 56% of the
segments the row finder consumes come from `fill_path`.

So `--ink` picks the parse, `combs` stays the default, and both shipped forms
were checked to extract identically on every page with `lpg-boxes.json`
regenerating byte-identically.

### The parse had no test, which is where both defects lived

Every case in `extract-form-boxes.test.py` stubbed `segments` out and drove
`rows()` with hand-built segment lists. The parser underneath had **no coverage
at all**. Eleven new cases now feed the real parser synthetic trace XML,
including two that pin the clip-path behaviour `combs` depends on, so a future
tidy-up of it fails loudly. 9 cases → 22.

---

## Finding 3 — a 481pt box was being dropped in silence

The affidavit page has a full-width `निवासी` box. It never appeared, and the
stamped page showed it plainly: every other box carried a label, that one was
blank.

The cause is a guard meant to reject gutters and page frames:

```python
if not (3 < x1 - x0 < 400):
```

On A4 a 481pt box is a legitimate full-width address field. Raising the default
is not open to us for the same reason as above — at 500pt PMUY finds three more
rows and Form 93 two more cells — so `widest` became a per-form knob, pinned in
the spec next to `ink`.

**Both knobs live in the spec, not just the command line.** A spec that did not
record them would resolve every row index somewhere else on the next
regenerate, which is precisely the failure the pinned cell counts exist to
prevent.

---

## What step 10 predicted, and what was actually true

Step 10's caste section made two calls. One held up; the more expensive one did
not.

**"The Hindi text layer is legacy-encoded, so label-matching will not work."**
True. The font is `DevLys 010` and `pdftotext` returns `tkfr izek.k i=` for
जाति प्रमाण पत्र. But it **did not matter**. The glyphs are Devanagari — only
the character codes are Latin — so the *rendered* page is perfectly legible.
Every one of the 86 slots across the two forms was named by cropping the stamped
form at 200dpi and reading it. Automatic labelling was never needed.

**"It is a ruled form, so it needs baseline placement rather than the per-cell
writer."** Mostly wrong, and this is the good news. Nearly every field on this
form is a real four-sided box: name, father's name, both addresses, village,
tehsil, district, birthplace, age, religion, caste, sub-caste, the tick boxes,
mobile, place, and all seven affidavit fields. The Stamper's existing `free()`
writer serves them with **no new technique at all**.

Exactly two fields on the SC/ST form are a printed guide rather than a box —
three on the OBC one — and they are boxes *containing* a guide:

```
5 जन्म दिनांक : [ _____/______/_________ ]
दिनांक :        [ _____/______/_________ ]
```

Writing a date into either with `free()` overstrikes the printed slashes. The
stamped crop shows the X sitting straight on the underscores, which is the
[step 12](12-filling-more-of-form-93.md) `dob` bug in a new form: geometry
valid, cell count pinned, spec↔map parity exact, and the output still wrong.
**Looking is what caught it, again.**

The fix was small and it is not guesswork: the underscore runs are readable
straight out of the text layer, at a shared baseline, separated by the printed
slashes —

```
'_' x=155.90 ... '_' x=177.85   '/' x=183.35    <- 5 underscores: day
'_' x=187.56 ... '_' x=215.02   '/' x=220.42    <- 6 underscores: month
'_' x=224.72 ... '_' x=268.47                   <- 8 underscores: year
```

so day, month and year are placed on their own runs rather than centred over the
whole box. That generalises to any form in this family, which is most state
forms.

`runs()` in the extractor returns each unbroken run of one repeated character
with its x-span and baseline. A spec declares them under `guides` with the run
count pinned, so a re-issued form printing four runs fails the build; each run
becomes one cell and the slot's `yBot` is the shared baseline.
`Stamper.guide(name, parts)` writes one part per run, centred, lifted 1.5pt so
the digits sit above the rule rather than in it.

Confirmed the only way it can be — 400dpi crops of both fields showing
`14 / 03 / 1991` and `19 / 08 / 2026` clear of the printed slashes. The reader
has five self-tests of its own, including two rules on different lines that must
not merge, and a dotted rule found by asking for its own character.

---

## What the form turned out to be

- **Its tick habit is the reverse of PMUY's.** On PMUY a tick goes in the narrow
  cell *after* the cell holding its printed word. Here the box comes *before*
  its word — box, then पुरुष. Confirmed by eye on gender, marital status and
  both Yes/No declarations. Two forms, two opposite conventions: this is not
  something to assume from one form to the next.
- **Item 7's जाति box is pre-printed** "अनुसूचित जाति/जन जाति". It is the form
  stating which category it serves, not a box to fill. Named so the checker
  accounts for it; never written to.
- **It asks religion, caste and sub-caste twice** — item 7 for the applicant,
  item 8 for the father. Item 9 asks which caste and religion appear in the
  applicant's education and employment records. `caste-certificate.json`
  collects none of these.
- **Page 3 is the citizen's affidavit** (section 5, शपथ-पत्र) and repeats name,
  father's name, residence, village, tehsil, district and caste — so it fills
  from the same answers as page 1.
- **Page 2 and section 2 are not the citizen's.** Section 2 is the patwari's
  जाँच रिपोर्ट; page 2 is two witness attestations for a responsible person to
  sign. Left unmapped, the same call PMUY page 2 got.
- **Numbering quirks in the series:** no form has a section 4, and the
  General-category blank skips item 8 entirely. The SC/ST form does not.

---

## The OBC form: the spec shape transferred, the questions did not

The OBC/SBC blank is the same series and the same Word idiom, so `ink=rects`,
`widest=500` and the spec structure carried straight over. **50 slots over pages
1 and 4**, all confirmed by eye. What did not carry over is what the form asks —
worth knowing before assuming one caste template can serve both:

- **Its जाति box is genuinely blank.** On the SC/ST form the same box is
  pre-printed with the category, so this one has to be written.
- **Item 8 asks the caste's serial number in the state OBC list**, where SC/ST
  asks the father's religion. There is no father's religion, caste or sub-caste
  on the OBC form at all, and no recorded-caste question.
- One Yes/No row of two cells, where SC/ST has two rows of one cell.
- **Three date guides, not two** — item 5, section 3's death/disability date,
  and the declaration date.
- Legal size with 4 pages, against A4 with 3.

**Both of pages 2 and 3 are witness attestations, and neither is redundant.**
Section 4 is for an applicant who has an ITR or a government pay slip to show;
section 6 is for one who has neither. Left unmapped, like the patwari's section.

**The 5×4 table is the creamy-layer declaration** — the mother's, father's and
husband's organisation, post and pay scale, plus immovable property. Its 12 data
cells are mapped and **left blank on purpose**. Asking a citizen by voice for
three relatives' employers and pay scales is a lot of questions, and this table
is the basis of non-creamy-layer eligibility, so a wrong answer is worse than a
blank one. Same call as the PMUY household table. Affidavit clauses (3) and (4)
ask the parents' post and annual income and are left blank for the same reason.

Section 3 (मृत्यु/स्थाई अक्षमता) prints *"यदि लागू नहीं हो तो छोड दीजिये"* —
leave it out if it does not apply. Mapped so the checker accounts for it, left
blank.

One form defect: **the स्थान box is drawn twice**, two rectangles a point apart,
so row 26 is used and row 27 is the duplicate. The General blank does the same;
the SC/ST one does not.

---

## Where things are

- `frontend/src/data/official/caste-scst-slots-spec.json` — the judgement, and
  it carries these findings. Read it first.
- `frontend/src/data/official/caste-scst-boxes.json` — generated from it.
  Nothing imports it yet.
- `frontend/public/forms/caste-raj-scst.pdf` — the blank, sha256
  `b28de4e66d99cd8877dcb5e092ae59d182140cbd82f32addf714fd790024c660`.
- `caste-obc-slots-spec.json`, `caste-obc-boxes.json`, and
  `frontend/public/forms/caste-raj-obc.pdf`, sha256
  `6e6798556aba6716d407ba0b265b80de8f017e2fed8a24210b66e99230eb3c70`.

Neither map is imported by anything yet.

Regenerate and re-check:

```bash
python3 scripts/build-boxes.py frontend/public/forms/caste-raj-scst.pdf \
    frontend/src/data/official/caste-scst-slots-spec.json \
    frontend/src/data/official/caste-scst-boxes.json
node frontend/scripts/stamp-slots.mjs frontend/public/forms/caste-raj-scst.pdf \
    frontend/src/data/official/caste-scst-boxes.json /tmp/scst-named.pdf
scripts/crop-form.sh /tmp/scst-named.pdf 1 290 520 /tmp/band.png 200 30 580
```

Then look at the crop. That is not optional; it is what found the date-guide
collision and the dropped `निवासी` box.

---

## What is left

Both maps are done and so is the date writer. Three steps remain, and none of
them needs new technique:

1. **A `casteCertificate.js` module** under `lib/official`, picking blank and
   geometry from the `category` answer — SC and ST take `caste-scst-boxes.json`,
   OBC takes `caste-obc-boxes.json`. `officialPdf.js` needs no change:
   `officialForm` stays one id per template and the module branches inside.
   `ujjwalaKyc.js` is the model to follow, including its `NOTES` table of
   blanks-on-purpose — this form needs entries for the photo, the witness pages,
   the patwari section, and on OBC the creamy-layer table and section 3.
2. **Rewrite `caste-certificate.json`** against the real forms, the way
   `ujjwala-kyc.json` replaced `lpg-subsidy.json`. Missing today: birthplace,
   age, marital status, religion, sub-caste, the Bhamashah number, the father's
   religion/caste/sub-caste and recorded caste (SC/ST only), and the state-list
   serial number (OBC only). Watch the 20-spoken-question limit — the two forms
   do not ask the same things, so some fields will need a `showIf` on
   `category`.
3. **Answers for both forms in `check-official-forms.mjs`.** It discovers
   modules under `lib/official`, so once the module exists it needs one answer
   set per category branch, and every mapped slot must be either filled or
   declared unused with a reason.
