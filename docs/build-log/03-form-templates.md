# Step 3 — The 10 form templates

**Date:** 11 August 2026
**Owner in the team split:** AI / Integrations (explanation cache) + Research
**Files:** `frontend/src/data/forms/*.json`, `frontend/src/data/forms/index.js`

---

## Why this step is the actual product

It is tempting to think the clever part of FormMitra is the OCR or the voice.
It is not. Those are libraries anyone can install. **The templates are the
product** — they are the thing that took human effort, the thing a competing
team cannot copy in a weekend, and the thing that makes the hallucination
answer true.

Every explanation in these files was written by hand. No model generated any of
them. That is precisely why we can tell judges that template mode cannot
hallucinate: there is no model in the loop to hallucinate *with*.

---

## What was built

| Form | Fields | From DigiLocker | Asked by voice | Documents |
|---|---:|---:|---:|---:|
| NSP Scholarship | 11 | 5 | 6 | 6 |
| PAN Card (Form 49A) | 9 | 5 | 4 | 4 |
| Ration Card | 9 | 4 | 5 | 5 |
| Pension Life Certificate | 8 | 2 | 6 | 4 |
| Bank Account Opening (KYC) | 11 | 5 | 6 | 4 |
| Ayushman Bharat (PM-JAY) | 9 | 5 | 4 | 4 |
| Income Certificate | 10 | 4 | 6 | 5 |
| Caste Certificate | 10 | 4 | 6 | 6 |
| LPG Subsidy (PAHAL) | 9 | 2 | 7 | 4 |
| RTI Application | 8 | 3 | 5 | 3 |
| **Total** | **94** | **39** | **55** | **45** |

**39 of 94 fields disappear entirely when the citizen logs in with DigiLocker.**
That is the number to put on a slide — it is the whole "why DigiLocker" argument
in one figure.

---

## The template schema

```jsonc
{
  "id": "ration-card",
  "icon": "🌾",
  "name":    { "en": "...", "hi": "..." },
  "issuer":  { "en": "...", "hi": "..." },   // which office actually issues it
  "summary": { "en": "...", "hi": "..." },   // one line, shown on the home grid

  "ocrKeywords": ["ration card", "food security", ...],  // used to identify a scan

  "documents": [                              // powers the checklist screen
    { "en": "Aadhaar card", "hi": "आधार कार्ड", "digilockerType": "ADHAR" }
  ],

  "fields": [{
    "id": "head_name",
    "label":    { "en": "...", "hi": "..." },
    "rule":     "name",                       // which validation rule applies
    "source":   "digilocker",                 // or "ask"
    "profileKey": "name",                     // only when source is digilocker
    "question": { "en": "...", "hi": "..." }, // spoken aloud during guided fill
    "explain":  { "en": "...", "hi": "..." }, // spoken when the citizen taps the field
    "example":  "Sunita Devi",
    "options":  [ ... ]                       // only when rule is "choice"
  }]
}
```

### `question` vs `explain` — the distinction that matters

- **`question`** is what the app *asks*: short, direct, answerable out loud.
  *"What is your PIN code?"*
- **`explain`** is what the app says when the citizen *taps the field*: what
  this actually means and what goes wrong if you get it wrong.
  *"Six digits. A wrong PIN code is the most common reason a PAN card never arrives."*

Explanations were written to answer the question the citizen is really asking,
which is almost never "what is this field" but rather **"what happens to me if I
get this wrong?"** Some examples of that in practice:

- **NSP annual income** — says outright that the number must match the income
  certificate exactly or the application is rejected, and that most NSP schemes
  need income under ₹2,50,000.
- **Bank nominee** — explains that without a nominee the family may need a court
  order to recover the money, and that naming one is free and reversible.
- **Ration card head of family** — explains that the law normally makes the
  eldest adult woman the head of family.
- **Zero balance account** — states plainly that every bank *must* offer it and
  that there is no penalty for an empty account. Counter staff frequently do not
  volunteer this.
- **RTI information sought** — warns not to ask "why" questions, because the Act
  compels disclosure of records, not justifications. This is the single most
  common reason first-time RTI applications get refused.
- **LPG consumer name** — flags the exact trap where the connection is in the
  husband's name but the bank account is in the wife's, and the subsidy silently
  never arrives.

### Every field carries a `rule`

Ten of the twelve validation rules from step 02 are used, plus a `choice` rule
handled by the UI (the citizen picks from options rather than speaking freely).
Nothing is free text unless it genuinely has to be.

---

## Form identification from a scan

`identifyForm(ocrText)` in `index.js`. The approach is deliberately simple:

> Count how many of each template's keywords appear in the OCR text, weighting
> multi-word phrases higher (a match on `"national scholarship portal"` scores 3,
> a match on `"pan"` scores 1). Return matches sorted best-first with a
> confidence between 0 and 1.

**Why not a model?** Because when this misidentifies a form, a first-year
student needs to be able to open the JSON, read the keyword list, and see
exactly why. A model would give better accuracy on paper and be undebuggable in
a demo hall at 9am. Reproducibility beats cleverness here.

### Verification

Tested against 11 simulated OCR outputs, including deliberately introduced
Tesseract-style noise (`Educaton`, `Detai1s`, `1` for `l`):

```
NSP form           -> nsp-scholarship            78%   OK
PAN 49A            -> pan-49a                    77%   OK
Ration card        -> ration-card                58%   OK
Life certificate   -> pension-life-certificate   58%   OK
Bank KYC           -> bank-account-opening       85%   OK
Ayushman           -> ayushman-card              75%   OK
Income cert        -> income-certificate         62%   OK
Caste cert         -> caste-certificate          64%   OK
LPG                -> lpg-subsidy                75%   OK
RTI                -> rti-application            57%   OK
Junk text          -> no match                    —    OK

11/11 identified correctly
```

There are **no keyword collisions** between templates — no keyword appears in
two forms' lists. Runner-up scores stay at or below 7%, so the top match is
never close to ambiguous.

The junk case matters as much as the others: unrecognised text returns *no
match* rather than a wrong guess. That is what routes a citizen to generic mode
in V1 instead of filling the wrong form.

---

## Schema validation

A checker was run across all 10 files verifying: no duplicate field ids, every
`rule` exists in the rule table, every `label` / `question` / `explain` has
**both** `en` and `hi` and neither is empty, every `digilocker` field names a
real profile key, every `choice` field has options with all three keys, and no
non-choice field carries stray options.

Result: **all clean**, 10 templates, ids unique.

Worth re-running that check whenever anyone edits a template.

---

## If you want to add an 11th form

1. Copy the closest existing JSON in `frontend/src/data/forms/`.
2. Change `id`, `icon`, `name`, `issuer`, `summary`.
3. Pick `ocrKeywords` that are **distinctive** — phrases printed on that form and
   on no other. Check they collide with nothing already in use.
4. Write the fields. For each one ask yourself: *what goes wrong for this person
   if they fill it in wrong?* That is the explanation.
5. Add the import to `index.js` and to the `FORMS` array.
6. Re-run the schema check.

Both languages are mandatory. A field with an English explanation and no Hindi
one is worse than no field at all, because the app will speak silence at
someone who cannot read the screen.

---

## Known gaps

- **Hindi and English only.** The third language (Bhashini) is V1 scope.
- **Explanations are not legally reviewed.** They are written carefully and in
  good faith, but nobody on the team is a lawyer. For the Grand Finale it would
  be worth having a CSC operator or a tehsil clerk read through them — that is
  also excellent material for the field-survey slide.
- **State variation is not modelled.** Ration card rules and caste lists differ
  by state; the templates describe the common national case and say so where it
  matters.
