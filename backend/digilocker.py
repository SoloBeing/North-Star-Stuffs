"""DigiLocker OAuth 2.0 (Partner API) integration.

The real flow, per developers.digilocker.gov.in:

    1. We redirect the user to DigiLocker's authorize page (PKCE, S256).
    2. The user enters their Aadhaar + OTP *on DigiLocker's own page*. We never
       see either one — that is the whole privacy argument for FormMitra.
    3. DigiLocker redirects back to us with a short-lived `code`.
    4. Our *server* swaps that code for an access token, using the client
       secret. This is the one step that cannot happen in the browser, and it
       is the reason this backend exists at all.
    5. With the token we read the citizen's profile (name / DOB / gender /
       address) and the list of documents issued to them.

We do not have partner credentials yet (the application takes 3-7 days), so
when DIGILOCKER_CLIENT_ID is unset we run an in-process MOCK provider that
mimics the same redirect + code + token dance. Swapping to the real thing is
then a matter of setting three environment variables — no code changes.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx

# --- Endpoints -------------------------------------------------------------

DIGILOCKER_BASE = "https://api.digitallocker.gov.in/public/oauth2"
AUTHORIZE_URL = f"{DIGILOCKER_BASE}/1/authorize"
TOKEN_URL = f"{DIGILOCKER_BASE}/1/token"
ISSUED_FILES_URL = f"{DIGILOCKER_BASE}/2/files/issued"

CLIENT_ID = os.getenv("DIGILOCKER_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("DIGILOCKER_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv(
    "DIGILOCKER_REDIRECT_URI", "http://127.0.0.1:5173/api/digilocker/callback"
)

#: With no partner credentials configured we serve a look-alike consent page
#: instead of hitting DigiLocker. Everything downstream is identical.
USE_MOCK = not (CLIENT_ID and CLIENT_SECRET)

# Minimum scope the spec commits to: profile fields + the issued-document list.
# Deliberately NOT requesting document *contents*.
SCOPE = "avs_parent files.issueddocs"


# --- Pending-authorisation store -------------------------------------------
# Prototype-grade: in memory, so a server restart drops in-flight logins. A
# real deployment would use a signed cookie or Redis. Nothing citizen-facing is
# stored here beyond a short-lived PKCE verifier.


@dataclass
class PendingAuth:
    state: str
    code_verifier: str
    created_at: float = field(default_factory=time.time)


_pending: dict[str, PendingAuth] = {}
_sessions: dict[str, dict[str, Any]] = {}

PENDING_TTL_SECONDS = 10 * 60


def _sweep_expired() -> None:
    cutoff = time.time() - PENDING_TTL_SECONDS
    for state in [s for s, p in _pending.items() if p.created_at < cutoff]:
        _pending.pop(state, None)


def _make_pkce_pair() -> tuple[str, str]:
    """Return (verifier, challenge) for PKCE S256."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode().rstrip("=")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


def build_authorize_url() -> dict[str, str]:
    """Start a login. Returns the URL the browser should be sent to."""
    _sweep_expired()
    state = secrets.token_urlsafe(24)
    verifier, challenge = _make_pkce_pair()
    _pending[state] = PendingAuth(state=state, code_verifier=verifier)

    params = {
        "response_type": "code",
        "client_id": CLIENT_ID or "FORMMITRA_SANDBOX",
        "redirect_uri": REDIRECT_URI,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "scope": SCOPE,
    }
    base = "/api/digilocker/mock/consent" if USE_MOCK else AUTHORIZE_URL
    return {
        "authorize_url": f"{base}?{urlencode(params)}",
        "state": state,
        "mock": USE_MOCK,
    }


async def exchange_code(code: str, state: str) -> dict[str, Any]:
    """Swap an authorisation code for a token + profile. Server-side only."""
    pending = _pending.pop(state, None)
    if pending is None:
        raise ValueError("Unknown or expired login attempt. Please try again.")

    if USE_MOCK:
        payload = _mock_token_response(code)
    else:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "redirect_uri": REDIRECT_URI,
                    "code_verifier": pending.code_verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            payload = resp.json()

    profile = _profile_from_token(payload)
    session_id = secrets.token_urlsafe(24)
    _sessions[session_id] = {
        "access_token": payload.get("access_token", ""),
        "profile": profile,
        "created_at": time.time(),
    }
    return {"session_id": session_id, "profile": profile}


