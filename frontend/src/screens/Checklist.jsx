/**
 * Document checklist, cross-referenced against DigiLocker.
 *
 * The point: if a form needs an income certificate and the citizen already has
 * one issued in their DigiLocker, tell them so — instead of sending them to a
 * tehsil office for a document they are already holding.
 *
 * We only read the *list* of issued documents, never their contents. That is a
 * deliberate scope limit, and it is what makes this feature honest.
 */

import { BottomBar, Button, Card, Screen, SpeakButton } from '../components/ui'
import { CheckIcon } from '../components/ui'
import { t } from '../lib/i18n'

export default function Checklist({
  lang,
  form,
  issuedDocuments,
  onContinue,
  onBack,
}) {
  const issuedTypes = new Set((issuedDocuments ?? []).map((d) => d.type))

  const rows = form.documents.map((doc) => ({
    ...doc,
    have: Boolean(doc.digilockerType && issuedTypes.has(doc.digilockerType)),
  }))
  const haveCount = rows.filter((r) => r.have).length

  return (
    <Screen>
      <div className="mb-2 flex items-start gap-3">
        <h1 className="flex-1 text-2xl font-bold">{t('checklistTitle', lang)}</h1>
        <SpeakButton
          lang={lang}
          text={`${t('checklistTitle', lang)}. ${rows
            .map((r) => r[lang])
            .join('. ')}`}
        />
      </div>
      <p className="mb-5 text-lg text-ink-soft">{t('checklistHint', lang)}</p>

      {haveCount > 0 && (
        <Card className="mb-5 border-good-500 bg-good-50">
          <p className="text-lg font-bold text-good-600">
            {lang === 'hi'
              ? `${haveCount} दस्तावेज़ आपके डिजिलॉकर में पहले से मौजूद हैं`
              : `${haveCount} of these are already in your DigiLocker`}
          </p>
          <p className="mt-1 text-base text-ink-soft">
            {lang === 'hi'
              ? 'इन्हें कहीं से बनवाने की ज़रूरत नहीं — डिजिलॉकर ऐप से दिखा सकते हैं।'
              : 'You do not need to arrange these — you can show them from the DigiLocker app.'}
          </p>
        </Card>
      )}

      <div className="mb-6 space-y-2">
        {rows.map((doc) => (
          <div
            key={doc.en}
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              doc.have ? 'border-good-500 bg-good-50' : 'border-line bg-white'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                doc.have
                  ? 'bg-good-500 text-white'
                  : 'border-2 border-ink-soft/40 bg-white'
              }`}
            >
              {doc.have && <CheckIcon size={18} />}
            </span>
            <div className="min-w-0">
              <p className="text-lg leading-snug font-semibold">{doc[lang]}</p>
              <p
                className={`mt-0.5 text-base ${
                  doc.have ? 'font-semibold text-good-600' : 'text-ink-soft'
                }`}
              >
                {doc.have ? t('youHaveThis', lang) : t('needToArrange', lang)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <BottomBar>
        <Button variant="secondary" onClick={onBack} className="max-w-32">
          {t('back', lang)}
        </Button>
        <Button onClick={onContinue}>{t('downloadPdf', lang)}</Button>
      </BottomBar>
    </Screen>
  )
}
