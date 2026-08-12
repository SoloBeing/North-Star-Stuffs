# Step 10 — Sourcing official blanks for the other nine forms

**Session 2, Step 4 — research only, nothing built**
**Date:** 12 August 2026

PAN Form 93 now gets stamped into the government's own PDF (steps 7–9). The
obvious next question is how far that extends to the other nine templates.

This step answers it. **No code was written and no PDFs were committed** — the
downloads live in a temporary session scratchpad, so everything needed to fetch
them again is recorded below.

---

## The short answer

Of the nine remaining templates, **one** is ready to do next session.

| Template | Official blank? | Usable? |
|---|---|---|
| LPG subsidy (PMUY) | yes | **ready — same technique as PAN** |
| Caste certificate | yes (Rajasthan) | different technique needed |
| Ration card | yes (Rajasthan) | scanned image |
| Income certificate | yes (Rajasthan) | scanned image |
| Bank account opening | yes (SBI) | file is corrupt |
| NSP scholarship | **no form exists** | — |
| Ayushman (PM-JAY) | **no form exists** | — |
| Pension life certificate | **no form exists** | — |
| RTI application | **no prescribed form** | different opportunity |

Four of nine have no paper form at all. That is not a gap in our research; it is
what the schemes are. Writing it down matters more than working around it.

---

## What we collected

All fetched 12 August 2026. Sizes and properties measured, not assumed.

### 1. LPG — Pradhan Mantri Ujjwala Yojana KYC ✅

```bash
curl -L -A "Mozilla/5.0" -e "https://www.pmuy.gov.in/ujjwala2.html" \
  -o lpg-pmuy-kyc.pdf "https://www.pmuy.gov.in/documents/KYC.pdf"
```

| | |
|---|---|
| Title | *Pradhan Mantri Ujjwala Yojana — UJJWALA KYC Application, Version 5.0* (IOC / BPC / HPC) |
| Size | 458,536 bytes, 2 pages |
| Page | 595.276 × 841.89 pt (A4 — identical to Form 93) |
| AcroForm | none |
| Text layer | 3,191 characters on page 1 — real, Unicode |
| Vector strokes | 2,279 on page 1 |

**This is the same shape of problem as PAN Form 93 and the step 7 pipeline
should work on it unchanged.** A4, no AcroForm, dense vector strokes, a readable
text layer for labelling slots.

`https://www.pmuy.gov.in/documents/Ujjwala-KYC.pdf` is the **same document**
under a second filename — different bytes, byte-identical extracted text. Use
one; do not treat them as two forms.

### 2. Caste certificate — Rajasthan, General category ⚠️

```bash
curl -L -A "Mozilla/5.0" -o caste-cert-raj-general.pdf \
  "https://emitraapp.rajasthan.gov.in/emitrashared/USER_MGMT_OLD_DOCS/guidelineEform/GAndE_1517909643422.pdf"
```

139,486 bytes, 3 pages, 944 characters of text, **28 vector strokes**.

Two problems, both real:

**It is not a boxed form.** 28 strokes is nowhere near a comb grid. It is a
ruled form — `जन्म दिनांक*: _____/______/_________` — so there are no cells to
centre characters in. It needs *baseline placement* (put text on a line at x,y)
rather than the per-cell writer we have.

**The Hindi text layer is legacy-encoded.** `pdftotext` returns
`tkfr izek.k i=`, which is `जाति प्रमाण पत्र` in a Krutidev-style non-Unicode
font. The glyphs are Devanagari; the character codes are Latin. So the
label-matching used in step 7 to name slots **will not work** — slots would have
to be identified by position alone, or by the mojibake string treated as an
opaque key.

### 3. Ration card — Rajasthan NFSA ⚠️ scan

```bash
curl -L -A "Mozilla/5.0" -e "https://food.rajasthan.gov.in/Form_Download.aspx" \
  -o ration-nfsa-rajasthan.pdf "https://food.rajasthan.gov.in/Docs/NFSA_Application_Form.pdf"
```

