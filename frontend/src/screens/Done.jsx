/**
 * Done — generate and download the filled PDF.
 *
 * The PDF is built here in the browser and saved straight to the device. It is
 * never uploaded, so there is nothing on any server to leak. That is the last
 * of the three privacy promises made on the consent screen, kept.
 */

import { useEffect, useState } from 'react'
import { Banner, Button, Card, Screen, SpeakButton } from '../components/ui'
import { buildFilledPdf, downloadPdf } from '../lib/pdf'
import { speak } from '../lib/speech'
import { t } from '../lib/i18n'

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
  const [blob, setBlob] = useState(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const pdf = await buildFilledPdf(form, answers, lang, {
          digilockerUsed: Boolean(profile),
        })
        if (cancelled) return
        setBlob(pdf)
        setState('ready')
        downloadPdf(pdf, `${form.id}-formmitra.pdf`)
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

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-lg leading-relaxed">{t('doneBody', lang)}</p>
          <SpeakButton lang={lang} text={t('doneBody', lang)} />
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-3 py-2 font-mono text-base break-all">
          📄 {form.id}-formmitra.pdf
        </p>
      </Card>

      <Banner tone="warn" className="mb-5">
        {t('notSubmitted', lang)}
      </Banner>

      <div className="grid gap-3">
        <Button onClick={() => downloadPdf(blob, `${form.id}-formmitra.pdf`)}>
          {t('downloadPdf', lang)}
        </Button>
        <Button variant="secondary" onClick={onFillAnother}>
          {t('fillAnother', lang)}
        </Button>
      </div>
    </Screen>
  )
}
