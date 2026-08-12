# Step 8 — Stamping answers into the real form

**Session 2, Step 2**
**Date:** 12 August 2026

Step 7 produced coordinates for every box on Form 93. This step turns the
citizen's answers into characters inside those boxes.

New files:

- `frontend/public/forms/form93.pdf` — the official blank (652 KB)
- `frontend/src/data/official/form93-boxes.json` — 39 named slots (12 KB)
- `frontend/src/lib/officialPdf.js` — the renderer

---

## Slots, not coordinates

The renderer never touches geometry. Rows extracted in step 7 were given names
once, and everything downstream asks for a name:

```
name.first            25 cells    dob.dd / dob.mm / dob.yyyy    2 / 2 / 4
aadhaar               12 cells    mobile.cc / mobile.number     3 / 10
res.flat … res.district  25 each  res.state / res.country       free text
res.pin                7 cells    gender.male|female|transgender  tick
```

39 slots in all. Adding a second official form later means another geometry
pass and another slot table — not another renderer.

Three ways to write into a slot, because the form has three kinds of box:

| Writer | For | Behaviour |
|---|---|---|
| `comb` | boxed grids | one character per cell, centred |
| `free` | wide open boxes (State, Country, Email) | left-aligned, shrunk until it fits |
| `tick` | choice boxes | a tick drawn from two lines |

The tick is drawn rather than typeset. A checkmark glyph would mean embedding a
symbol font and depending on it surviving whatever prints the form; two line
segments cannot fail that way.

---

## The rule the module follows

> Never write a guess into a government form.

Anything that cannot be placed with confidence is left blank and **reported
back**, so the citizen is told what they still have to complete. A blank box is
an inconvenience. A wrong box is an application rejected weeks later with no
explanation given — which is the exact failure this whole project exists to
prevent.

`buildOfficialPdf()` therefore returns `{ blob, notes }`, where each note is one
of:

- **`assumed`** — we filled it, but made a judgement call worth checking
- **`truncated`** — the value is longer than the boxes the form provides
- **`blank`** — deliberately not filled, and why

For the standard demo answers it returns six notes, including *"Residential
status — a legal declaration, tick it yourself"* and *"Signature and
photographs — must be done on paper"*.

---

## The three judgement calls

**Name splitting.** The form has separate First / Middle / Last boxes; we hold
one string. Two tokens become first + last, three or more put everything
between into the middle box. That is a convention, not a fact about anybody's
name, so when a middle name is produced it is reported as an assumption.

**Address splitting.** DigiLocker returns one flat string — `"House No. 42,
Ward 7, Gandhi Nagar, Jaipur, Rajasthan"` — while the form wants six separately
labelled rows. Indian addresses run specific → general, so assignment works
**backwards from the end**: last comma-part is the state, the one before it the
district, then area, then road, and whatever remains is joined into
Flat/Door/Building. Post Office is left blank because DigiLocker does not hold
it and inventing one would be worse than an empty box.

This is the weakest link in the chain and is flagged in the notes every time.

**Agricultural income has no box.** Our template offers Salary / Business /
Agriculture / No income. Form 93 offers six heads, none of them agriculture —
agricultural income is exempt and has no line of its own. It is ticked under
*Income from Other Sources*, which is where it is conventionally declared, and
the substitution is reported rather than done silently.

---

## Devanagari cannot go in these boxes

Helvetica has no glyphs beyond WinAnsi, and pdf-lib throws on encoding
anything else. That is a feature here, not an obstacle: the official form
*requires* English block capitals, so Hindi text in a name field is a real
problem with the answer, not a rendering problem.

`toBoxText()` uppercases, strips combining accents, and returns `null` if what
remains is still not encodable. The caller then leaves the boxes empty and adds
a note. The form never receives mojibake, and the app never crashes on the last
screen of the flow.

Note the inversion against `pdf.js`: the summary sheet is rendered through a
canvas precisely *so that* Hindi shapes correctly. Same project, opposite
constraint, because one document is for the citizen to read and the other is
for a counter clerk to process.

---

## Verified by rendering, again

Run against exactly what the mock DigiLocker profile and guided fill produce
today:

| Field | On the form |
|---|---|
| First / Last name | `S U N I T A` / `D E V I` |
| Name as per Aadhaar | `SUNITA DEVI` flowing across the row, blank cell for the space |
| Gender | tick in the Female box |
| Date of birth | `1 4 \| 0 8 \| 1 9 6 1` — the three groups, gaps preserved |
| Aadhaar | all twelve digits |
| Address | `HOUSE NO. 42` / `WARD 7` / — / `GANDHI NAGAR` / `JAIPUR` |
| State / Country | `RAJASTHAN` / `INDIA` in the free-text boxes |
| PIN | `3 0 2 0 1 5`, left-aligned in seven cells |
| Mobile | `9 1` + `9 8 7 6 5 4 3 2 1 0` |
| Source of income | tick in No Income |
| Father's name | `R A M` / `P R A S A D` |

Office address, Post Office, residential status and the AO code are correctly
untouched.

---

## What this step did not do

- **Not wired into the app yet.** Verified through a Node harness driving the
  real module, not through the UI.
- **`vite.config.js` does not precache PDFs.** `globPatterns` covers
  `js,css,html,svg,png,json,wasm` — no `pdf`. The blank form would be fetched
  from the network, so the official-form output would fail offline. Must be
  fixed in the wiring step, or offline stops being true.
