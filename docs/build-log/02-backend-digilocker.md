# Step 2 — Backend API and DigiLocker OAuth

**Date:** 11 August 2026
**Owner in the team split:** Backend Devs ×2
**Files:** `backend/digilocker.py`, `backend/validation.py`, `backend/main.py`, `main.py`

---

## The DigiLocker flow, in plain terms

This is the part judges will ask about, so it is worth understanding properly.

```
  Citizen taps "Login with DigiLocker"
        │
        │  1. Browser asks OUR server for a login URL
        ▼
  GET /api/digilocker/authorize
        │     server generates: state + PKCE verifier/challenge
        │     returns DigiLocker's authorize URL
        ▼
  2. Browser is sent to DigiLocker's own page
        │     Citizen types Aadhaar + OTP HERE.
        │     ── FormMitra never sees either one ──
        ▼
  3. DigiLocker redirects back with a short-lived ?code=...
        ▼
  GET /api/digilocker/callback
        │  4. OUR SERVER swaps code -> access token using the client secret.
        │     This is the one step a browser cannot do, and the only
        │     reason this backend exists.
        ▼
  5. Server keeps the token, sends the browser back a session id only.
        ▼
  Profile (name / DOB / gender / address) auto-fills every form.
```

**Why PKCE?** It stops an attacker who intercepts the `code` from redeeming it,
because redemption also requires the secret verifier that never left our server.
DigiLocker's Partner API expects `S256`, which is what we send.

**Scope requested:** `avs_parent files.issueddocs` — profile fields plus the
*list* of issued documents. Deliberately **not** document contents. This matches
the spec's non-goal: "No downloading of actual DigiLocker documents".

---

## Mock mode

We do not have partner credentials yet (the application takes 3–7 days). So:

> If `DIGILOCKER_CLIENT_ID` and `DIGILOCKER_CLIENT_SECRET` are unset, the server
> automatically runs a **mock provider** that performs the identical redirect →
> code → token dance in-process.

`GET /api/digilocker/mock/consent` serves a look-alike DigiLocker sign-in page,
with the Aadhaar and OTP boxes rendered **disabled** and a visible "Sandbox
simulation" banner. This makes the privacy claim something judges can *see*
rather than something we merely assert.

The mock citizen is **Sunita Devi**, 14/08/1961, Female, Jaipur 302015, with four
issued documents: Aadhaar, PAN record, Class X marksheet, Income Certificate.

### Switching to the real DigiLocker

No code changes. Set three environment variables:

```bash
export DIGILOCKER_CLIENT_ID=...
export DIGILOCKER_CLIENT_SECRET=...
export DIGILOCKER_REDIRECT_URI=https://<our-domain>/api/digilocker/callback
```

`USE_MOCK` flips to `False` and the same code paths hit the live API.
Check which mode you are in with `GET /api/health`.

---

## Validation rules

`backend/validation.py`. **Every rule is a regex or arithmetic — no model is
ever consulted.** This is the direct answer to "what if the AI hallucinates":
a validation result *cannot* be hallucinated because no AI participates.

| Rule | Checks |
|---|---|
| `ifsc` | `^[A-Z]{4}0[A-Z0-9]{6}$` — 4 letters, a literal zero, 6 alphanumerics |
| `aadhaar` | 12 digits starting 2–9 **and the UIDAI Verhoeff checksum** |
| `pan` | 5 letters, 4 digits, 1 letter |
| `mobile` | 10 digits starting 6/7/8/9 |
| `pincode` | 6 digits, cannot start with 0 |
| `bank_account` | 9–18 digits |
| `date`, `date_past` | DD/MM/YYYY, and `date_past` must be before today |
| `name` | 2–60 letters, Latin **or Devanagari**, no digits |
| `amount` | whole rupees |
| `email` | basic shape |
| `text` | non-empty, ≤200 chars |

Two properties worth demoing:

**The Aadhaar check is real.** `234567890123` is rejected and `234567890124` is
accepted — same 12 digits, different final check digit. A digit-count check
would pass both. This is a good 10-second judge demo.

**Rules normalise before validating.** The citizen speaks naturally and we clean
it up rather than scolding them:

| They say / type | Stored as |
|---|---|
| `₹1,20,000` | `120000` |
| `+91 98765 43210` | `9876543210` |
| `sbin0001234` | `SBIN0001234` |

Every rule carries **both** an English and a Hindi error message, so the voice
layer can read the failure aloud in the citizen's language.

> **Note:** this file is the server-side mirror. The copy that actually runs
> during an offline session is `frontend/src/lib/validation.js`. If you change a
> rule, change it in **both** places.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status + which DigiLocker mode is active |
| GET | `/api/digilocker/authorize` | Start login, returns the URL to send the browser to |
| GET | `/api/digilocker/callback` | Receives the code, exchanges it, redirects to the app |
| GET | `/api/digilocker/profile` | Read the profile for a session |
| GET | `/api/digilocker/issued-documents` | Documents already in the citizen's locker |
| POST | `/api/digilocker/logout` | Server half of one-tap clear |
| GET | `/api/digilocker/mock/consent` | Sandbox stand-in for DigiLocker's sign-in page |
| GET | `/api/digilocker/mock/approve` | Sandbox "Allow" button target |
| POST | `/api/validate` | Validate one field server-side |
| GET | `/api/validate/rules` | List available rule names |
| POST | `/api/generic/extract-fields` | **V1 only** — Gemini field extraction |

Interactive docs while the server runs: <http://127.0.0.1:8000/docs>

---

## Generic mode (V1, not MVP)

`POST /api/generic/extract-fields` sends OCR text to Gemini and asks for a JSON
array of fillable fields. This is **the only place an LLM touches the flow**, it
is V1 scope, and the response is always shown behind the "AI-generated — confirm
before submitting" banner. Template mode never calls it.

Two guardrails:

- If `GEMINI_API_KEY` is unset it returns 503 with a message saying template
  mode still works. It never silently degrades.
- Any `rule` the model returns that is not in our known rule set is forced to
  `text`. The model cannot invent a validation rule.

> **Spec correction:** the spec names *Gemini 1.5 Flash*, which has been retired
> by Google. The model is now configurable via `GEMINI_MODEL` and defaults to
> `gemini-flash-latest`. Update the spec sheet before the deck is printed.

---

## Verification performed

All 15 validation cases behave correctly, including both Aadhaar checksum cases
and rejection of `SBI0001234` (10 chars, not 11).

The complete OAuth flow was exercised end to end:

```
authorize -> mock = True
consent page: 200 | looks like DigiLocker: True
approve -> code issued: True
callback -> session established
profile: Sunita Devi | 14/08/1961 | Female | 302015
issued docs: ['ADHAR', 'PANCR', 'MARKS', 'INCMC']
profile after one-tap clear -> 401 (401 expected)
replay old code -> dl_error=Unknown+or+expired+login+attempt
```

The last two lines are the security-relevant ones: logout genuinely destroys the
session, and an authorisation code cannot be redeemed twice.

---

## Known prototype shortcuts

These are fine for the internal hackathon; fix before the Grand Finale.

1. **Sessions are an in-memory dict.** Restarting the server logs everyone out.
   Production wants a signed cookie or Redis.
2. **No rate limiting** on any endpoint.
3. **Expired sessions are never swept** — only pending logins are (10 min TTL).
   Memory grows slowly over a long-running process.
4. `GEMINI_API_KEY` is currently set in the dev shell environment. Make sure it
   never gets committed to git.
