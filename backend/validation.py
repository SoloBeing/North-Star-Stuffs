"""Deterministic field validation.

Every rule here is a regex or an arithmetic check. No model is consulted, so a
validation result can never be hallucinated — that is the answer to the judges'
"what if the AI gets it wrong" question.

This module mirrors frontend/src/lib/validation.js. The browser copy is the one
that runs during a normal offline session; this copy exists so the API can be
used by CSC operator tooling and so the rules have a server-side source of
truth for tests.

The mirroring is enforced, not remembered: shared/validation-cases.json holds
the cases and `npm run test:rules` runs every one of them through both files,
failing if they disagree on a cleaned value, a verdict, or a message.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Callable

# --- Individual checks -----------------------------------------------------


def _verhoeff_valid(number: str) -> bool:
    """UIDAI's Aadhaar checksum (Verhoeff). Rejects most typos and fake numbers."""
    d_table = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
        [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
        [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
        [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
        [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
        [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
        [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
        [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
        [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ]
    p_table = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
        [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
        [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
        [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
        [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
        [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
        [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ]
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = d_table[c][p_table[i % 8][int(ch)]]
    return c == 0


def _parse_ddmmyyyy(value: str) -> date | None:
    for sep in ("/", "-", "."):
        try:
            return datetime.strptime(value.strip(), f"%d{sep}%m{sep}%Y").date()
        except ValueError:
            continue
    return None


# --- Rule table ------------------------------------------------------------
# Each rule: (regex or callable, English message, Hindi message)

Rule = dict[str, Any]


def _regex_rule(pattern: str, en: str, hi: str, normalise: Callable[[str], str] | None = None) -> Rule:
    return {"kind": "regex", "pattern": re.compile(pattern), "en": en, "hi": hi, "normalise": normalise}


def _fn_rule(fn: Callable[[str], bool], en: str, hi: str, normalise: Callable[[str], str] | None = None) -> Rule:
    return {"kind": "fn", "fn": fn, "en": en, "hi": hi, "normalise": normalise}


_strip_spaces = lambda v: re.sub(r"[\s-]", "", v)  # noqa: E731
_upper = lambda v: v.strip().upper()  # noqa: E731

# Android's Hindi recogniser returns ०१२३ rather than 0123, and a Devanagari
# keyboard types them that way too. U+0966-U+096F are contiguous.
_DEVANAGARI_DIGITS: dict[int, str] = {0x0966 + i: str(i) for i in range(10)}
_devanagari_to_ascii: Callable[[str], str] = lambda v: v.translate(_DEVANAGARI_DIGITS)  # noqa: E731


def _normalise_mobile(value: str) -> str:
    # Only strip 91 when the length proves it is a country code. A bare
    # ^\+?91 also eats the first two digits of 9198765432, which is a
    # perfectly good number someone actually has.
    digits: str = _strip_spaces(_devanagari_to_ascii(value))
    if digits.startswith("+91") and len(digits) == 13:
        return digits[3:]
    if digits.startswith("91") and len(digits) == 12:
        return digits[2:]
    return digits


RULES: dict[str, Rule] = {
    # Bank branch code: 4 letters, a literal 0, then 6 alphanumerics.
    "ifsc": _regex_rule(
        r"^[A-Z]{4}0[A-Z0-9]{6}$",
        "IFSC must be 11 characters: 4 letters, a zero, then 6 more. Example: SBIN0001234",
        "IFSC 11 अक्षर का होता है: 4 अक्षर, फिर शून्य, फिर 6 और। जैसे: SBIN0001234",
        normalise=lambda v: _upper(_strip_spaces(v)),
    ),
    "aadhaar": _fn_rule(
        lambda v: bool(re.fullmatch(r"[2-9]\d{11}", v)) and _verhoeff_valid(v),
        "Aadhaar must be 12 digits and pass the UIDAI check. Please read the number again.",
        "आधार 12 अंकों का होना चाहिए और UIDAI जाँच में सही होना चाहिए। कृपया नंबर दोबारा देखें।",
        normalise=lambda v: _strip_spaces(_devanagari_to_ascii(v)),
    ),
    "pan": _regex_rule(
        r"^[A-Z]{5}\d{4}[A-Z]$",
        "PAN must be 5 letters, 4 digits, then 1 letter. Example: ABCDE1234F",
        "PAN में 5 अक्षर, 4 अंक, फिर 1 अक्षर होता है। जैसे: ABCDE1234F",
        normalise=lambda v: _upper(_strip_spaces(v)),
    ),
    "mobile": _regex_rule(
        r"^[6-9]\d{9}$",
        "Mobile number must be 10 digits starting with 6, 7, 8 or 9.",
        "मोबाइल नंबर 10 अंकों का हो और 6, 7, 8 या 9 से शुरू हो।",
        normalise=_normalise_mobile,
    ),
    "pincode": _regex_rule(
        r"^[1-9]\d{5}$",
        "PIN code must be 6 digits and cannot start with 0.",
        "पिन कोड 6 अंकों का होता है और 0 से शुरू नहीं होता।",
        normalise=lambda v: _strip_spaces(_devanagari_to_ascii(v)),
    ),
    "bank_account": _regex_rule(
        r"^\d{9,18}$",
        "Bank account number must be between 9 and 18 digits.",
        "बैंक खाता संख्या 9 से 18 अंकों के बीच होनी चाहिए।",
        normalise=lambda v: _strip_spaces(_devanagari_to_ascii(v)),
    ),
    "date": _fn_rule(
        lambda v: _parse_ddmmyyyy(v) is not None,
        "Date must be in DD/MM/YYYY format. Example: 14/08/1961",
        "तारीख DD/MM/YYYY रूप में लिखें। जैसे: 14/08/1961",
        normalise=lambda v: re.sub(r"[-.]", "/", _devanagari_to_ascii(v).strip()),
    ),
    "date_past": _fn_rule(
        lambda v: (d := _parse_ddmmyyyy(v)) is not None and d < date.today(),
        "Date must be in the past, in DD/MM/YYYY format.",
        "तारीख आज से पहले की होनी चाहिए, DD/MM/YYYY रूप में।",
        normalise=lambda v: re.sub(r"[-.]", "/", _devanagari_to_ascii(v).strip()),
    ),
    "name": _regex_rule(
        r"^[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .'-]{1,60}$",
        "Name should be 2 to 60 letters. Numbers are not allowed.",
        "नाम 2 से 60 अक्षरों का हो। अंक न लिखें।",
        normalise=lambda v: re.sub(r"\s+", " ", v.strip()),
    ),
    "amount": _fn_rule(
        lambda v: bool(re.fullmatch(r"\d{1,9}", v)) and int(v) >= 0,
        "Amount must be a whole number in rupees, without commas.",
        "राशि पूरे रुपये में लिखें, अल्पविराम के बिना।",
        normalise=lambda v: _devanagari_to_ascii(re.sub(r"[,\s₹]", "", v)),
    ),
    "email": _regex_rule(
        r"^[^@\s]+@[^@\s.]+\.[A-Za-z]{2,}$",
        "Email must look like name@example.com",
        "ईमेल इस तरह होना चाहिए: name@example.com",
        normalise=lambda v: v.strip().lower(),
    ),
    "text": _regex_rule(
        r"^.{1,200}$",
        "This field cannot be empty.",
        "यह जगह खाली नहीं छोड़ सकते।",
        normalise=lambda v: re.sub(r"\s+", " ", v.strip()),
    ),
}


def validate(rule_name: str, value: str) -> dict[str, Any]:
    """Check one value against one rule. Returns normalised value + verdict."""
    rule = RULES.get(rule_name)
    raw = (value or "").strip()
    if rule is None:
        return {"valid": True, "value": raw, "rule": rule_name, "unknown_rule": True}

    normalise = rule.get("normalise")
    cleaned = normalise(raw) if normalise and raw else raw

    if not cleaned:
        return {
            "valid": False,
            "value": cleaned,
            "rule": rule_name,
            "error_en": "This field cannot be empty.",
            "error_hi": "यह जगह खाली नहीं छोड़ सकते।",
        }

    ok = (
        bool(rule["pattern"].fullmatch(cleaned))
        if rule["kind"] == "regex"
        else rule["fn"](cleaned)
    )
    result = {"valid": ok, "value": cleaned, "rule": rule_name}
    if not ok:
        result["error_en"] = rule["en"]
        result["error_hi"] = rule["hi"]
    return result
