/**
 * FormMitra — app shell and flow control.
 *
 * The nine steps from the spec map onto these screens:
 *
 *   consent  -> DPDP consent + language          (before any data is touched)
 *   home     -> DigiLocker login, form grid, scan
 *   scan     -> camera -> Tesseract -> identify
 *   overview -> tap a field to hear what it means
 *   fill     -> one voice question at a time, validated
 *   confirm  -> every answer read back aloud
 *   checklist-> documents to carry, cross-referenced with DigiLocker
 *   done     -> pdf-lib builds the PDF, saved to the device
 *
 * Answers live in component state and nowhere else. They are never written to
 * localStorage and never sent to a server — closing the tab genuinely destroys
 * them, which is what the consent screen promises.
 */

import { useCallback, useEffect, useState } from 'react'
import { Header, Button } from './components/ui'
import Consent from './screens/Consent'
import Home from './screens/Home'
import Scan from './screens/Scan'
import FormOverview from './screens/FormOverview'
import GuidedFill from './screens/GuidedFill'
import Confirm from './screens/Confirm'
import Checklist from './screens/Checklist'
import Done from './screens/Done'
import { stopSpeaking } from './lib/speech'
import { releaseOcr } from './lib/ocr'
import { askableFields, isPrefilled, staleFields } from './lib/fields'
import { t } from './lib/i18n'

const LANG_KEY = 'formmitra.lang'
const CONSENT_KEY = 'formmitra.consented'

/**
 * Turn a technical failure into a string key the citizen can act on.
 *
 * What arrives here is a Python exception rendered by the backend, or a fetch
 * error like "Failed to fetch". Showing that to someone who cannot read
 * bureaucratic English is the same failure this app exists to fix, so the raw
 * cause goes to the console and the citizen gets a sentence.
 */
function loginProblem(cause) {
  console.warn('DigiLocker login failed:', cause)
  return cause === 'cancelled' ? 'loginCancelled' : 'loginFailed'
}