def get_profile(session_id: str) -> dict[str, Any]:
    """Read back the profile for a session created by exchange_code()."""
    session = _sessions.get(session_id)
    if session is None:
        raise ValueError("Session expired. Please log in to DigiLocker again.")
    return session["profile"]


def _profile_from_token(payload: dict[str, Any]) -> dict[str, Any]:
    """DigiLocker returns the citizen's basic profile alongside the token.

    Note what is absent: the Aadhaar number. DigiLocker gives us a masked
    reference at most, and we drop even that.
    """
    return {
        "digilocker_id": payload.get("digilockerid", ""),
        "name": payload.get("name", ""),
        "dob": _normalise_dob(payload.get("dob", "")),
        "gender": {"M": "Male", "F": "Female", "T": "Transgender"}.get(
            (payload.get("gender") or "").upper(), payload.get("gender", "")
        ),
        "address": payload.get("address", ""),
        "pincode": payload.get("pincode", ""),
        "state": payload.get("state", ""),
        "district": payload.get("district", ""),
        "verified": True,
    }


def _normalise_dob(dob: str) -> str:
    """DigiLocker sends DD-MM-YYYY; our forms use DD/MM/YYYY."""
    return dob.replace("-", "/") if dob else ""


async def fetch_issued_documents(session_id: str) -> list[dict[str, Any]]:
    """List the documents already in the citizen's DigiLocker.

    Used by the checklist screen: if a form needs an income certificate and the
    citizen already has one issued, we say "you already have this" instead of
    sending them to a tehsil office.
    """
    session = _sessions.get(session_id)
    if session is None:
        raise ValueError("Session expired. Please log in to DigiLocker again.")

    if USE_MOCK:
        return _MOCK_ISSUED_DOCS

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            ISSUED_FILES_URL,
            headers={"Authorization": f"Bearer {session['access_token']}"},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])

    return [
        {
            "name": item.get("name", ""),
            "type": item.get("doctype", ""),
            "issuer": item.get("issuer", ""),
            "date": item.get("date", ""),
        }
        for item in items
        if item.get("doctype")
    ]


def end_session(session_id: str) -> None:
    """One-tap clear, server side. The browser clears its own copy separately."""
    _sessions.pop(session_id, None)


# --- Mock provider ---------------------------------------------------------

_MOCK_CITIZEN = {
    "digilockerid": "MOCK-DL-4417-9920",
    "name": "Sunita Devi",
    "dob": "14-08-1961",
    "gender": "F",
    "address": "House No. 42, Ward 7, Gandhi Nagar, Jaipur, Rajasthan",
    "pincode": "302015",
    "state": "Rajasthan",
    "district": "Jaipur",
}

_MOCK_ISSUED_DOCS = [
    {
        "name": "Aadhaar Card",
        "type": "ADHAR",
        "issuer": "UIDAI",
        "date": "12-03-2013",
    },
    {
        "name": "PAN Verification Record",
        "type": "PANCR",
        "issuer": "Income Tax Department",
        "date": "02-07-2016",
    },
    {
        "name": "Class X Marksheet",
        "type": "MARKS",
        "issuer": "Board of Secondary Education, Rajasthan",
        "date": "28-05-1977",
    },
    {
        "name": "Income Certificate",
        "type": "INCMC",
        "issuer": "Revenue Department, Government of Rajasthan",
        "date": "19-01-2024",
    },
]

_mock_codes: dict[str, float] = {}


def issue_mock_code() -> str:
    code = secrets.token_urlsafe(18)
    _mock_codes[code] = time.time()
    return code


def _mock_token_response(code: str) -> dict[str, Any]:
    if code not in _mock_codes:
        raise ValueError("Invalid authorisation code.")
    del _mock_codes[code]
    return {
        "access_token": f"mock.{secrets.token_urlsafe(24)}",
        "token_type": "Bearer",
        "expires_in": 3600,
        **_MOCK_CITIZEN,
    }
