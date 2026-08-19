/**
 * Reading a form's fields: which apply, which still need asking, how one reads back.
 *
 * Most fields always apply. A few only make sense once an earlier answer is
 * known: Form 93 asks for the mother's name only when the applicant has *not*
 * said they have a single parent, because the form's own item 12 gates item 14.
 * A template expresses that with `showIf`, naming an earlier field and the
 * answer (or answers) that unlock this one.
 *
 * Asking a question that cannot apply is bad enough. Worse is keeping its
 * answer: a citizen who fills in their mother's name, then goes back and says
 * they have a single parent, must not have that name stamped into the
 * government's form. Rather than teach every reader of `answers` about `showIf`,
 * App drops the answer as soon as its question stops being asked — see
 * `staleFields`. Everything downstream (the confirm read-back, both PDFs)
 * already ignores absent answers, so they need no changes and cannot forget.
 *
 * The other question a screen keeps asking — has DigiLocker already answered
 * this, so nobody need be? — used to be spelled out at each call site, seven
 * times over four files, each copy free to drift from the rest. It is
 * `isPrefilled` now, and `askableFields` composes the two: the fields that
 * apply AND that somebody still has to be asked about. Reach for that one.
 */

import { pick } from './i18n.js'

/** Does this field apply, given the answers so far? */
export function isVisible(field, answers = {}) {
  if (!field.showIf) return true
  return Object.entries(field.showIf).every(([id, allowed]) => {
    const value = answers[id]
    return Array.isArray(allowed) ? allowed.includes(value) : allowed === value
  })
}

/** The subset of a form's fields that apply, in template order. */
export function visibleFields(form, answers = {}) {
  return form?.fields?.filter((field) => isVisible(field, answers)) ?? []
}

/** Fields carrying an answer that no longer applies, so it can be dropped. */
export function staleFields(form, answers = {}) {
  return (
    form?.fields?.filter(
      (field) => !isVisible(field, answers) && answers[field.id] !== undefined,
    ) ?? []
  )
}

/**
 * Has this field already been answered by the DigiLocker profile?
 *
 * Both halves matter. A field can name a `profileKey` the profile turns out not
 * to carry — DigiLocker returns what the issuing department holds, not a fixed
 * set — and then the citizen is asked for it like any other. Testing only
 * `source` would skip the question and leave the box empty; testing only the
 * profile would claim a hand-typed value came from a verified source.
 */
export function isPrefilled(field, profile) {
  return field.source === 'digilocker' && Boolean(profile?.[field.profileKey])
}

/** The fields the voice flow must actually ask about, in template order. */
export function askableFields(form, answers = {}, profile = null) {
  return visibleFields(form, answers).filter((f) => !isPrefilled(f, profile))
}

/**
 * How one answer should be shown to the citizen.
 *
 * The confirm screen exists so somebody can check the document against what
 * they said, which only works while the two render a value the same way. They
 * did not: an income of 180000 was listed as `180000` on screen and printed as
 * `₹1,80,000` on the sheet. One function now, called by both.
 *
 * Spoken output is deliberately not this — see `speakableValue` in
 * validation.js, which spaces digits out so a screen reader says an Aadhaar
 * number one digit at a time instead of naming a quarter-trillion.
 */
export function displayValue(field, value, lang = 'hi') {
  if (value === undefined || value === '') return value

  if (field.rule === 'choice') {
    return pick(
      field.options?.find((option) => option.value === value),
      lang,
      value,
    )
  }

  // Indian grouping: a clerk reading "₹1,80,000" checks it at a glance, where
  // "180000" has to be counted digit by digit.
  if (field.rule === 'amount' && /^\d+$/.test(value)) {
    return `₹${Number(value).toLocaleString('en-IN')}`
  }

  return value
}
