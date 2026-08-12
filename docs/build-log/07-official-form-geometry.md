# Step 7 — Reading the official form's box geometry

**Session 2, Step 1**
**Date:** 12 August 2026

---

## The question that started it

> "Does our app currently fill forms like this?" — with a screenshot of the real
> PAN form, blank on the left, and on the right the same form with
> `R|A|H|U|L` written one letter per box.

No. And the gap was worth naming plainly.

What the prototype generates (`frontend/src/lib/pdf.js`) is a FormMitra-branded
**summary sheet**: a label-above-value list, a document checklist, a footer. It
is our document, not the government's.

Why that matters more than it looks: with a summary sheet the citizen still has
to hand-copy every value onto the real form — in English block capitals, one
letter per box, in the right cells. That is precisely the task they came to us
unable to do. We were removing the *understanding* problem and the *validation*
problem, then handing the *transcription* problem straight back. A cyber-café
agent would still get paid.

---

## Finding 1 — Form 49A no longer exists

Our template was called `pan-49a` and its name string said "Form 49A". Every
direct URL for that form is now dead:

| URL | Result |
|---|---|
| `protean-tinpan.com/downloads/pan/download/Form_49A.PDF` | 200, but an HTML React shell |
| `incometaxindia.gov.in/forms/.../103120000000007945.pdf` | 403 Access Denied |
| `tin.tin.nsdl.com/pan/Form49A.pdf` | connection failed |

The official download page now lists **Form No. 93 — Indian Citizen** in its
place. Form 49A has been superseded under the PAN 2.0 project.

The form in the screenshot *is* Form 93 — its text layer matches exactly
(`PART A - Personal Information`, `B. Name (as per Aadhaar)`, a `Transgender`
gender option, a TIN field). None of those exist on the old 49A.

**This is a live correctness problem in the templates, not just a naming one.**
Fixed in step 9: the template is now `pan-93.json`.

The URL that actually works needs a `Referer` header:

```
https://tinpan.proteantech.in/downloads/pan/download/Form%2093.PDF
```

5 pages, A4 (595.276 × 841.89 pt), 665 KB, produced by Adobe InDesign,
created 26 March 2026.

---

## Finding 2 — there is no AcroForm

```
$ pdfinfo form93.pdf
Form:            none
```

So the pleasant path — `pdf.getForm().getTextField(...).setText(...)` — is
unavailable. The boxes are not form fields; they are ink. The only option is a
**coordinate overlay**: work out where every box is, then draw one character
into each.

The upside is that Devanagari shaping, which forced the summary sheet onto a
canvas, is irrelevant here. Official forms want English capitals and digits, so
plain `drawText` works and the output text stays selectable.

---

## Extracting the boxes

Measuring ~950 boxes by hand was never going to happen. The boxes exist as
vector strokes, so they can be read straight out of the PDF with
`mutool draw -F trace`, which dumps every drawing operation with its transform.

### v1: evenly-spaced verticals — wrong

First attempt grouped vertical strokes sharing a y-span and looked for runs of
even spacing. It produced clean-looking output. It was also wrong:

```
 306.77   242.90      6 cells    <- Date of Birth   (should be 8)
 320.18   242.90      8 cells    <- Aadhaar Number  (should be 12)
```

Two independent reasons, both invisible in the output:

1. **Cell widths are not uniform.** The same row mixes 14.85 pt and 16.52 pt
   cells. An even-pitch run breaks at the first wide cell and silently returns
   the longest run it found rather than the row.
2. **Rows have real gaps.** Date of Birth is drawn as three groups —
   `dd` `mm` `yyyy` — with genuinely empty space between them.

A 12-digit Aadhaar number written into 8 boxes is exactly the class of error
this project exists to prevent, and nothing about the output announced it.

### v2: a cell must have all four edges

The rewrite takes evidence rather than inference. A cell is an x-interval that
carries **a top stroke, a bottom stroke, and a vertical stroke down both
sides**. Variable widths and gaps then fall out for free, and a cell that isn't
drawn on the page cannot be invented.

Two bugs surfaced on the way, both caught by cell counts rather than by reading
the code:

**Phantom duplicate rows.** Requiring only top+bottom edges paired one row's
bottom with the *next* row's bottom — a 13.4 pt "cell" spanning the 1.9 pt gap
between stacked address rows. Nearly every address row appeared twice. Adding
the two side edges killed them, because the verticals stop at the real row
boundary.

**The first and last cell of every row vanished.** Row edges are stroked with
line caps, which leave the horizontal's endpoint up to 0.25 pt off the
vertical's centreline. An exact-key lookup missed the outer borders, so a
25-cell name row came back as 23 and Date of Birth collapsed to 2. Fixed with a
±0.75 pt tolerant search.

---

## Result

```
PAGE 1: 36 rows, 589 cells
PAGE 2: 28 rows, 357 cells
```

Shapes now match the printed form exactly:

| Field | Shape | Meaning |
|---|---|---|
| Date of Birth | `2+2+4` | dd / mm / yyyy, gaps preserved |
| Aadhaar Number | `12` | |
| Mobile | `3+10` | country code / number |
| Landline | `4+8` | STD / number |
| PIN / ZIP | `7` | |
| PAN (if any) | `10` | |
| Gender | `1+1+1` | tick boxes |
| Name rows | `25` | one character per box |

---

## Verified by looking, not by trusting

A systematic coordinate error would produce a subtly wrong government form —
the worst possible failure for this project. So every extracted cell was
stamped with a digit and rendered:

- 946 cells stamped across both pages
- every digit centred in its box
- Date of Birth reads `5 6 | 7 8 | 9 0 1 2` — correctly skipping both gaps
- gender ticks land beside Male / Female / Transgender
- free-text boxes (State, Country) and comb boxes (PIN) both correct

Cycling digits `0-9` rather than a constant means mis-ordered cells would also
have shown up. They didn't.

---

## What this step did not do

- Nothing is wired into the app yet. This step produced geometry only.
- Only pages 1–2 were extracted; pages 3–5 are instructions, not fields.