93,284 bytes, 6 pages, 612 × 1008 pt (**not A4**), no AcroForm,
**0 text characters, 0 vector strokes, 1 image per page.**

It is a scan. There is no geometry in the file to read.

### 4. Income certificate — Rajasthan ⚠️ scans, and neither is canonical

```bash
curl -L -A "Mozilla/5.0" -o income-cert-raj-minority.pdf \
  "https://minority.rajasthan.gov.in/directorate/PdfUpload/Income%20Certificate.pdf"
curl -L -A "Mozilla/5.0" -o income-cert-raj-janaadhaar.pdf \
  "https://janaadhaar.rajasthan.gov.in/content/dam/doitassets/janaadhaar/PDF/News/Annual%20Income%20format.pdf"
```

1,592,339 bytes (4 pages, A4) and 2,316,913 bytes (5 pages, 612 × 1008).
Both: 0 text, 0 strokes, 1 image per page — **scans**.

Worse than that: these are *departmental* income-certificate forms (Minority
Affairs; Jan Aadhaar), not the canonical tehsil form a citizen is given. Using
either would be putting a citizen's data on the wrong department's paper.

Every non-scan hit for this form during research came from third-party
aggregator sites (`mahadevemitra.com`, `rajasthanbuzz.in`, `emitraformpdf.com`).
**Those were deliberately not used.** A re-uploaded government form from an ad
site cannot be trusted to be current or unaltered, and this is the one artefact
the citizen hands across a counter.

### 5. Bank account opening — SBI ❌ corrupt

```bash
curl -L -A "Mozilla/5.0" -o bank-sbi-aof-en.pdf \
  "https://sbi.bank.in/documents/16012/38550822/241123-Common+Deposit+Account+Opening+Form_+English.pdf"
```

3,409,203 bytes (English) and 4,354,189 bytes (Hindi) both download as valid
`%PDF` files but are **structurally broken**:

```
Syntax Error: Invalid XRef entry 101
Syntax Error: Top-level pages object is wrong type (null)
```

`mutool clean -d -i -f` repairs the xref but the result still yields 0 text and
0 strokes, so there is nothing usable inside either.

Separately: **there is no national bank account opening form.** RBI and IBA set
KYC *requirements*, not a common form; every bank has its own. Picking SBI is a
product decision, not a technical one.

---

## The four with no form at all

Not a research failure — these schemes genuinely have no paper form to fill.

| Scheme | Why | Source |
|---|---|---|
| **NSP scholarship** | Fully digital. One Time Registration (14-digit OTR from Aadhaar) then the whole application, upload and verification happen online. No downloadable PDF. | scholarships.gov.in |
| **Ayushman PM-JAY** | Registration is online at beneficiary.nha.gov.in or in person at a CSC. No application form is published. | nha.gov.in |
| **Pension life certificate** | Jeevan Pramaan is a *biometric* digital life certificate. The whole point of the scheme is that it replaced the paper form. | jeevanpramaan.gov.in |
| **RTI application** | The central government has **not prescribed a format**. An RTI can be made on plain paper. Some states prescribe one; most do not. | rtionline.gov.in |

For the first three, the summary sheet we already generate is the correct and
only sensible output.

### RTI is not a dead end — it is the opposite

Because RTI has **no prescribed form and plain paper is legally sufficient**,
FormMitra does not need an overlay. It can generate the finished application
itself, and that document *is* a valid submission — not a worksheet to copy
from.

This is the strongest version of the whole idea and it is available without any
geometry work at all: the citizen speaks their question in Hindi, and gets a
correctly addressed, correctly formatted RTI application ready to sign and post.
Worth considering ahead of the harder overlays.

---

## What we can actually do, ranked

**1. LPG (PMUY) — do this first.** A4, vector, dense strokes, Unicode text
layer. The step 7 extractor and the step 8 renderer should apply with no new
technique. Realistically a session's work including verification.

**2. RTI — generate rather than overlay.** No geometry, no blank PDF, no
coordinate extraction. Produces a genuinely submittable document. Arguably
higher value per hour than anything else on this list.