export default function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem(LANG_KEY) ?? 'hi',
  )
  const [consented, setConsented] = useState(
    () => localStorage.getItem(CONSENT_KEY) === 'yes',
  )
  const [screen, setScreen] = useState('home')

  const [sessionId, setSessionId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [issuedDocuments, setIssuedDocuments] = useState([])
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState(null)

  const [form, setForm] = useState(null)
  const [answers, setAnswers] = useState({})
  const [editField, setEditField] = useState(null)
  // Non-null when the fill is resuming a short list of outstanding questions
  // rather than walking the whole form; see the confirm-screen effect below.
  const [fillQueue, setFillQueue] = useState(null)

  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => localStorage.setItem(LANG_KEY, lang), [lang])

  // --- DigiLocker return trip ---------------------------------------------
  // The OAuth redirect reloads the page, landing back here with ?dl_session=.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const session = params.get('dl_session')
    const error = params.get('dl_error')
    if (!session && !error) return

    // Strip the query string so a refresh does not replay the login.
    window.history.replaceState({}, '', window.location.pathname)

    if (error) {
      setLoginError(loginProblem(error))
      return
    }

    setSessionId(session)
    ;(async () => {
      try {
        const [profileRes, docsRes] = await Promise.all([
          fetch(`/api/digilocker/profile?session_id=${session}`),
          fetch(`/api/digilocker/issued-documents?session_id=${session}`),
        ])
        if (!profileRes.ok) throw new Error('Session expired')
        setProfile(await profileRes.json())
        if (docsRes.ok) setIssuedDocuments((await docsRes.json()).documents)
      } catch (err) {
        setLoginError(loginProblem(err.message ?? err))
      }
    })()
  }, [])

  async function login() {
    setLoggingIn(true)
    setLoginError(null)
    try {
      const res = await fetch('/api/digilocker/authorize')
      const data = await res.json()
      window.location.href = data.authorize_url
    } catch (err) {
      setLoginError(loginProblem(err.message ?? err))
      setLoggingIn(false)
    }
  }

  /** One-tap clear — wipes the citizen's data from the device and the server. */
  const clearEverything = useCallback(async () => {
    stopSpeaking()
    if (sessionId) {
      try {
        await fetch(`/api/digilocker/logout?session_id=${sessionId}`, {
          method: 'POST',
        })
      } catch {
        // Offline, or the server is down. The browser-side wipe below still
        // happens, which is the part that actually holds the citizen's data.
      }
    }
    localStorage.removeItem(CONSENT_KEY)
    localStorage.removeItem(LANG_KEY)
    setSessionId(null)
    setProfile(null)
    setIssuedDocuments([])
    setForm(null)
    setAnswers({})
    setEditField(null)
    setConsented(false)
    setScreen('home')
    releaseOcr()
  }, [sessionId])

  function agree() {
    localStorage.setItem(CONSENT_KEY, 'yes')
    setConsented(true)
  }

  /** Seed answers from the DigiLocker profile, then show the overview. */
  function pickForm(chosen) {
    const seeded = {}
    for (const field of chosen.fields) {
      if (isPrefilled(field, profile)) seeded[field.id] = profile[field.profileKey]
    }
    setForm(chosen)
    setAnswers(seeded)
    setScreen('overview')
  }

  const answer = useCallback(
    (id, value) => setAnswers((prev) => ({ ...prev, [id]: value })),
    [],
  )

  // A field can stop applying when an earlier answer changes — the citizen goes
  // back to the confirm screen and says they do have a single parent, after
  // already giving their mother's name. Drop the answer the moment its question
  // stops being asked, so it cannot reach the confirm read-back or either PDF.
  useEffect(() => {
    const stale = staleFields(form, answers)
    if (stale.length === 0) return
    setAnswers((prev) => {
      const next = { ...prev }
      for (const field of stale) delete next[field.id]
      return next
    })
  }, [form, answers])

  // Fields the voice flow needs to ask about — DigiLocker-sourced ones are
  // skipped entirely, which is the whole point of logging in, and so are the
  // ones an earlier answer has ruled out. The overview screen counts with the
  // same helper, so the two can no longer disagree about the size of the form.
  const pending = askableFields(form, answers, profile)

  // Editing one answer can *unlock* a question that was never asked: saying on
  // the confirm screen that you are not a single parent after all brings items
  // 14 and 15 back. Those would otherwise reach the PDF blank and unmentioned,
  // because the confirm screen only lists the answers it has. So confirm sends
  // the citizen back into the fill with exactly what is outstanding.
  useEffect(() => {
    if (screen !== 'confirm') return
    const outstanding = pending.filter((f) => answers[f.id] === undefined)
    if (outstanding.length === 0) return
    setFillQueue(outstanding)
    setScreen('fill')
    // `pending` is rebuilt every render, so depending on it would loop.
    // Screen changes are what can leave a question outstanding.
  }, [screen]) // eslint-disable-line react-hooks/exhaustive-deps

  function restart() {
    stopSpeaking()
    setForm(null)
    setAnswers({})
    setEditField(null)
    setFillQueue(null)
    setScreen('home')
  }

  if (!consented) {
    return (
      <Consent lang={lang} onLangChange={setLang} onAgree={agree} />
    )
  }

  return (
    <>
      <Header
        lang={lang}
        onLangChange={setLang}
        onClear={clearEverything}
        showClear={Boolean(profile) || Object.keys(answers).length > 0}
      />

      {offline && (
        <div className="mx-auto mb-3 w-full max-w-xl px-4">
          <div className="rounded-xl border-l-4 border-good-500 bg-good-50 px-4 py-2 text-base font-semibold text-good-600">
            ✓ {t('offlineReady', lang)}
          </div>
        </div>
      )}

      {loginError && (
        <div className="mx-auto mb-3 w-full max-w-xl px-4">
          <div className="rounded-xl border-l-4 border-bad-500 bg-bad-50 px-4 py-3 text-base font-semibold text-bad-600">
            {t(loginError, lang)}
            <Button
              variant="secondary"
              className="mt-2"
              disabled={offline}
              onClick={() => {
                setLoginError(null)
                login()
              }}
            >
              {t('tryAgain', lang)}
            </Button>
          </div>
        </div>
      )}

      {screen === 'home' && (
        <Home
          lang={lang}
          profile={profile}
          loggingIn={loggingIn}
          offline={offline}
          onLogin={login}
          onScan={() => setScreen('scan')}
          onPickForm={pickForm}
        />
      )}

      {screen === 'scan' && (
        <Scan lang={lang} onPickForm={pickForm} onBack={() => setScreen('home')} />
      )}

      {screen === 'overview' && form && (
        <FormOverview
          lang={lang}
          form={form}
          answers={answers}
          profile={profile}
          onStart={() => setScreen('fill')}
          onBack={restart}
        />
      )}

      {screen === 'fill' && form && (
        <GuidedFill
          // Remounting resets the internal question index cleanly, which each
          // of these three modes needs — a different list is being walked.
          key={
            editField
              ? `edit-${editField.id}`
              : fillQueue
                ? `resume-${fillQueue.map((f) => f.id).join('-')}`
                : 'fill'
          }
          lang={lang}
          fields={editField ? [editField] : (fillQueue ?? pending)}
          answers={answers}
          onAnswer={answer}
          onDone={() => {
            setEditField(null)
            setFillQueue(null)
            setScreen('confirm')
          }}
          onBack={() => {
            if (editField) {
              setEditField(null)
              setScreen('confirm')
            } else if (fillQueue) {
              // Not back to confirm: confirm would bounce straight here again
              // and Back would look broken. The overview is the way out.
              setFillQueue(null)
              setScreen('overview')
            } else setScreen('overview')
          }}
        />
      )}

      {screen === 'confirm' && form && (
        <Confirm
          lang={lang}
          form={form}
          answers={answers}
          profile={profile}
          onEditField={(field) => {
            setEditField(field)
            setScreen('fill')
          }}
          onConfirm={() => setScreen('checklist')}
          onBack={() => setScreen('fill')}
        />
      )}

      {screen === 'checklist' && form && (
        <Checklist
          lang={lang}
          form={form}
          issuedDocuments={issuedDocuments}
          onContinue={() => setScreen('done')}
          onBack={() => setScreen('confirm')}
        />
      )}

      {screen === 'done' && form && (
        <Done
          lang={lang}
          form={form}
          answers={answers}
          profile={profile}
          onFillAnother={restart}
          onStartOver={restart}
        />
      )}
    </>
  )
}
