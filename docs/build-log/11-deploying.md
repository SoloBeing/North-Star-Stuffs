# Step 11 — Deploying to Vercel, and the bug serverless forced us to fix

**Session 3, Step 1**
**Date:** 12 August 2026

Goal: get FormMitra onto a URL so the team can test it on their own phones
without cloning anything.

That turned out to require fixing a real bug first. Not a deployment detail — a
bug that was always there, that our development setup was structurally
incapable of showing us.

---

## The bug the laptop was hiding

`backend/digilocker.py` kept three module-level dictionaries:

```python
_pending:    dict[str, PendingAuth]       # PKCE verifier, keyed by OAuth state
_sessions:   dict[str, dict[str, Any]]    # profile + access token
_mock_codes: dict[str, float]             # issued mock authorisation codes
```

Its own comment called this "prototype-grade… a real deployment would use a
signed cookie or Redis." That was written as a note for later. Deploying made
it now.

**A Python dict lives in one process.** Locally there is exactly one process —
`uv run main.py` — so every request sees the same dict and the flow works
perfectly, every time, forever. On Vercel each request may be served by a
different instance, and an instance that did not write the dict simply does not
have it.

Count the requests in a single login:

| # | Request | Touches |
|---|---|---|
| 1 | `GET /api/digilocker/authorize` | **writes** `_pending[state]` |
| 2 | `GET /api/digilocker/mock/consent` | — |
| 3 | `GET /api/digilocker/mock/approve` | **writes** `_mock_codes[code]` |
| 4 | `GET /api/digilocker/callback` | **reads** both, **writes** `_sessions` |
| 5 | `GET /api/digilocker/profile` | **reads** `_sessions` |
| 6 | `GET /api/digilocker/issued-documents` | **reads** `_sessions` |

Six requests, spanning however long the citizen takes to tap **Allow**, all
needing to land on one instance.

Requests 5 and 6 are the worst of it. `App.jsx` fires them through
`Promise.all`, so they are genuinely **concurrent** — the single case where
Vercel is most likely to use two instances. The likely failure is one of them
returning the citizen and the other returning `401 Session expired`, from the
same session id, at the same moment.

**This is the worst shape a bug can have for a demo.** It is not deterministic.
It passes when you test it, because your test warms one instance. It fails
under load — which for us means the afternoon six teammates open the link at
once, or a judge opening it while someone else is mid-demo.

---

## The fix, and where we deliberately stopped

The mock provider has **nothing worth protecting**. Its PKCE verifier is never
checked by anyone. Its access token is a fabricated string. Its profile is
Sunita Devi, a demo citizen already committed to this repository in plain text.

So for the mock path, state, authorisation code and session id all became
HMAC-signed, self-expiring tokens that carry their own payload:

```
<base64url(json claims)>.<base64url(hmac-sha256)>
```

Any instance can verify any token, because verification needs only the key. The
store is not shared — it is **gone**, which is the only version of shared that
serverless cannot break.

`_unsign()` checks four things: the signature, a `kind` field so a session id
cannot be replayed as an authorisation code, an issued-at timestamp against a
TTL, and that the payload parses. Every failure returns the same message the
old code returned, so the citizen-facing behaviour is unchanged.

**The live DigiLocker path was deliberately left on the in-memory dicts.** It
would have been easy to sign those tokens too and call the whole problem
solved. That would have been wrong:

- A real PKCE verifier signed into `state` is **readable** — base64 is not
  encryption. Anyone who sees the URL gets the verifier, which is the exact
  attack PKCE exists to prevent.
- A real access token inside a session id travels in a query string, and query
  strings end up in browser history, proxy logs and `Referer` headers.

Neither is acceptable, and neither is visible from the outside — signed tokens
would have *looked* like a fix. Making live DigiLocker work on serverless needs
a genuine shared store (Redis) or the session moved into an HttpOnly cookie.
That is a decision for when the partner credentials actually arrive.

