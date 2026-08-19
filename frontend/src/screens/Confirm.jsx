/**
 * Confirm — step 8, reading every answer back.
 *
 * This is the step that catches the mistake before it costs someone six weeks.
 * The app reads each answer aloud in the form the citizen can actually check:
 * an Aadhaar number comes back as "2 3 4 5, 6 7 8 9, 0 1 2 4", not as a
 * quarter-trillion.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Banner,
  BottomBar,
  Button,
  Card,
  Screen,
  SpeakButton,
} from '../components/ui'
import { displayValue, isPrefilled } from '../lib/fields'
import { speak, stopSpeaking } from '../lib/speech'
import { speakableValue } from '../lib/validation'
import { t } from '../lib/i18n'

export default function Confirm({
  lang,
  form,
  answers,
  profile,
  onEditField,
  onConfirm,
  onBack,
}) {
  const [reading, setReading] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const cancelled = useRef(false)

  const filled = form.fields.filter(
    (f) => answers[f.id] !== undefined && answers[f.id] !== '',
  )

  useEffect(
    () => () => {
      cancelled.current = true
      stopSpeaking()
    },
    [],
  )

  /** What the citizen sees for one answer, rendered exactly as the sheet prints it. */
  const shown = (field) => displayValue(field, answers[field.id], lang)

  /** Read every answer in turn: "IFSC code. S B I N ... — is this correct?" */
  async function readAll() {
    if (reading) {
      cancelled.current = true
      stopSpeaking()
      setReading(false)
      setActiveId(null)
      return
    }
    cancelled.current = false
    setReading(true)
    for (const field of filled) {
      if (cancelled.current) break
      setActiveId(field.id)
      const spoken =
        field.rule === 'choice'
          ? shown(field)
          : speakableValue(field, answers[field.id])
      await speak(
        `${field.label[lang]}. ${spoken}. ${t('isThisCorrect', lang)}`,
        lang,
      )
    }
    setReading(false)
    setActiveId(null)
  }

  return (
    <Screen>
      <div className="mb-2 flex items-start gap-3">
        <h1 className="flex-1 text-2xl font-bold">{t('confirmTitle', lang)}</h1>
        <SpeakButton lang={lang} text={t('confirmHint', lang)} />
      </div>
      <p className="mb-5 text-lg text-ink-soft">{t('confirmHint', lang)}</p>

      <Button
        variant={reading ? 'danger' : 'secondary'}
        onClick={readAll}
        className="mb-5"
      >
        {reading ? t('stopReading', lang) : t('readAloud', lang)}
      </Button>

      <div className="mb-6 space-y-2">
        {filled.map((field) => {
          const fromDigilocker = isPrefilled(field, profile)
          return (
            <Card
              key={field.id}
              onClick={() => {
                stopSpeaking()
                setReading(false)
                onEditField(field)
              }}
              className={`p-4 transition ${
                activeId === field.id
                  ? 'border-brand-600 bg-brand-50 shadow-md'
                  : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink-soft">
                    {field.label[lang]}
                  </p>
                  <p className="mt-0.5 text-xl leading-snug font-bold break-words">
                    {shown(field)}
                  </p>
                  {fromDigilocker && (
                    <p className="mt-1 text-sm font-bold text-good-500">
                      ✓ {t('verified', lang)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 self-center rounded-lg bg-brand-50 px-3 py-2 text-base font-bold text-brand-600">
                  {t('change', lang)}
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      <Banner tone="warn" className="mb-4">
        {t('notSubmitted', lang)}
      </Banner>

      <BottomBar>
        <Button variant="secondary" onClick={onBack} className="max-w-32">
          {t('back', lang)}
        </Button>
        <Button variant="good" onClick={onConfirm}>
          {t('allCorrect', lang)}
        </Button>
      </BottomBar>
    </Screen>
  )
}
