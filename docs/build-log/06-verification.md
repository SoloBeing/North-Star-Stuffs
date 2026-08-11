# Step 6 — End-to-end verification

**Date:** 11 August 2026

Everything below was actually executed, not reasoned about. Screenshots of each
screen are in `docs/screenshots/`, along with a real generated PDF
(`sample-filled-form.pdf`).

---

## How it was tested

There is no Chrome or Chromium on this machine — **only Firefox** — and the
Claude-in-Chrome extension is not connected. So a headless Chromium was
installed via Playwright and used to drive the real app against the real
backend. Two scripts were written:

1. **Full flow** against the dev server, exercising all nine steps.
2. **Offline flow** against a production build served by `vite preview`, with
   the browser's network switched off at the context level.

Both scripts live in the session scratchpad rather than the repo — they were
verification tools, not a test suite the team has to maintain. If you want them
kept, say so and they can be moved into `frontend/tests/`.

---

## Result 1 — full flow, online

```
1. Consent screen
  ok   app name in Hindi
  ok   consent heading
  ok   consent switches to English

2. Home screen
  ok   form picker heading
  ok   DigiLocker login card

3. DigiLocker login
  ok   DigiLocker consent page
  ok   sandbox banner is honest
  ok   profile name pulled through
  ok   verified badge

4. Form overview + explanations
  ok   start button
  ok   prefill banner
  ok   explanation text appears

5. Guided fill
  ok   invalid Aadhaar blocked with Hindi reason
  ok   did not advance past invalid answer
  reached confirm after 6 questions

5b. Edit one answer from confirm
  ok   bad IFSC rejected with a Hindi reason

6. Confirm
  ok   confirm heading
  ok   corrected IFSC shown
  ok   DigiLocker value carried through

7. Document checklist
  ok   checklist heading
  ok   DigiLocker cross-reference works

8. PDF generation
  downloaded: nsp-scholarship-formmitra.pdf
  ok   done screen

Full 9-step flow completed with no errors.
```

**The number worth putting on a slide:** the NSP form has 11 fields, and the
citizen was asked **6 questions**. DigiLocker filled the other five silently.

Zero console errors and zero uncaught exceptions across the whole run.

---

## Result 2 — offline

Production build, service worker installed on first visit, then the network cut.

```
1. First visit (online) — service worker installs
  service worker active: true
  cached 10 entries

2. Network OFF
  ok   app loads with no network
  ok   offline banner shown to citizen

3. Template flow, offline
  ok   form template opened (bundled, not fetched)
  ok   pre-written explanation available offline
  ok   validation ran offline, reached confirm
  ok   checklist works offline

4. PDF generation, offline
  downloaded offline: ration-card-formmitra.pdf
  ok   done screen reached offline

  (0 network requests were refused while offline)

Entire template flow works with the network switched off.
```

**"0 network requests were refused" is the strongest line in this document.**
It does not mean requests failed and were handled gracefully — it means nothing
even attempted to reach the network. Everything was already on the device.

This is the demo to do live: fill a ration card form with Wi-Fi off, in front
of the judges.

---

## Bugs found and fixed during verification

Four real bugs. None were visible by reading the code.

### 1. "one lakh eighty thousand" became ₹1
The amount normaliser kept digits and discarded words, so a spoken income of
₹1,80,000 was recorded as **₹1** — a number that passes validation cleanly and
is wrong by a factor of 180,000. A wrong income figure gets a scholarship
rejected weeks later and the citizen never learns why. Fixed with a proper
Indian-numeral parser; unparseable input is now rejected rather than guessed.

### 2. Saying "female" selected Male
`"female".includes("male")` is true. A wrong gender written onto a government
form, never shown to the citizen. Fixed with exact-match-first, then whole-word
matching that scores every option before choosing.

### 3. The OAuth redirect only worked on one spelling of localhost
`DIGILOCKER_REDIRECT_URI` was hardcoded to `http://127.0.0.1:5173`. Vite binds
`localhost` (IPv6 `::1`), so opening the app the obvious way and clicking
DigiLocker login gave `ERR_CONNECTION_REFUSED`. Even had it connected,
`localhost` and `127.0.0.1` are separate origins, so consent and language in
localStorage would have been lost mid-login.

Fixed by making the mock provider and the callback redirect **relative**, so the
browser stays on whichever origin it started from. `FORMMITRA_FRONTEND_URL` is
now only needed for a real cross-host production deploy.

This one would have bitten someone at the internal hackathon.

### 4. The PDF had an orphan second page
The footer flowed with the content, so whenever content ended near the page
boundary it produced a second sheet holding two lines of small print. That looks
like a printing error to somebody about to hand the form across a counter, and
wastes a sheet they may be paying for. The footer now sits in the bottom margin
band, drawn directly rather than through the flow helpers — which was the actual
trap, since those helpers call `ensure()` and start the very page the fix exists
to avoid.

---

## Test totals

| Suite | Result |
|---|---|
| Validation rules (browser ↔ Python parity) | 19/19 |
| Spoken amount parsing | 12/12 |
| Choice matching, both languages | 18/18 |
| Form template schema | 10/10 clean |
| OCR form identification | 11/11 (incl. junk correctly rejected) |
| Full flow, online | all steps pass |
| Full flow, offline | all steps pass |
| DigiLocker OAuth (incl. code replay, logout) | all pass |

---

## Known gaps

1. **Voice was not tested with a real microphone.** Headless Chromium has no
   audio input. The recognition wiring, normalisation and choice matching are
   unit-tested, but nobody has actually spoken to this app yet. **Do that before
   the demo** — it is the single largest remaining unknown.

2. **Firefox cannot do speech recognition.** This machine has only Firefox. The
   app degrades correctly (the mic button disables, typing still works) but the
   voice demo **requires Chrome or Edge**. Install Chrome before the hackathon,
   and do not let a teammate demo on a Firefox laptop.

3. **OCR was not tested on a real photograph.** Form identification is verified
   against simulated OCR text with realistic noise, and the Tesseract pipeline
   runs, but no actual phone photo of an actual government form has gone through
   it. Take five photos during the field survey and run them.

4. **Bhashini is not integrated** — V1 scope, as planned.

5. **Generic mode is a stub** — V1 scope. The endpoint exists and returns 503
   with an honest message when unconfigured.
