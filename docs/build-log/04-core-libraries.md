# Step 4 — The four browser libraries

**Date:** 11 August 2026
**Files:** `frontend/src/lib/{validation,speech,ocr,pdf}.js`

These four modules are everything the app does *to* data. All of them run in
the browser with no network, which is what makes the offline claim true rather
than aspirational.

---

## `validation.js` — deterministic checks

A direct port of `backend/validation.py`, plus two additions the UI needs.

**`validateField(field, value, lang)`** returns `{ valid, value, error }`.
The returned `value` is the *cleaned* version — always store that, never the raw
input.

**`speakableValue(field, value)`** turns a stored value into something worth
hearing. This is a small function that matters a lot: a speech engine reading
`234567890124` says "two hundred thirty four billion..." which is useless for
checking your own Aadhaar number. So:

| Rule | Spoken as |
|---|---|
| `aadhaar` | `2 3 4 5, 6 7 8 9, 0 1 2 4` — grouped in fours, as people actually read it aloud |
| `mobile`, `pincode`, `bank_account` | digit by digit |
| `ifsc`, `pan` | character by character |
| `amount` | `1,80,000 rupees` — Indian digit grouping |

**Result:** 19/19 test cases match the Python implementation exactly, including
`31/02/2020` being rejected (JavaScript's `Date` silently rolls that over to
2 March, so the parser checks the round-trip).

---

## `speech.js` — Web Speech API

Four functions: `speak()`, `stopSpeaking()`, `listenOnce()`, and the two
normalisers below. Bhashini replaces the internals in V1 without changing any
caller.

**Capability flags** `canListen` / `canSpeak` are exported, because speech
*recognition* is Chrome/Edge only while *synthesis* is near-universal. **The app
must stay completely usable by typing.** Voice is an accelerator, never a
requirement — a demo laptop running Firefox must not produce a dead app.

Two details that cost real debugging time if you don't know them:

- `speechSynthesis.getVoices()` returns `[]` on first call and fills in later
  via a `voiceschanged` event. We await it, with a 1.2s timeout because some
  browsers never fire the event at all.
- Speech rate is set to **0.85**, deliberately slower than default. A government
  field name read at normal speed is genuinely hard for an elderly listener to
  follow.

### `normaliseSpoken(text, field)` — the messy part

Speech engines return numbers in wildly inconsistent shapes. All of these are
real forms the same Aadhaar number arrives in:

```
"2345 6789 0124"                              (digits with spaces)
"दो तीन चार पाँच छह सात आठ नौ शून्य एक दो चार"  (Hindi digit words)
"२३४५ ६७८९ ०१२४"                              (Devanagari numerals)
"double nine 8 7 6 5 4 3 2 1"                 ("double" for a repeat)
```

All four normalise to the right digit string. Devanagari numerals are mapped to
ASCII, number words are mapped through a lookup, and `double X` expands to
`X X`.

### The amount bug — worth reading

The first version of this handled amounts with the same "keep the digits" rule
as Aadhaar. That turned **"one lakh eighty thousand"** into **`1`** — a number
that passes validation cleanly and is wrong by a factor of 180,000.

That is exactly the failure mode FormMitra exists to prevent. A wrong income
figure gets a scholarship rejected weeks later, and the citizen never finds out
why. So amounts now get a proper Indian-numeral parser handling `hundred`,
`thousand`, `lakh`, `crore` and their Hindi equivalents (`सौ`, `हज़ार`, `लाख`,
`करोड़`):

```
"one lakh eighty thousand"  -> 180000
"एक लाख अस्सी हज़ार"          -> 180000
"नब्बे हज़ार"                 -> 90000
"one crore"                 -> 10000000
"some mumbled nonsense"     -> rejected, citizen is asked again
```

**The last line is the important one.** When the parser hits a word it does not
understand it returns nothing rather than guessing, so validation fails and the
question is repeated. Silence beats a confident wrong number on a form somebody
cannot read back.

