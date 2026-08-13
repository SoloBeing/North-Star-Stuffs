/**
 * Which of a form's fields apply right now.
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
 */

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
