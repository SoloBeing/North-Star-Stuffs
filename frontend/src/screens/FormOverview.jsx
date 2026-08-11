/**
 * Form overview — step 5 of the flow, "tap any field to hear what it means".
 *
 * This is the screen that does the thing a cyber-café agent charges ₹50 for:
 * telling you what a field actually means and what happens if you get it wrong.
 * Every explanation is pre-written and human-reviewed. No model is consulted,
 * here or anywhere else in template mode.
 */

import { useState } from 'react'
import {
  Banner,
  BottomBar,
  Button,
  Card,
  Screen,
  SpeakButton,
} from '../components/ui'
import { t } from '../lib/i18n'

export default function FormOverview({ lang, form, profile, onStart, onBack }) {
  const [openField, setOpenField] = useState(null)

  const prefilled = form.fields.filter(
    (f) => f.source === 'digilocker' && profile?.[f.profileKey],
  )
  const willAsk = form.fields.filter(
    (f) => !(f.source === 'digilocker' && profile?.[f.profileKey]),
  )

  return (
    <Screen>
      <div className="mb-2 flex items-start gap-3">
        <span aria-hidden="true" className="text-4xl leading-none">
          {form.icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-bold">{form.name[lang]}</h1>
          <p className="mt-1 text-base text-ink-soft">{form.issuer[lang]}</p>
        </div>
        <SpeakButton
          className="ml-auto"
          lang={lang}
          text={`${form.name[lang]}. ${form.summary[lang]}`}
        />
      </div>

      <div className="my-5 grid grid-cols-3 gap-2 text-center">
        <Stat value={form.fields.length} label={t('fieldsTotal', lang)} />
        <Stat
          value={prefilled.length}
          label={t('autoFilled', lang)}
          tone="good"
        />
        <Stat value={willAsk.length} label={t('weWillAsk', lang)} tone="brand" />
      </div>

      {prefilled.length > 0 && (
        <Banner tone="good" className="mb-5">
          {lang === 'hi'
            ? `डिजिलॉकर से ${prefilled.length} जगह पहले ही भर दी गई हैं — वे आपसे नहीं पूछी जाएँगी।`
            : `${prefilled.length} fields are already filled from DigiLocker — you will not be asked those.`}
        </Banner>
      )}

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-bold">{t('tapToUnderstand', lang)}</h2>
      </div>

      <div className="mb-6 space-y-2">
        {form.fields.map((field) => {
          const isPrefilled =
            field.source === 'digilocker' && profile?.[field.profileKey]
          const open = openField === field.id
          return (
            <div
              key={field.id}
              className={`overflow-hidden rounded-xl border bg-white transition ${
                open ? 'border-brand-500 shadow-sm' : 'border-line'
              }`}
            >
              <button
                onClick={() => setOpenField(open ? null : field.id)}
                aria-expanded={open}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">
                    {field.label[lang]}
                  </span>
                  {isPrefilled && (
                    <span className="mt-0.5 block text-sm font-semibold text-good-500">
                      ✓ {profile[field.profileKey]}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-brand-600 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>

              {open && (
                <div className="fm-rise border-t border-line bg-brand-50/60 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-lg leading-relaxed">
                      {field.explain[lang]}
                    </p>
                    <SpeakButton
                      lang={lang}
                      text={field.explain[lang]}
                      label={t('listen', lang)}
                    />
                  </div>
                  {field.example && (
                    <p className="mt-3 text-base text-ink-soft">
                      {t('example', lang)}:{' '}
                      <span className="font-mono font-semibold text-ink">
                        {field.example}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BottomBar>
        <Button variant="secondary" onClick={onBack} className="max-w-32">
          {t('back', lang)}
        </Button>
        <Button onClick={onStart}>{t('startFilling', lang)}</Button>
      </BottomBar>
    </Screen>
  )
}

function Stat({ value, label, tone = 'plain' }) {
  const styles = {
    plain: 'bg-white border-line text-ink',
    good: 'bg-good-50 border-good-500 text-good-600',
    brand: 'bg-brand-50 border-brand-500 text-brand-700',
  }[tone]
  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="text-3xl font-extrabold">{value}</div>
      <div className="mt-0.5 text-sm leading-tight font-semibold">{label}</div>
    </div>
  )
}
