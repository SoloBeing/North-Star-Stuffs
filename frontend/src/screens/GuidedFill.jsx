/**
 * Guided fill — one question at a time, by voice.
 *
 * The rules this screen is built around:
 *   * One question per screen. Never two.
 *   * The question is spoken automatically on arrival, because the citizen may
 *     not be able to read it.
 *   * Voice is an accelerator, never a requirement — the text box beneath the
 *     mic is always live, and everything works with the mic broken or absent.
 *   * A rejected answer explains itself out loud in the citizen's language,
 *     rather than turning a box red at someone who cannot read the message.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Banner,
  BottomBar,
  Button,
  Card,
  MicIcon,
  Progress,
  Screen,
  SpeakButton,
} from '../components/ui'
import {
  canListen,
  listenOnce,
  matchChoice,
  normaliseSpoken,
  speak,
  stopSpeaking,
} from '../lib/speech'
import { validateField } from '../lib/validation'
import { t } from '../lib/i18n'

export default function GuidedFill({
  lang,
  form,
  fields,
  answers,
  onAnswer,
  onDone,
  onBack,
}) {
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [partial, setPartial] = useState('')
  const [error, setError] = useState(null)
  const [showExplain, setShowExplain] = useState(false)
  const recogniserRef = useRef(null)

  const field = fields[index]
  const isChoice = field?.rule === 'choice'

  // Load any existing answer, and read the question aloud on arrival.
  useEffect(() => {
    if (!field) return
    setDraft(answers[field.id] ?? '')
    setError(null)
    setPartial('')
    setShowExplain(false)
    speak(field.question[lang], lang)
    return () => stopSpeaking()
    // Re-run when the question changes or the language is switched mid-flow.
  }, [field?.id, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSpoken = useCallback(
    (text) => {
      if (isChoice) {
        const matched = matchChoice(text, field)
        if (matched) {
          setDraft(matched)
          setError(null)
        } else {
          setError(
            lang === 'hi'
              ? 'कृपया दिए गए विकल्पों में से एक चुनें या बोलिए।'
              : 'Please pick or say one of the given options.',
          )
        }
        return
      }
      const normalised = normaliseSpoken(text, field)
      setDraft(normalised)
      const check = validateField(field, normalised, lang)
      setError(check.valid ? null : check.error)
      if (!check.valid) speak(check.error, lang)
    },
    [field, isChoice, lang],
  )

  function startListening() {
    if (listening) {
      recogniserRef.current?.stop()
      return
    }
    stopSpeaking()
    setError(null)
    setPartial('')
    setListening(true)
    recogniserRef.current = listenOnce(lang, {
      onPartial: setPartial,
      onResult: handleSpoken,
      onError: (kind) => {
        setListening(false)
        setError(
          kind === 'unsupported' ? t('micBlocked', lang) : t('didNotHear', lang),
        )
      },
      onEnd: () => {
        setListening(false)
        setPartial('')
      },
    })
  }

  function goNext() {
    const check = validateField(field, draft, lang)
    if (!check.valid) {
      setError(check.error)
      speak(check.error, lang)
      return
    }
    onAnswer(field.id, check.value)
    stopSpeaking()
    if (index + 1 < fields.length) setIndex(index + 1)
    else onDone()
  }

  function goBack() {
    stopSpeaking()
    if (index === 0) onBack()
    else setIndex(index - 1)
  }

  if (!field) return null

  return (
    <Screen>
      <Progress current={index + 1} total={fields.length} lang={lang} />

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <h1 className="flex-1 text-2xl leading-snug font-bold">
            {field.question[lang]}
          </h1>
          <SpeakButton lang={lang} text={field.question[lang]} />
        </div>

        {field.example && !isChoice && (
          <p className="mt-3 text-base text-ink-soft">
            {t('example', lang)}:{' '}
            <span className="font-mono font-semibold text-ink">
              {field.example}
            </span>
          </p>
        )}

        <button
          onClick={() => {
            setShowExplain((v) => !v)
            if (!showExplain) speak(field.explain[lang], lang)
          }}
          className="mt-4 min-h-12 rounded-lg px-3 text-lg font-bold text-brand-600 underline underline-offset-4 hover:bg-brand-50"
        >
          {t('whatIsThis', lang)}
        </button>

        {showExplain && (
          <div className="fm-rise mt-3 rounded-xl bg-brand-50 p-4 text-lg leading-relaxed">
            {field.explain[lang]}
          </div>
        )}
      </Card>

      {isChoice ? (
        <div className="mb-4 space-y-3">
          {field.options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setDraft(option.value)
                setError(null)
              }}
              aria-pressed={draft === option.value}
              className={`min-h-16 w-full rounded-xl border-2 px-5 py-3 text-left text-xl font-bold transition ${
                draft === option.value
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-line bg-white hover:border-brand-500'
              }`}
            >
              {option[lang]}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col items-center">
            <button
              onClick={startListening}
              disabled={!canListen}
              aria-label={listening ? t('listening', lang) : t('tapToSpeak', lang)}
              className={`flex h-28 w-28 items-center justify-center rounded-full text-white transition disabled:opacity-40 ${
                listening
                  ? 'fm-listening bg-bad-500'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              <MicIcon size={44} />
            </button>
            <p className="mt-3 text-lg font-semibold text-ink-soft">
              {!canListen
                ? t('micBlocked', lang)
                : listening
                  ? t('listening', lang)
                  : t('tapToSpeak', lang)}
            </p>
            {partial && (
              <p className="mt-1 text-lg text-brand-600 italic">"{partial}"</p>
            )}
          </div>

          <label className="mb-4 block">
            <span className="mb-2 block text-lg font-semibold text-ink-soft">
              {t('typeInstead', lang)}
            </span>
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setError(null)
              }}
              inputMode={
                ['aadhaar', 'mobile', 'pincode', 'bank_account', 'amount'].includes(
                  field.rule,
                )
                  ? 'numeric'
                  : 'text'
              }
              className={`min-h-16 w-full rounded-xl border-2 bg-white px-4 text-2xl font-semibold outline-none ${
                error ? 'border-bad-500' : 'border-line focus:border-brand-500'
              }`}
            />
          </label>
        </>
      )}

      {error && (
        <Banner tone="bad" className="mb-4">
          {error}
        </Banner>
      )}

      <BottomBar>
        <Button variant="secondary" onClick={goBack} className="max-w-32">
          {t('back', lang)}
        </Button>
        <Button onClick={goNext} disabled={!draft}>
          {index + 1 === fields.length ? t('allCorrect', lang) : t('next', lang)}
        </Button>
      </BottomBar>
    </Screen>
  )
}
