# Step 5 — The eight screens

**Date:** 11 August 2026
**Owner in the team split:** Frontend Devs ×2
**Files:** `frontend/src/App.jsx`, `frontend/src/screens/*.jsx`,
`frontend/src/components/ui.jsx`, `frontend/src/lib/i18n.js`

Screenshots of every screen: `docs/screenshots/`

---

## The flow

```
consent   → DPDP consent + language, before any data is touched
home      → DigiLocker login, scan button, grid of 10 forms
scan      → camera → Tesseract → identify → confirm the guess
overview  → tap any field to hear what it means
fill      → one voice question at a time, validated
confirm   → every answer read back aloud
checklist → documents to carry, cross-referenced with DigiLocker
done      → pdf-lib builds the PDF, saved to the device
```

`App.jsx` holds this as plain React state. No router: the flow is linear, a
back button is the only navigation, and a URL bar means nothing to our users.

**Answers live in component state and nowhere else.** Never localStorage, never
a server. Closing the tab genuinely destroys them, which is what the consent
screen promises. Only the language and the consent flag are persisted.

---

## Design rules, and why

Everything in `components/ui.jsx` follows the same four rules:

| Rule | Why |
|---|---|
| **56px minimum tap target**, 64px for primary buttons | Elderly users, reduced fine motor control, a phone they did not choose. A 40px button is one they cannot reliably hit |
| **18px text floor**, questions at 24px | The spec's accessibility target. Nothing goes below it, anywhere |
| **One action per screen** | Nothing competes with the thing you are meant to do next |
| **Speak button on every screen** | The primary user cannot read the screen. Every heading and explanation can be heard |

Colours are high-contrast only — these phones get used in daylight, outside a
bank, on a cheap LCD.

---

## Screen notes

### Consent
Consent comes **before** anything is touched, per the DPDP Act — not buried in
settings. It doubles as the language chooser, because choosing your language is
the one thing a citizen can do before they can read anything else.

The three privacy promises are stated in plain language and can be heard aloud.

### Home
The DigiLocker card is the highest-value action, so it sits at the top. Once
signed in it becomes a green verified card showing the name, DOB and PIN that
will be auto-filled.

When offline, the login button disables itself and says *"Login needs internet —
everything else works without it"* rather than failing silently.

### Scan
Uses a plain `<input type="file" capture="environment">`, **not** `getUserMedia`.
That gets the phone's own camera app — which citizens already know, which
handles focus and flash properly, and which needs no permission dance. A custom
viewfinder would demo better and work worse in a CSC.

While OCR runs it says *"This is happening on your phone — the photo is not
being sent anywhere."*

If confidence is below 0.15 it shows the form list instead of guessing.

### Overview — the screen that replaces the ₹50 agent
Every field is tappable and expands to its pre-written explanation, with a
speaker button. Three counters at the top: total fields, how many DigiLocker
already filled, how many we will ask.

### Guided fill
One question per screen. The question is **spoken automatically on arrival**,
because the citizen may not be able to read it. A large mic button, and beneath
it a text box that is always live — voice is an accelerator, never a
requirement.

A rejected answer is **spoken aloud in the citizen's language**, not just shown
as a red border to someone who cannot read the message.

Choice fields become large tappable option buttons and also accept a spoken
answer through `matchChoice`.

### Confirm
Reads every answer back in the form the citizen can actually check — an Aadhaar
number comes back as *"2 3 4 5, 6 7 8 9, 0 1 2 4"*, not as a quarter-trillion.
Tapping any answer jumps back to just that one question and returns here.

### Checklist
Cross-references the form's required documents against the citizen's DigiLocker
issued-document list. For the NSP form with our mock citizen, **3 of 6
documents are already held** — so they are told to show them from the app
rather than being sent to a tehsil office for something they already have.

### Done
Builds the PDF in the browser and saves it. Carries a standing warning that
this is a printable form, **not** an online submission.

---

## Bundle size

The first build put everything in one 765KB chunk. That is a bad number for a
₹6,000 phone on a 2G connection, so Tesseract and pdf-lib are now dynamic
imports — neither is needed until the citizen actually scans or finishes.

| | Initial JS | Gzipped |
|---|---|---|
| Before | 765 KB | 278 KB |
| After | 328 KB | **95 KB** |

pdf-lib (420KB) now loads only on the final screen. Tesseract loads only if
someone scans.

---

## Two things to watch

1. **The language toggle uses `aria-pressed`, the same as choice option
   buttons.** This confused an automated test into switching the UI language
   mid-flow. It is not a user-facing bug, but if you add tests, scope option
   selectors to the screen body (`.fm-rise`) rather than the whole page.
2. **`Header` only shows the "erase my data" button once there is data.**
   Deliberate — an erase button with nothing to erase is noise.
