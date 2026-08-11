"""FormMitra API.

Deliberately small. The whole citizen-facing flow — OCR, voice, validation,
PDF — runs in the browser so it works offline. This server exists for the two
things a browser genuinely cannot do:

  * DigiLocker token exchange, which needs the client secret; and
  * the V1 "generic mode" call to Gemini for unrecognised forms.

No form data is ever written to disk here.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode, urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from . import digilocker, validation

app = FastAPI(
    title="FormMitra API",
    version="0.1.0",
    description="Backend for FormMitra — SIH 2026.",
)

# In dev the Vite server proxies /api, so this only matters if the frontend is
# ever served from a different origin (e.g. Vercel -> Render in production).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.getenv(
            "FORMMITRA_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if o.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#: Where to send the browser once login finishes.
#:
#: Empty by default, which produces a *relative* redirect ("/?dl_session=...")
#: so the browser stays on whichever origin it started from. Hardcoding
#: "http://127.0.0.1:5173" breaks anyone who opened the app at "localhost:5173":
#: the two are separate origins, so consent and language in localStorage are
#: lost, and Vite binding only ::1 makes the request fail outright.
#:
#: Set this only for a production deploy where app and API live on different
#: hosts (e.g. Vercel frontend, Render backend).
FRONTEND_URL = os.getenv("FORMMITRA_FRONTEND_URL", "")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "digilocker_mode": "mock" if digilocker.USE_MOCK else "live",
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
    }


# --- DigiLocker ------------------------------------------------------------


@app.get("/api/digilocker/authorize")
async def digilocker_authorize() -> dict[str, Any]:
    """Step 1: hand the browser a URL to send the citizen to."""
    return digilocker.build_authorize_url()


@app.get("/api/digilocker/callback")
async def digilocker_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Step 4: DigiLocker sends the citizen back here with a code.

    We exchange it server-side, then bounce the browser back to the app with a
    session id. The access token itself never reaches the browser.
    """
    if error or not code or not state:
        return RedirectResponse(
            f"{FRONTEND_URL}/?dl_error={error or 'cancelled'}", status_code=302
        )
    try:
        result = await digilocker.exchange_code(code, state)
    except Exception as exc:  # noqa: BLE001 - surfaced to the user as a message
        return RedirectResponse(
            f"{FRONTEND_URL}/?{urlencode({'dl_error': str(exc)})}", status_code=302
        )
    return RedirectResponse(
        f"{FRONTEND_URL}/?dl_session={result['session_id']}", status_code=302
    )