**3. Caste certificate — needs a second writer.** Add baseline placement
(text on a ruled line) alongside the existing per-cell writer, and identify
slots by position because the legacy font makes labels unreadable. New
technique, but it generalises: most state forms are ruled, not boxed.

**4. Scanned forms (ration card, income certificate) — needs image-based
detection.** No vector data exists, so lines would have to be recovered from
pixels: rasterise at a fixed DPI, find horizontal and vertical runs with
morphological operations, then map pixel coordinates back to PDF points. That
is a genuinely different pipeline and should not be started casually. The
cheaper move is to look harder for a vector-born source first.

**5. Bank account opening — blocked on a usable file.** Try other SBI URLs
(several older ones surfaced), try Ghostscript repair, or pick a different bank.
Also needs a product decision about which bank to support at all.

---

## Decisions needed before next session

- **Which state?** Ration card, income and caste certificates are state forms.
  Rajasthan was used here only because the mock DigiLocker profile is a Jaipur
  address. Supporting one state well beats supporting none properly, but it
  should be a deliberate choice.
- **Which bank**, if bank KYC is worth doing at all.
- **Is RTI-by-generation worth jumping the queue?** It is less work and produces
  a submittable document rather than a printable one.

---

## Working from a scan, and writing forms ourselves

Two techniques get proposed whenever an official vector PDF is missing. Both
have hard limits, and neither is a general answer.

### Technique A — recover the boxes from pixels

Rasterise the scan, find the rules with morphological operations, map pixel
coordinates back to PDF points, then stamp as usual.

It can be made to work. These are the reasons it is not a drop-in replacement
for step 7:

**1. The coordinates stop being ground truth.** With a vector PDF the box edge
*is* the data, exact to a hundredth of a point. From a scan every edge carries a
detection error of a pixel or two — at 150 DPI that is ±0.5–1 pt. A 15 pt cell
absorbs that; a tight one does not, and the error is invisible until someone
looks at the printed page.

**2. Skew.** Scans are almost never square to the page. A rotation of 0.3° —
undetectable by eye — drifts 2.6 pt across a 500 pt row, which is enough to sit
a character visibly off its baseline or drop it into the row below. Deskew has
to happen before detection, and has to be right.

**3. There is no text layer, so there is nothing to name the slots with.** Step
7 labelled 39 slots automatically by reading the printed label to the left of
each row. A scan has no text, so labelling means either OCR of a form's small
print — unreliable, worse in Devanagari — or naming all of them by hand. The
hand-labelling is exactly the manual work the vector pipeline existed to avoid.

**4. Line detection finds every rectangle, not the fields.** Logos, table
borders, layout frames and the page edge all look like boxes. The vector version
could demand four genuinely drawn edges; on a raster everything is edges.

**5. Underscore fields are invisible to it.** `जन्म दिनांक: ____/____/______` is
a run of *text glyphs*, not a drawn line. Line detection will not see a field
there at all, though a human obviously does.

**6. Broken and faint rules.** Photocopied forms have gaps in their lines.
Morphological closing repairs them and simultaneously merges cells that should
have stayed separate.

**7. The output is a photocopy.** Overlaying onto a scan means the citizen
prints an image of a form with crisp text on top. It is bigger, it looks
photocopied, and a counter clerk may treat it as one. The 2.3 MB income scan is
a multi-megabyte download per submission.

**8. Acceptance risk.** With a vector original we reproduce the department's
current form exactly. With a scan we reproduce a photocopy of unknown vintage,
with no revision information in the file to check it against.

### Photographing a form is not a route to filling it

Worth stating plainly, because it sounds like it should work and the app already
has a camera.

If a citizen photographs the form they are holding, overlaying onto that photo
produces **a printed photograph of a form** — skewed, shadowed, and worse than
what they already have in their hand. Perspective distortion needs a four-point
homography, and lighting, glare and paper curl all still apply.

Photographing a form is useful for exactly one thing, which the app already
does: working out *which* form it is. After that, fill a clean official blank —
never the photo.