Until then `requires_session_store()` returns true for the unsafe combination —
serverless *and* real credentials — `exchange_code()` refuses with an
explanation instead of logging people in unreliably, and `/api/health` reports
it so the cause is one `curl` away:

```json
{"status":"ok","digilocker_mode":"mock","serverless":true,"needs_session_store":false}
```

### What signing costs

Recorded because it is a genuine trade, not a free win:

- **Mock authorisation codes are no longer single-use.** Without a store there
  is nothing to cross off, so a code stays redeemable until its 10-minute TTL
  expires. A real provider must not do this. Ours returns a fixed demo citizen,
  so replaying a code reveals nothing a fresh login would not.
- **Mock sessions cannot be revoked, only expired.** `end_session()` has
  nothing to pop. The browser-side wipe — the half that actually holds the
  citizen's data — is unaffected.
- **The session id is ~460 characters**, because it carries the profile.
  Comfortably inside browser and CDN URL limits, but no longer something you
  can read in a log line.

---

## The deployment itself

`vercel.json`, using [Vercel Services](https://vercel.com/docs/services) — two
independently built services in one project, one domain:

```json
{
  "services": {
    "app": { "root": "frontend/", "framework": "vite" },
    "api": { "root": ".", "framework": "fastapi", "entrypoint": "backend.main:app" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)",     "destination": { "service": "app" } }
  ]
}
```

Three things fall out of this that are worth naming:

**Same origin, so nothing else had to change.** The frontend's `fetch('/api/…')`
calls are relative and stay relative. `FRONTEND_URL` stays empty, so the
post-login redirect stays relative and the browser never leaves the origin it
started on — which is what keeps consent and language in `localStorage` alive
across the round trip. CORS never engages. The two production environment
variables in `.env.example` are for a split deploy and are not needed here.

**Vercel preserves the original path.** `/api/digilocker/authorize` arrives at
FastAPI as `/api/digilocker/authorize`, not rebased to `/`, so the existing
`/api`-prefixed routes work untouched.

**The API service root is the repository root, not `backend/`.** Two reasons,
both of which cost a debugging cycle to see: `pyproject.toml` and `uv.lock` are
at the root and are how Vercel resolves dependencies, and `backend/main.py`
imports its siblings with `from . import digilocker, validation`. Rooting the
service at `backend/` would load `main.py` as a top-level module with no parent
package, and that relative import would fail. Rooting at `.` keeps the package
intact and local `uv run main.py` unchanged.

### The service worker was already right

Worth noting because it would have been an evening's confusion. Workbox answers
every navigation with the cached `index.html`, which in a production build would
swallow both the redirect out to the consent page and the `/api/…/callback`
return. `navigateFallbackDenylist: [/^\/api\//]` in `vite.config.js` already
prevents this — it was added in step 4 after exactly that bug. It is only
reachable in a production build, which is what a deployment is.

---

## What was verified

Not "it deployed." The state fix is the kind that looks fine and is not, so it
was tested against the condition that breaks it.

**1. A token minted in one process validates in another.** Two separate
interpreters: one starts and redeems a login, the other reads the profile with
`_sessions` printed as `{}` to prove nothing was shared.

```
=== process A mints ===
{"session_id": "eyJraW5kIjogInNlc3Npb24iLCA...", "name": "Sunita Devi"}
=== process B (fresh interpreter, empty memory) verifies ===
  _sessions in this process: {}
  profile: Sunita Devi
  issued documents: 4
```

**2. Forgery, in six shapes.** All rejected, all with the citizen-facing
message:

```
ok  tampered payload            ok  expired token
ok  foreign signing key         ok  not a token
ok  code used as session        ok  empty
```

**3. The whole HTTP flow with memory wiped between every single hop** — the
worst case serverless can produce, where no two requests share an instance:

```
authorize -> consent -> approve -> callback -> profile -> issued-documents
200          200        302        302         200        200 (4 documents)
forged session -> 401
```

**4. The same flow through `vercel dev`,** which runs the real routing table:

```
Detected services:
• app  [Vite]
• api  [FastAPI]
```

with requests 5 and 6 issued concurrently, as `App.jsx` issues them.

**5. The production frontend build**, since `vercel dev` runs Vite in dev mode
and never exercises the service worker: 14 precache entries, 1.46 MB.

**6. The same flow on the deployed site**, against real Vercel infrastructure —
`https://formmitra-cyan.vercel.app`:

```
/api/health        200  mock, serverless=true, needs_session_store=false
/                  200  text/html
/forms/form93.pdf  200  application/pdf, 665,642 bytes
/sw.js             200  the service worker is being served
authorize -> consent -> approve -> callback -> profile -> issued-documents  all 200
forged session -> 401
```

**7. Eight simultaneous logins** — the exact shape of "six teammates open the
link at once", and the case the old in-memory code was most likely to fail,
because each login ends in two concurrent requests:

```
user 1..8: ok  profile=200 docs=200
8/8 complete logins, all concurrent
```

### Not verified

- **The live DigiLocker path**, which has no credentials and is now explicitly
  refused on serverless.
- **Voice and camera on teammates' phones.** HTTPS should unlock both — the Web
  Speech API and `getUserMedia` require a secure origin, which is why a LAN IP
  never worked for phone testing. That is the expectation, not a result, and it
  needs a real phone to confirm.
- **Offline mode on the deployed site.** It was verified locally in step 6, and
  the service worker is being served, but the caching behaviour has not been
  re-checked against the deployment.
- **Sustained or heavy load.** Eight concurrent logins is a demo-shaped test,
  not a load test.

---

## Notes for whoever deploys next

- **The Vercel CLI must be recent.** 54.3.0 rejects the `services` key outright
  (`should NOT have additional property 'services'`). 58.9.4 detects both
  services correctly. `npx vercel@latest` avoids touching the global install.
  After upgrading, check `which -a vercel` — an old copy in `/usr/local/bin`
  can sit alongside the new one and win depending on `PATH`.
- **The project name cannot be `FormMitra`.** Vercel derives it from the
  directory and rejects uppercase, so the first deploy fails with a 400. Fixed
  once with `vercel link --project formmitra`.
- **`vercel link` edits `.gitignore`, and its edit is harmful here.** It appends
  a bare `.env*`, which lands *below* the existing `!.env.example` exception.
  The last matching rule wins, so `.env.example` becomes ignored — invisibly,
  because the file is already tracked and keeps working until someone deletes
  and re-adds it. Removed; `.vercel` kept with a comment saying why not to let
  the line come back.
- **Linking to the GitHub repo failed** (`You need to add a Login Connection to
  your GitHub account first`) and was skipped. CLI deploys work regardless.
  Connecting it later would give the team deploy-on-push, which is worth doing.
- **One upload died mid-transfer** with `fetch failed` / `AbortError`. Plain
  retry, no change, second attempt succeeded. Worth knowing before debugging a
  problem that is not there.
- **The build prints a warning that looks fatal and is not:** `Build output
  contains no "functions" or "static" directory`. It appears at the end of a
  services build that then deploys, aliases and serves correctly.
- **Give teammates the production URL.** Preview deployments sit behind Vercel
  authentication and your teammates do not have accounts on the project.
- **`GEMINI_API_KEY` is not set on Vercel**, so V1 generic mode returns its
  configured `503`. Template mode — all ten forms — does not touch it. Set it in
  the Vercel dashboard if generic mode is wanted; it must never enter the repo.
- **`FORMMITRA_SECRET_KEY` is worth setting** even though the fallback protects
  nothing today. It stops signed tokens from one deployment being accepted by
  another, and it is the key the live path will need when the session store
  arrives.
