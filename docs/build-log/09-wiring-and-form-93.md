# Step 9 — Wiring it in, and the form that no longer exists

**Session 2, Step 3**
**Date:** 12 August 2026

Steps 7 and 8 produced a working overlay driven by a Node harness. This step
puts it in front of the citizen, renames the template to the form that actually
exists, and verifies the whole thing through the real app.

**Two real bugs were found doing this, one of them shipping-blocking.**

---

## Form 49A → Form 93

Flagged in step 7, fixed here. Form 49A was withdrawn under the PAN 2.0 project
and replaced by **Form No. 93**. Our template still claimed to be 49A, which
means the app was naming a form the citizen cannot obtain.

| | Before | After |
|---|---|---|
| File | `pan-49a.json` | `pan-93.json` |
| `id` | `pan-49a` | `pan-93` |
| Name (en) | PAN Card Application (Form 49A) | PAN Card Application (Form 93) |
| Name (hi) | पैन कार्ड आवेदन (फॉर्म 49A) | पैन कार्ड आवेदन (फॉर्म 93) |

The `father_name` explanation also said "Form 49A asks for the father's
name…" and was updated.

**`49a` was deliberately kept in `ocrKeywords`.** Printed 49A forms are still
in circulation in every cyber-café and photocopy shop in the country. If
somebody photographs one, routing them to this template is the right answer —
the information collected is the same — so the old name stays as a recognition
hint even though nothing else refers to it.

`README.md` and `formmitra-specs.md` were updated. `03-form-templates.md` was
**not** rewritten: it is a record of what was true on 11 August. It carries a
pointer to this change instead.

---

## Bug 1 — the service worker was eating the DigiLocker login

The one that matters.

Workbox's `generateSW` answers **every navigation** with the cached
`index.html`. Its navigation route had no denylist, so once the service worker
was installed:

- clicking *Login with DigiLocker* → served the app shell instead of the
  provider
- the `/api/digilocker/callback?code=…` return trip → also the app shell

DigiLocker login could therefore **never complete in a production build**. Not
degraded — impossible.

```js
// vite.config.js
navigateFallbackDenylist: [/^\/api\//],
```

### Why nobody caught it

Look at how step 6 tested:

| Test | Server | Service worker | DigiLocker |
|---|---|---|---|
| Full flow, online | `npm run dev` | **disabled in dev** | tested ✓ |
| Offline flow | `npm run preview` | active | not tested |

Both suites passed. Neither ever ran DigiLocker *and* the service worker at the
same time, and the bug lives exactly in that intersection. The verification in
step 6 was honest about what it covered; the gap was in the matrix, not the
reporting.

This would have been found on stage at the internal hackathon.

---

## Bug 2 — PDFs were not precached

`globPatterns` covered `js,css,html,svg,png,json,wasm`. No `pdf`. The blank
official form would have been fetched from the network every time, so the
official-form output — the one artefact the citizen physically carries — would
have been the single thing in the app that did not work offline.

```js
globPatterns: ['**/*.{js,css,html,svg,png,json,wasm,pdf}'],
```

Precache went from 10 entries to 14 (1.46 MB). Verified: with the network off,
`fetch('/forms/form93.pdf')` returns all 665,642 bytes from cache.

---

## What the citizen now sees

The Done screen produces **two documents**, and the order carries the message:

1. **The real government form, filled** — headlined, bordered, downloaded
   first. "Print this one and hand it in."
2. **Your answers in easy language** — the old summary sheet, demoted to a
   record. "Keep this for yourself. It is not the form to submit."

Below them, the notes from step 8 grouped under headings that say what to *do*
about each:

- **Please check these before you submit** — how the address was split
- **You must still fill these by hand** — Post Office, residential status, AO
  code, mother's name, signature and photographs

Every one of these is spoken as well as shown. A list of caveats in small print
is useless to the person this app exists for.

Where a template has no official form mapped, the screen is exactly as before.
And if the overlay throws, it is caught separately so the citizen still gets
the summary sheet rather than an error screen.

---

## Verified through the real app

Headless Chromium against a production build and the real backend — not the
Node harness this time:

```
1. Consent, language, DigiLocker
  ok   DigiLocker consent page shown
  ok   profile pulled through
2. Open PAN Form 93
  ok   template is Form 93
3. Answer the questions
  ok   passed through confirm
4. Confirm -> checklist -> done
  ok   done screen reached
  ok   official form is the headline
  ok   summary demoted to a record
  ok   citizen told what is still blank
  ok   address assumption surfaced
  downloads: pan-93-official-form.pdf, pan-93-formmitra.pdf
  ok   official form downloaded
  ok   summary sheet downloaded
  ok   no console errors
5. Network OFF
  ok   service worker active
  ok   app loads with no network
  ok   official blank served from cache (665642 bytes)

15 passed, 0 failed
```

The downloaded `pan-93-official-form.pdf` was rasterised and checked by eye:
name, gender tick, date of birth, Aadhaar and address all sit correctly in the
official boxes, with DigiLocker supplying five of the nine fields.

### Three harness bugs worth recording

The app was right and the test was wrong three times, which is worth writing
down because each would have produced a *false* failure:

1. **`input[type="text"]` matched nothing.** The fill screen's `<input>` has no
   `type` attribute, only `inputMode`. The CSS selector never matched it.
2. **Choice questions do not auto-advance.** Picking an option *enables* the
   submit button. The harness clicked "Salary" eight times.
3. **"Everything is correct" is two different buttons** — the last question's
   and the confirm screen's — so the loop walked through confirm without
   noticing.

---

## Still open

- **Only PAN Form 93 has an official blank.** The other nine templates produce
  the summary sheet alone, exactly as before.
- **Address splitting remains the weak link.** DigiLocker gives one flat
  string; the split is a convention, flagged to the citizen every time. Real
  Aadhaar eKYC returns structured address components — if the backend surfaced
  those, the guessing disappears entirely.
- The header overflows at 412 px: "FormMitra" is clipped by the *Erase my data*
  button. Pre-existing, cosmetic, unrelated to this work.
- Voice still untested with a real microphone (carried over from step 6).
