# FormMitra — Master Context Prompt
### Copy this entire prompt at the start of every new Claude conversation

---

## PASTE THIS AT THE START OF EVERY NEW CHAT:

---

I am a first-year CSE student working on **FormMitra** — our team's Smart India Hackathon 2026 (SIH 2026) project. We are a team of 6 first-year students. Please keep all help calibrated to first-year level — we are beginners but fast learners.

---

## WHAT FORMMITRA IS

**One-liner:** FormMitra is a Progressive Web App (PWA) — a website that opens in any browser without installation — that helps Indian citizens fill government forms using their voice, in their own language, with help from AI.

**The problem it solves:** Crores of Indian citizens — elderly pensioners, rural women, first-generation students, migrant workers — cannot read or fill government forms written in formal bureaucratic language. They pay cyber-café agents ₹50–200 per form, and wrong submissions get rejected, delaying pensions, scholarships, ration cards, and bank access by weeks.

**The solution — 9-step flow:**
1. **DigiLocker login (optional):** User logs in with DigiLocker (Aadhaar + OTP on DigiLocker's own page). FormMitra receives their verified name, DOB, gender, address — auto-fills these fields across all forms. We never see the Aadhaar number.
2. **Home screen:** Grid of 10 supported forms + "Scan any form" button + language selector.
3. **Scan:** User photographs the form using their phone camera.
4. **Identify:** Tesseract.js OCR (runs in browser, offline) identifies which form it is from 10 pre-mapped templates.
5. **Explain:** User taps any field → plain-language explanation spoken aloud in Hindi/English (pre-written JSON, not live AI).
6. **Guided fill:** App asks one question at a time by voice. DigiLocker-sourced fields are auto-skipped. Only form-specific fields (IFSC, nominee, purpose) are asked.
7. **Validate:** JavaScript regex checks IFSC format, Aadhaar digit count, PIN, mobile, dates — deterministic, never wrong, no AI involved.
8. **Confirm:** App reads each answer back — "SBIN0001234 — sahi hai?"
9. **Download PDF:** pdf-lib generates the filled PDF entirely in the browser. Downloaded to user's device. Nothing stored on our servers.

---

## TECH STACK — ALL FREE

| Layer | Tool | Cost |
|---|---|---|
| Identity pre-fill | DigiLocker API (MeitY OAuth) | Free — apply at digilocker.gov.in |
| Frontend framework | React (Vite) | Free |
| Styling | Tailwind CSS | Free |
| Voice (speech-to-text) | Web Speech API (Chrome built-in) → Bhashini upgrade | Free |
| Voice (text-to-speech) | Web Speech API (Chrome built-in) → Bhashini upgrade | Free |
| OCR (reads form photo) | Tesseract.js — runs in browser, offline | Free / open source |
| Backend server | Python 3 + FastAPI | Free |
| AI / LLM (generic mode only) | Google Gemini 1.5 Flash API | Free tier (15 req/min) |
| Regional language voice | Bhashini API (MeitY) | Free — apply at bhashini.gov.in |
| PDF generation | pdf-lib (JavaScript, runs in browser) | Free / open source |
| Database | Firebase Spark plan | Free tier |
| Frontend hosting | Vercel | Free for students |
| Backend hosting | Render.com | Free for students |
| Version control | GitHub | Free |
| Design / wireframes | Figma (free tier) | Free |
| Code editor | VS Code | Free |

---

## AI MODELS USED — ALL PRE-TRAINED, ZERO TRAINING

- **Tesseract.js** — OCR, reads text from form photo, runs offline in browser
- **Web Speech API / Bhashini** — speech-to-text + text-to-speech, offline capable
- **Google Gemini 1.5 Flash** — ONLY for generic mode (unknown forms); NOT used in template mode
- **Validation rules** — pure JavaScript regex, no AI at all
- **pdf-lib** — PDF generation in browser, no AI

**CRITICAL: The LLM (Gemini) never gives live explanations in template mode. All 10 template form explanations are pre-written JSON files, human-reviewed by our team. This eliminates hallucination risk in the core flow.**

---

## OFFLINE MODE — HOW IT WORKS

FormMitra is a PWA. On first visit (needs internet):
- Service worker downloads and caches: React app, all 10 template JSONs, Tesseract.js model (~4MB), pdf-lib, all field explanations.

From second visit onwards (zero internet needed):
- Camera scan → Tesseract OCR → form identification → explanations → voice fill → validation → PDF generation — ALL offline.

What still needs internet: DigiLocker login (login step only), Bhashini API (upgrade), Gemini API (generic mode only). All three have offline fallbacks.

**Implementation:** Vite PWA plugin (`npm install vite-plugin-pwa`) — one config line generates the service worker automatically.

---

## SCOPE

**MVP — Internal Hackathon (22 Aug 2026):**
- 10 pre-mapped forms: NSP scholarship, PAN Form 93 (replaced Form 49A under PAN 2.0), ration card, pension life certificate, bank account opening, Ayushman card, income certificate, caste certificate, LPG subsidy, RTI application
- DigiLocker login (sandbox credentials) OR manual Aadhaar entry fallback
- Voice fill in Hindi + English (Web Speech API, offline)
- Filled PDF downloaded to device
- Document checklist with DigiLocker cross-reference
- Fully offline after first visit (PWA service worker)

**V1 — Grand Finale (December 2026):**
- Generic mode: any form via Tesseract OCR + Gemini field extraction
- Third language via Bhashini (Tamil/Telugu/Bengali — whichever team member speaks it)
- DigiLocker production credentials (upgraded from sandbox)
- CSC operator mode: batch fill, saved profiles

**Non-goals (important for judges):**
- No online submission into government portals — output is a filled printable PDF only
- No downloading of actual DigiLocker documents — only profile data and document list
- No cloud storage of filled forms — PDF stays on user's device only

---

## PRIVACY — KEY POINTS

- DigiLocker OAuth: we never see Aadhaar number or OTP — login happens on DigiLocker's own page
- Zero server storage: all form data processed in browser session only
- Minimum OAuth scope: only profile (name/DOB/gender/address) + document list
- Template explanations: pre-written and human-reviewed — LLM never gives live legal advice
- Generic mode: shows visible "AI-generated — confirm with CSC before submitting" warning
- One-tap clear: clears all DigiLocker data and form progress from browser instantly
- DPDP Act aligned: consent screen before any data is used

---

## TEAM SPLIT

| Role | What they own | What to learn |
|---|---|---|
| Frontend Dev ×2 | React PWA, camera capture, voice UI, DigiLocker OAuth redirect, all screens | React (Vite), Tailwind CSS, Web Speech API, OAuth 2.0 basics |
| Backend Dev ×2 | FastAPI server, DigiLocker API calls + token exchange, Tesseract OCR pipeline, validation, pdf-lib PDF generation | Python, FastAPI, DigiLocker REST API docs, Tesseract.js, pdf-lib |
| AI / Integrations ×1 | Gemini API prompts (generic mode), explanation JSON cache, Bhashini STT/TTS, DigiLocker document cross-reference logic | Prompt engineering, REST APIs, developer.digilocker.gov.in docs |
| Research + Design ×1 | Field survey, Figma screen mockups, SIH 6-slide deck, pitch script, checklist feature, DigiLocker partner application | Figma mobile design, survey methods, public speaking |

---

## BUILD TIMELINE

- **Week 1:** Everyone installs React (Vite) + runs Hello World. Design member submits DigiLocker partner application (20 mins — do this FIRST). Design all screens in Figma.
- **Week 2:** Build form template JSON library (map all 10 forms). Build DigiLocker OAuth flow.
- **Week 3:** Build Tesseract OCR pipeline. Build voice UI (Web Speech API STT + TTS).
- **Week 4:** Build guided fill flow + validation rules. Connect frontend to backend.
- **Week 5:** Build pdf-lib PDF generation + document checklist. Add PWA service worker (offline).
- **Week 6:** Add Bhashini API (regional language upgrade). End-to-end testing on all 10 forms.
- **Before internal hackathon:** Field survey (talk to 20 people outside a bank/CSC). APK/site hardening. Demo prep.
- **3 days before:** Full demo run-through. Two demo modes ready: DigiLocker flow + offline flow.

---

## KEY JUDGE QUESTIONS + ANSWERS

**Q: What if the AI hallucinates a field explanation?**
Template mode (10 forms): No live LLM — explanations are pre-written JSON, human-reviewed by our team. Hallucination is impossible. Generic mode: LLM used but flagged with a visible "AI-generated — confirm before submitting" banner. Validation (IFSC, Aadhaar format, etc.) is pure regex — deterministic, cannot hallucinate.

**Q: Isn't DigiLocker already doing this?**
DigiLocker is a document locker. It pre-fills details on forms that are already digitized and connected to DigiLocker — a small fraction of India's actual forms. Our users are at an SBI counter with a paper KYC form, at a tehsil with a caste certificate, at a ration shop with a correction application — none of which have DigiLocker integration. FormMitra solves the physical paper form problem DigiLocker was never designed for. We USE DigiLocker as a data source — it is not our competitor.

**Q: How does the website work offline?**
PWA service worker. First visit (with internet) downloads and caches everything — app, OCR model, templates, PDF engine. Second visit onwards: entire app runs from device storage. Turn off Wi-Fi — it still loads, scans, fills, and generates PDF. Same technology as Google Maps offline. Only DigiLocker login and Bhashini upgrade need internet — both have offline fallbacks.

**Q: Why not just use Claude/ChatGPT?**
Claude requires internet + account + English typing. FormMitra is voice-first, offline-capable, in Hindi/regional language, pre-fills from DigiLocker, validates formats deterministically, and outputs a print-ready PDF saved to the device. It is purpose-built for the 30 crore Indians who have none of those things Claude requires.

**Q: Why a website and not an app?**
No install barrier — works immediately on any phone in a CSC, library, or ration shop. DigiLocker OAuth redirect flow works better in a browser. PWA can be added to home screen (feels like an app). No Play Store approval needed for demo.

---

## SIH-SPECIFIC DETAILS

- **Category:** Software
- **Theme:** Smart Automation (primary) — also fits e-governance / citizen services / accessibility PSs
- **Likely PS owners:** MeitY, Ministry of Social Justice & Empowerment, DEPwD, state e-gov departments
- **Internal hackathon date:** 22 August 2026
- **Official PS list release:** 25 August 2026
- **Grand Finale:** December 2026
- **Strategy:** Lock the PS within 48 hours of the 25 Aug release. Pick the PS from the most obscure ministry that matches — fewer competing teams = better odds.

---

## WHAT EACH TEAM MEMBER SHOULD ASK CLAUDE FOR

**Frontend Devs:** "Help me build [specific screen] in React with Vite and Tailwind. I am a first-year student and beginner. Explain every step."

**Backend Devs:** "Help me build a FastAPI endpoint in Python for [specific feature — OCR, DigiLocker OAuth, validation, PDF generation]. Beginner level, explain everything."

**AI / Integrations:** "Help me write the Gemini API prompt for extracting field names from an unknown government form image. Also help me structure the Bhashini API call for Hindi TTS."

**Research + Design:** "Help me design the Figma wireframes for FormMitra. Here are the 8 screens: [list]. Primary users are elderly, low-literacy Indians — design for 18sp minimum font, large tap targets, one action per screen."

**Everyone:** "Review my code for [feature]. I am a first-year student. Point out bugs, explain what's wrong, and suggest fixes."

---

## IMPORTANT CONTEXT FOR CLAUDE

- We are 6 first-year CSE students — complete beginners to production development
- Internal hackathon is 22 August 2026 — MVP must be ready by then
- We have chosen React (Vite) + FastAPI as our stack — do not suggest alternatives unless there is a critical reason
- Everything must be free — no paid APIs or tools
- The project must work offline as a PWA — this is non-negotiable
- DigiLocker application should be submitted this week — it needs 3–7 days for approval
- Template mode (10 forms with pre-written JSON explanations) is the priority — generic Gemini mode is V1 only

---

*FormMitra — SIH 2026 — Team of 6 First-Year CSE Students*
