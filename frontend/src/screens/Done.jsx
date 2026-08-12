/**
 * Done — generate and download the filled form.
 *
 * Two documents come out of here, and the order matters:
 *
 *   1. The **official government form**, with the citizen's answers written
 *      into its own boxes. This is the one they hand across the counter.
 *   2. The **summary sheet**, in their language, for them to keep and check.
 *
 * The summary sheet alone used to be the whole output, which left the citizen
 * hand-copying every value into the real form in English block capitals — the
 * exact task they came to us unable to do. Where an official form exists it is
 * now the headline artefact and the summary is demoted to a record.
 *
 * Both are built here in the browser and saved straight to the device. Neither
 * is ever uploaded, so there is nothing on any server to leak. That is the last
 * of the three privacy promises made on the consent screen, kept.
 */

import { useEffect, useState } from 'react'
import { Banner, Button, Card, Screen, SpeakButton } from '../components/ui'
import { buildFilledPdf, downloadPdf } from '../lib/pdf'
import { buildOfficialPdf } from '../lib/officialPdf'
import { speak } from '../lib/speech'
import { t } from '../lib/i18n'

/** Notes grouped under the heading that tells the citizen what to do about them. */
const NOTE_GROUPS = [
  { kind: 'assumed', title: 'checkTheseTitle', tone: 'info' },
  { kind: 'truncated', title: 'tooLongTitle', tone: 'warn' },
  { kind: 'blank', title: 'stillToFillTitle', tone: 'warn' },
]

export default function Done({
  lang,
  form,
  answers,
  profile,
  onFillAnother,
  onStartOver,
}) {
  const [state, setState] = useState('working') // working | ready | error
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [official, setOfficial] = useState(null) // { blob, notes } | null

  const summaryName = `${form.id}-formmitra.pdf`
  const officialName = `${form.id}-official-form.pdf`

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const sheet = await buildFilledPdf(form, answers, lang, {
          digilockerUsed: Boolean(profile),
        })
        if (cancelled) return
        setSummary(sheet)

        // Only some templates have an official blank mapped to them. A failure
        // here must not cost the citizen the summary sheet they already have,
        // so it is caught separately rather than failing the whole screen.
        let filled = null
        if (form.officialForm) {
          try {
            filled = await buildOfficialPdf(answers)
            if (cancelled) return
            setOfficial(filled)
          } catch (err) {
            console.error('official form overlay failed', err)
          }
        }

        setState('ready')
        // Download the government form first — it is the one that gets submitted.
        if (filled) downloadPdf(filled.blob, officialName)
        downloadPdf(sheet, summaryName)
        speak(t('doneTitle', lang), lang)
      } catch (err) {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'working') {
    return (
      <Screen className="pt-16 text-center">
        <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
        <p className="text-2xl font-bold">{t('creatingPdf', lang)}</p>
      </Screen>
    )
  }

  if (state === 'error') {
    return (
      <Screen className="pt-10">
        <Banner tone="bad" className="mb-5">
          {error}
        </Banner>
        <Button onClick={onStartOver}>{t('startOver', lang)}</Button>
      </Screen>
    )
  }

  return (
    <Screen className="pt-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-good-50 text-good-500">
          <svg
            width="52"
            height="52"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m4 12 6 6L20 6" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold">{t('doneTitle', lang)}</h1>
      </div>

      {official && (
        <Card className="mb-4 border-2 border-brand-500">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h2 className="mb-1 text-xl font-bold text-brand-700">
                {t('officialFormTitle', lang)}
              </h2>
              <p className="text-lg leading-relaxed">
                {t('officialFormBody', lang)}
              </p>
            </div>
            <SpeakButton
              lang={lang}
              text={`${t('officialFormTitle', lang)}. ${t('officialFormBody', lang)}`}
            />
          </div>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-3 py-2 font-mono text-base break-all">
            📄 {officialName}
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {official && (
              <h2 className="mb-1 text-xl font-bold">
                {t('summarySheetLabel', lang)}
              </h2>
            )}
            <p className="text-lg leading-relaxed">
              {official ? t('summarySheetBody', lang) : t('doneBody', lang)}
            </p>
          </div>
          <SpeakButton
            lang={lang}
            text={official ? t('summarySheetBody', lang) : t('doneBody', lang)}
          />
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-3 py-2 font-mono text-base break-all">
          📄 {summaryName}
        </p>
      </Card>

      {official && <NoteList notes={official.notes} lang={lang} />}

      <Banner tone="warn" className="mb-5">
        {t('notSubmitted', lang)}
      </Banner>

      <div className="grid gap-3">
        {official && (
          <Button onClick={() => downloadPdf(official.blob, officialName)}>
            {t('downloadOfficial', lang)}
          </Button>
        )}
        <Button
          variant={official ? 'secondary' : 'primary'}
          onClick={() => downloadPdf(summary, summaryName)}
        >
          {t(official ? 'downloadSummary' : 'downloadPdf', lang)}
        </Button>
        <Button variant="secondary" onClick={onFillAnother}>
          {t('fillAnother', lang)}
        </Button>
      </div>
    </Screen>
  )
}

/**
 * What the overlay could not do for them.
 *
 * Spoken as well as shown, because the citizen who needs this app is the one
 * who cannot read a list of caveats printed in small type.
 */
function NoteList({ notes, lang }) {
  const pick = (s) => (typeof s === 'string' ? s : (s?.[lang] ?? s?.en ?? ''))

  return NOTE_GROUPS.map(({ kind, title, tone }) => {
    const group = notes.filter((n) => n.kind === kind)
    if (group.length === 0) return null

    const spoken = [
      t(title, lang),
      ...group.map((n) => [pick(n.label), pick(n.detail)].filter(Boolean).join('. ')),
    ].join('. ')

    return (
      <Card key={kind} className="mb-4">
        <div className="flex items-start gap-3">
          <h2
            className={`flex-1 text-lg font-bold ${
              tone === 'warn' ? 'text-saffron-600' : 'text-brand-700'
            }`}
          >
            {t(title, lang)}
          </h2>
          <SpeakButton lang={lang} text={spoken} />
        </div>
        <ul className="mt-3 grid gap-2">
          {group.map((n, i) => (
            <li key={i} className="border-l-4 border-line pl-3">
              <p className="font-semibold">{pick(n.label)}</p>
              {n.detail && (
                <p className="text-base leading-relaxed text-ink-soft">
                  {pick(n.detail)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    )
  })
}