### Technique B — write the document ourselves

**Fit when no format is prescribed.** RTI is the clear case: the Act does not
mandate a form, plain paper is sufficient, so a document we generate *is* the
real submission. Nothing to overlay, nothing to source, no geometry.

**Not fit for a statutory form, and this is not a close call.** Form 93 exists
under Rule 158. The NFSA ration card, income and caste certificates are
prescribed by their departments. Recreating one of those ourselves means:

- it is not the prescribed form, so it can be rejected outright, and
- we would be producing a lookalike of an official government document,
  which is not a thing this project should do at any level of fidelity.

The test is simple. **If it carries a form number, a `[See rule …]` citation, a
serial number or a barcode, we do not draw it — we fill the department's own
copy or we produce a summary sheet instead.**

**For online-only schemes, the honest output is a preparation sheet.** NSP,
Ayushman and Jeevan Pramaan cannot be submitted on paper at all, so there is no
form to produce. The summary sheet we already generate — the citizen's answers,
in their language, with the document checklist — is the correct deliverable. It
tells them exactly what to type or carry to the CSC. That is not a fallback; for
those three it is the whole job.

### Fitness, per document

| Document | Overlay (vector) | Overlay (scan) | Write it ourselves |
|---|---|---|---|
| PAN Form 93 | **done** | — | no — statutory (Rule 158) |
| LPG PMUY KYC | **ready** | — | no — prescribed by the OMCs |
| Caste certificate (Raj) | needs line writer + positional slots | — | no — statutory |
| Ration card (Raj) | no vector data | possible, 6 pages, non-A4 | no — statutory (NFSA) |
| Income certificate (Raj) | no vector data | possible, but we lack the canonical form | no — statutory |
| Bank account opening (SBI) | file corrupt | possible if a clean scan is found | no — the bank's own form |
| NSP scholarship | no form exists | — | no — nothing is submitted on paper |
| Ayushman (PM-JAY) | no form exists | — | no — online / CSC only |
| Pension life certificate | no form exists | — | no — biometric by design |
| RTI application | no form exists | — | **yes — plain paper is legally sufficient** |

Read down the last column: **exactly one document should ever be written by
us**, and it is the one with no prescribed form. That is the rule, not a
coincidence.

### Deciding for a form we have not looked at yet

In order — stop at the first answer that settles it:

1. **Is a format prescribed at all?** If not, generate it (RTI). If yes,
   continue — and never draw it ourselves.
2. **Is it submitted on paper?** If not, the summary sheet is the deliverable.
3. **Does the official PDF have an AcroForm?** `pdfinfo | grep Form`. If yes,
   fill the fields — no geometry needed. (None of ours do so far.)
4. **Is it vector or a scan?** `pdftotext` returning nothing plus zero
   `stroke_path` in `mutool draw -F trace` means a scan. Vector → step 7
   applies. Scan → weigh Technique A against finding a better source, and
   look for a better source first.
5. **Boxed or ruled?** Dense strokes mean comb cells; a handful means ruled
   lines needing baseline placement.
6. **Is the text layer Unicode or legacy?** Mojibake like `tkfr izek.k i=`
   means slots cannot be labelled from the text and must be positional.
7. **National or state-specific?** If state, that is a product decision before
   it is an engineering one.

---

## Things learned about fetching government PDFs

Recording these because they cost time and will cost it again:

- **`protean-tinpan.com` serves a React shell for every path.** A `200` with
  `content-type: text/html` and `<!doc` as the first bytes is a dead link
  wearing a success code. Always check the magic bytes.
- **Some hosts require a `Referer`.** Form 93 and the Rajasthan NFSA form both
  return HTML without one and the real PDF with one.
- **`incometaxindia.gov.in` returns 403 to curl** regardless of user agent.
- **Official portals rename and renumber without redirects.** Form 49A did not
  become a 404; it became a React page that looks like a working site. The only
  reliable check is opening the file.
- **Aggregator sites are the top search results for nearly every state form.**
  They are not sources.
