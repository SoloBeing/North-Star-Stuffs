/**
 * Home — the form grid.
 *
 * One decision per screen: either sign in to save yourself typing, scan a form
 * you are holding, or pick one from the list. Nothing else competes for
 * attention.
 */

import { Banner, Button, Card, Screen, SpeakButton } from '../components/ui'
import { FORMS } from '../data/forms'
import { t } from '../lib/i18n'

export default function Home({
  lang,
  profile,
  onLogin,
  onScan,
  onPickForm,
  loggingIn,
  offline,
}) {
  return (
    <Screen>
      {/* DigiLocker: the single highest-value action on this screen. */}
      {profile ? (
        <Card className="mb-4 border-good-500 bg-good-50">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-good-600">
                {t('loggedInAs', lang)}
              </p>
              <p className="truncate text-2xl font-bold">{profile.name}</p>
              <p className="mt-1 text-base text-ink-soft">
                {profile.dob} · {profile.gender} · {profile.pincode}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-good-500 px-2 py-1 text-sm font-bold text-white">
                ✓ {t('verified', lang)}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mb-4 border-brand-500 bg-brand-50">
          <p className="mb-1 text-xl font-bold text-brand-700">
            {t('loginDigilocker', lang)}
          </p>
          <p className="mb-4 text-lg text-ink-soft">{t('loginHint', lang)}</p>
          <Button onClick={onLogin} disabled={loggingIn || offline}>
            {loggingIn ? '…' : t('loginDigilocker', lang)}
          </Button>
          {offline && (
            <p className="mt-2 text-base text-ink-soft">
              {lang === 'hi'
                ? 'लॉगिन के लिए इंटरनेट चाहिए — बाकी सब बिना इंटरनेट चलता है।'
                : 'Login needs internet — everything else works without it.'}
            </p>
          )}
        </Card>
      )}

      <button
        onClick={onScan}
        className="mb-7 flex min-h-24 w-full items-center gap-4 rounded-2xl border-2 border-dashed border-brand-500 bg-white px-5 py-4 text-left transition hover:bg-brand-50"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9V6a3 3 0 0 1 3-3h3M15 3h3a3 3 0 0 1 3 3v3M21 15v3a3 3 0 0 1-3 3h-3M9 21H6a3 3 0 0 1-3-3v-3" />
            <circle cx="12" cy="12" r="3.2" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-xl font-bold">{t('scanAny', lang)}</span>
          <span className="block text-base text-ink-soft">
            {t('scanAnyHint', lang)}
          </span>
        </span>
      </button>

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-2xl font-bold">{t('pickForm', lang)}</h2>
        <SpeakButton className="ml-auto" lang={lang} text={t('pickForm', lang)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORMS.map((form) => (
          <Card key={form.id} onClick={() => onPickForm(form)} className="p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="text-3xl leading-none">
                {form.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-lg leading-snug font-bold">
                  {form.name[lang]}
                </span>
                <span className="mt-1 block text-base leading-snug text-ink-soft">
                  {form.summary[lang]}
                </span>
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Banner tone="good" className="mt-6">
        ✓ {t('offlineReady', lang)}
      </Banner>
    </Screen>
  )
}
