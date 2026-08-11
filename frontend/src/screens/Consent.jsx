/**
 * Consent screen — the first thing anyone sees.
 *
 * DPDP Act alignment means consent comes *before* any data is touched, not
 * buried in a settings page. It doubles as the language chooser, because
 * picking your language is the one thing a citizen can do before they can read
 * anything else on the screen.
 */

import { Button, Card, Screen, SpeakButton } from '../components/ui'
import { t } from '../lib/i18n'

const LANGUAGES = [
  { code: 'hi', label: 'हिंदी', sub: 'Hindi' },
  { code: 'en', label: 'English', sub: 'अंग्रेज़ी' },
]

export default function Consent({ lang, onLangChange, onAgree }) {
  const points = [
    t('consentPoint1', lang),
    t('consentPoint2', lang),
    t('consentPoint3', lang),
  ]

  return (
    <Screen className="pt-8">
      <div className="mb-8 text-center">
        <img
          src="/icon-192.png"
          alt=""
          className="mx-auto mb-4 h-20 w-20 rounded-2xl shadow-sm"
        />
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-700">
          {t('appName', lang)}
        </h1>
        <p className="mt-1 text-xl text-ink-soft">{t('tagline', lang)}</p>
      </div>

      <h2 className="mb-3 text-lg font-bold text-ink-soft">
        {t('chooseLanguage', lang)}
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => onLangChange(l.code)}
            aria-pressed={lang === l.code}
            className={`min-h-20 rounded-2xl border-2 px-4 py-3 transition ${
              lang === l.code
                ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                : 'border-line bg-white text-ink hover:border-brand-500'
            }`}
          >
            <div className="text-2xl font-bold">{l.label}</div>
            <div
              className={`text-base ${
                lang === l.code ? 'text-brand-100' : 'text-ink-soft'
              }`}
            >
              {l.sub}
            </div>
          </button>
        ))}
      </div>

      <Card className="mb-6">
        <div className="mb-3 flex items-start gap-3">
          <h2 className="text-2xl font-bold">{t('consentTitle', lang)}</h2>
          <SpeakButton
            className="ml-auto"
            lang={lang}
            text={`${t('consentBody', lang)} ${points.join('. ')}`}
          />
        </div>
        <p className="mb-4 text-lg leading-relaxed text-ink-soft">
          {t('consentBody', lang)}
        </p>
        <ul className="space-y-3">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-good-50 text-good-500"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4 12 6 6L20 6" />
                </svg>
              </span>
              <span className="text-lg">{point}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Button onClick={onAgree}>{t('agree', lang)}</Button>
    </Screen>
  )
}