@app.get("/api/digilocker/profile")
async def digilocker_profile(session_id: str) -> dict[str, Any]:
    try:
        return digilocker.get_profile(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/api/digilocker/issued-documents")
async def digilocker_issued_documents(session_id: str) -> dict[str, Any]:
    try:
        return {"documents": await digilocker.fetch_issued_documents(session_id)}
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.post("/api/digilocker/logout")
async def digilocker_logout(session_id: str) -> dict[str, bool]:
    """Server half of the one-tap clear."""
    digilocker.end_session(session_id)
    return {"cleared": True}


# --- Mock DigiLocker provider ---------------------------------------------
# Stands in for DigiLocker's own consent page until partner credentials arrive.
# Styled to look like the real thing so demo screenshots are honest about what
# the citizen would actually see.


@app.get("/api/digilocker/mock/consent", response_class=HTMLResponse)
async def mock_consent(redirect_uri: str, state: str, client_id: str = "") -> str:
    approve = f"/api/digilocker/mock/approve?{urlencode({'redirect_uri': redirect_uri, 'state': state})}"
    deny = f"{urlparse(redirect_uri).path}?{urlencode({'error': 'access_denied', 'state': state})}"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DigiLocker — Sign In (Sandbox)</title>
<style>
  body {{ margin:0; font-family: system-ui, sans-serif; background:#f2f4f8; color:#12203c; }}
  .bar {{ background:#0b3d91; color:#fff; padding:16px 20px; font-weight:700; font-size:20px; }}
  .card {{ max-width:460px; margin:28px auto; background:#fff; border-radius:14px;
           padding:26px; box-shadow:0 2px 14px rgba(0,0,0,.09); }}
  .note {{ background:#fff6e5; border:1px solid #f0c36d; padding:12px 14px;
           border-radius:9px; font-size:14px; margin-bottom:20px; }}
  label {{ display:block; font-weight:600; margin:16px 0 6px; font-size:15px; }}
  input {{ width:100%; padding:13px; font-size:17px; border:1px solid #c3ccdb;
           border-radius:9px; box-sizing:border-box; }}
  ul {{ font-size:15px; line-height:1.7; padding-left:20px; }}
  .row {{ display:flex; gap:12px; margin-top:22px; }}
  a.btn {{ flex:1; text-align:center; text-decoration:none; padding:15px;
           border-radius:10px; font-weight:700; font-size:17px; }}
  .ok {{ background:#0b3d91; color:#fff; }}
  .no {{ background:#eceff5; color:#3c4a63; }}
</style></head><body>
<div class="bar">DigiLocker</div>
<div class="card">
  <div class="note"><b>Sandbox simulation.</b> This page stands in for DigiLocker's
  real sign-in until FormMitra's partner application is approved. On the real page
  the citizen enters their Aadhaar number and OTP here — FormMitra never sees either.</div>
  <label>Aadhaar Number</label>
  <input value="XXXX XXXX 9920" disabled>
  <label>OTP sent to registered mobile</label>
  <input value="••••••" disabled>
  <p style="font-size:15px;margin-top:22px"><b>FormMitra</b> is requesting:</p>
  <ul>
    <li>Your name, date of birth, gender and address</li>
    <li>The list of documents issued to you</li>
  </ul>
  <p style="font-size:14px;color:#5a6782">It cannot download your documents or see your Aadhaar number.</p>
  <div class="row">
    <a class="btn no" href="{deny}">Deny</a>
    <a class="btn ok" href="{approve}">Allow</a>
  </div>
</div></body></html>"""


@app.get("/api/digilocker/mock/approve")
async def mock_approve(redirect_uri: str, state: str) -> RedirectResponse:
    code = digilocker.issue_mock_code()
    # Redirect to the *path* only, dropping the scheme and host. The real
    # DigiLocker must send the citizen to our registered absolute URI, but our
    # stand-in should keep the browser exactly where it already is — otherwise
    # a session started on localhost gets bounced to 127.0.0.1 and loses its
    # origin-scoped storage.
    return RedirectResponse(
        f"{urlparse(redirect_uri).path}?{urlencode({'code': code, 'state': state})}",
        status_code=302,
    )


# --- Validation ------------------------------------------------------------


class ValidateRequest(BaseModel):
    rule: str
    value: str


@app.post("/api/validate")
async def validate_field(req: ValidateRequest) -> dict[str, Any]:
    """Server-side mirror of the browser's validation rules.

    The offline app does not call this; it exists so operator tooling and tests
    share one definition of "valid".
    """
    return validation.validate(req.rule, req.value)


@app.get("/api/validate/rules")
async def list_rules() -> dict[str, list[str]]:
    return {"rules": sorted(validation.RULES.keys())}


# --- Generic mode (V1) -----------------------------------------------------


class ExtractRequest(BaseModel):
    ocr_text: str
    language: str = "hi"


GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"

EXTRACT_PROMPT = """You are helping an Indian citizen fill a government form.

Below is raw OCR text from a photograph of a form. Identify the blank fields the
citizen must fill in. Ignore instructions, headers, office-use sections and any
text that is not a fillable field.

Return ONLY a JSON array. Each element must be:
{{"label_en": "...", "label_hi": "...", "rule": "...", "question_en": "...", "question_hi": "..."}}

"rule" must be exactly one of: text, name, date, date_past, mobile, email,
aadhaar, pan, ifsc, bank_account, pincode, amount.

The questions must be short and answerable out loud by someone who cannot read.

OCR TEXT:
{ocr_text}
"""


@app.post("/api/generic/extract-fields")
async def extract_fields(req: ExtractRequest) -> dict[str, Any]:
    """V1 generic mode: turn OCR text from an unknown form into a field list.

    This is the only place an LLM touches the flow, and everything it returns is
    shown to the citizen behind an "AI-generated — confirm before submitting"
    banner. Template mode never reaches this endpoint.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Generic mode is not configured. Set GEMINI_API_KEY to enable it. "
                "Template mode (the 10 mapped forms) works without it."
            ),
        )

    import json

    import httpx

    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            f"{GEMINI_URL}/{GEMINI_MODEL}:generateContent",
            headers={"x-goog-api-key": api_key},
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": EXTRACT_PROMPT.format(ocr_text=req.ocr_text[:8000])}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json",
                },
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gemini error: {resp.text[:300]}")

    try:
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        fields = json.loads(text)
    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail="Could not read the model's response."
        ) from exc

    valid_rules = set(validation.RULES)
    for f in fields:
        if f.get("rule") not in valid_rules:
            f["rule"] = "text"

    return {"fields": fields, "ai_generated": True, "model": GEMINI_MODEL}
