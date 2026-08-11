/**
 * Scan — photograph a form and identify it.
 *
 * Uses a plain file input with `capture`, not getUserMedia. That gets us the
 * phone's own camera app, which citizens already know how to use, handles
 * focus and flash properly, and needs no camera permission dance. A custom
 * viewfinder would look more impressive in a demo and work worse in a CSC.
 */

import { useRef, useState } from 'react'
import { Banner, Button, Card, Screen, SpeakButton } from '../components/ui'
import { FORMS } from '../data/forms'
import { scanForm } from '../lib/ocr'
import { t } from '../lib/i18n'

export default function Scan({ lang, onPickForm, onBack }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setResult(null)
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    setProgress(0)

    try {
      const scan = await scanForm(file, (p) => setProgress(p))
      setResult(scan)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t('scanTitle', lang)}</h1>
        <SpeakButton
          className="ml-auto"
          lang={lang}
          text={`${t('scanTitle', lang)}. ${t('scanHint', lang)}`}
        />
      </div>
      <p className="mb-5 text-lg text-ink-soft">{t('scanHint', lang)}</p>

      {preview && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-line bg-white">
          <img
            src={preview}
            alt=""
            className="max-h-72 w-full object-contain bg-ink/5"
          />
        </div>
      )}

      {busy && (
        <Card className="mb-5">
          <p className="mb-3 text-xl font-bold">{t('reading', lang)}</p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-base text-ink-soft">
            {lang === 'hi'
              ? 'यह आपके फोन पर ही हो रहा है — फोटो कहीं नहीं भेजी जा रही।'
              : 'This is happening on your phone — the photo is not being sent anywhere.'}
          </p>
        </Card>
      )}

      {error && (
        <Banner tone="bad" className="mb-5">
          {error}
        </Banner>
      )}

      {result?.best && (
        <Card className="mb-5 border-good-500 bg-good-50">
          <p className="text-base font-semibold text-good-600">
            {t('recognised', lang)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <span aria-hidden="true">{result.best.form.icon}</span>
            {result.best.form.name[lang]}
          </p>
          <p className="mt-1 text-base text-ink-soft">
            {Math.round(result.best.confidence * 100)}%{' '}
            {lang === 'hi' ? 'मिलान' : 'match'} · {result.best.hits.length}{' '}
            {lang === 'hi' ? 'संकेत मिले' : 'keywords found'}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button variant="good" onClick={() => onPickForm(result.best.form)}>
              {t('yesCorrect', lang)}
            </Button>
            <Button variant="secondary" onClick={() => setResult({ ...result, best: null })}>
              {t('noPickAnother', lang)}
            </Button>
          </div>
        </Card>
      )}

      {result && !result.best && (
        <>
          <Banner tone="warn" className="mb-4">
            {t('notRecognised', lang)}. {t('pickManually', lang)}
          </Banner>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {FORMS.map((form) => (
              <Card key={form.id} onClick={() => onPickForm(form)} className="p-4">
                <span className="flex items-center gap-3">
                  <span aria-hidden="true" className="text-2xl">
                    {form.icon}
                  </span>
                  <span className="text-lg font-bold">{form.name[lang]}</span>
                </span>
              </Card>
            ))}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {!busy && (
        <div className="grid gap-3">
          <Button onClick={() => fileRef.current?.click()}>
            {preview ? t('choosePhoto', lang) : t('takePhoto', lang)}
          </Button>
          <Button variant="secondary" onClick={onBack}>
            {t('back', lang)}
          </Button>
        </div>
      )}
    </Screen>
  )
}