> **Devanagari gotcha:** the first detection pass used `\b` word boundaries.
> JavaScript defines `\b` over ASCII word characters, so it **never fires around
> Devanagari** — the Hindi amounts silently fell through to the digit-stripping
> path and came out empty. It is now a token comparison. Watch for this any time
> you write a regex that has to work in Hindi.

### `matchChoice(text, field)` — and its bug

Citizens do not read options back word for word. Asked their gender they say
"महिला"; asked an account type they say "जन धन". So this looks for any option
whose label appears in what they said, in either language.

The first version had a genuinely dangerous bug: **saying "female" selected
Male**, because `"female".includes("male")` is true. A wrong gender recorded on
a government form, never shown to the citizen.

Now it runs three passes, strictest first:

1. **Exact match** on the value or either label.
2. **Whole-word containment** in either direction, scoring *all* options before
   choosing, longest matching label wins. Without the "score everything first"
   part, `अनुसूचित जनजाति` (ST) gets claimed by `अनुसूचित जाति` (SC) purely
   because SC is listed earlier.
3. **First significant word**, but only when that word belongs to exactly one
   option — `अनुसूचित` opens both SC and ST, so it is not allowed to decide.

**Result:** 18/18 across gender, account type, caste category and ration
category, in both languages, with unrecognised input correctly returning `null`.

---

## `ocr.js` — Tesseract.js

`scanForm(image, onProgress)` returns `{ text, matches, best }`.

**Preprocessing matters more than any Tesseract setting.** A photo taken in a
CSC is shadowed, slightly yellow and far larger than needed. Before OCR the
image is: capped at 1600px wide (bigger is slower, not more accurate),
converted to greyscale by Rec. 601 luma, then contrast-stretched 1.6× around
mid-grey. This is a handful of lines and improves results on phone photos more
than anything else available.

**English model only.** Form *headings* — the text identification relies on —
are printed in English even on Hindi forms, and adding the Hindi model doubles
the offline download for little gain. Revisit if field-survey photos disagree.

**Confidence floor of 0.15.** Below that the app shows a form chooser instead of
guessing. Filling the wrong form for somebody who cannot read the result is a
worse outcome than one extra tap.

The worker is created lazily and reused; `releaseOcr()` frees its ~4MB.

---

## `pdf.js` — pdf-lib

`buildFilledPdf(form, answers, lang, meta)` returns a `Blob`; `downloadPdf()`
saves it. Nothing is uploaded anywhere.

### The one significant design decision

**pdf-lib can embed a font but cannot *shape* text.** Devanagari requires
shaping — matras reorder around their consonant and conjuncts fuse into single
glyphs. Handing Hindi straight to pdf-lib produces output that is subtly wrong
in a way any Hindi reader spots instantly, on the single artefact the citizen
physically carries to a counter.

So each page is laid out on a **canvas**, where the browser shapes Devanagari
correctly, and pdf-lib wraps the rendering into a real A4 PDF (595.28 × 841.89pt
from a 1240 × 1754px canvas — A4 at 150 DPI).

**Trade-off, stated plainly:** the text is not selectable in the resulting PDF.
For a form that gets printed and handed over a counter this costs nothing, and
it buys guaranteed-correct rendering in every language we ever add — including
whichever one Bhashini brings in V1.

*(The Noto Sans Devanagari TTFs were copied into `frontend/public/fonts/` for a
possible future text-layer approach. They are not needed by the current path.)*

### What the PDF contains

- Form name in the citizen's language, with the English name underneath
- Issuing authority
- Every filled field, with a **✓ DigiLocker verified** mark on fields that came
  from the verified profile rather than being typed
- The document checklist as printed tick boxes to carry to the office
- A footer telling the citizen to check everything before submitting

Pages break automatically; long values wrap, and a single unbreakable value
(a long address, an account number) breaks by character rather than overflowing.

---

## Test summary

| Suite | Result |
|---|---|
| Validation rules (browser vs Python parity) | 19/19 |
| Spoken amount parsing | 12/12 |
| Choice matching, both languages | 18/18 |

Two bugs were found and fixed by these tests — the lakh/thousand amount bug and
the female→Male bug. Both would have silently written wrong data onto a
government form. Neither was visible by reading the code.
