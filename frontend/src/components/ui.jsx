/**
 * Shared UI pieces.
 *
 * Every interactive element here is at least 56px tall. That is not a style
 * choice — our users are elderly, often with reduced fine motor control, using
 * a phone they did not choose. A 40px button is a button they cannot reliably
 * hit.
 */

import { useEffect, useState } from 'react'
import { canSpeak, speak, stopSpeaking } from '../lib/speech'
import { t } from '../lib/i18n'

export function Screen({ children, className = '' }) {
  return (
    <div className={`fm-rise mx-auto w-full max-w-xl px-4 pb-28 ${className}`}>
      {children}
    </div>
  )
}

export function Header({ lang, onLangChange, onClear, showClear }) {
  return (
    <header className="sticky top-0 z-20 mb-5 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
          <span className="text-xl font-bold tracking-tight text-brand-700">
            {t('appName', lang)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {showClear && (
            <button
              onClick={onClear}
              className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-bad-600"
            >
              {t('clearAll', lang)}
            </button>
          )}
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>
      </div>
    </header>
  )
}

export function LangToggle({ lang, onChange }) {
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-line bg-white"
      role="group"
      aria-label="Language"
    >
      {[
        ['hi', 'हिंदी'],
        ['en', 'English'],
      ].map(([code, label]) => (
        <button
          key={code}
          onClick={() => onChange(code)}
          aria-pressed={lang === code}
          className={`min-h-11 px-3 text-base font-semibold transition ${
            lang === code
              ? 'bg-brand-600 text-white'
              : 'text-ink-soft hover:bg-brand-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}) {
  const styles = {
    primary:
      'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700 shadow-sm',
    secondary:
      'bg-white text-ink border-2 border-line hover:border-brand-500 hover:text-brand-700',
    good: 'bg-good-500 text-white hover:bg-good-600 shadow-sm',
    ghost: 'bg-transparent text-brand-600 hover:bg-brand-50',
    danger: 'bg-white text-bad-600 border-2 border-bad-500 hover:bg-bad-50',
  }[variant]

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-xl px-5 text-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = '', onClick, as = 'div' }) {
  const Tag = onClick ? 'button' : as
  return (
    <Tag
      onClick={onClick}
      className={`w-full rounded-2xl border border-line bg-white p-5 text-left ${
        onClick ? 'transition hover:border-brand-500 hover:shadow-md' : ''
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

/** A speaker button that reads a line aloud. Central to the whole product. */
export function SpeakButton({ text, lang, label, className = '' }) {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => () => stopSpeaking(), [])

  if (!canSpeak) return null

  const handle = async () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    await speak(text, lang)
    setSpeaking(false)
  }

  return (
    <button
      onClick={handle}
      aria-label={label ?? t('listen', lang)}
      className={`flex min-h-14 min-w-14 shrink-0 items-center justify-center gap-2 rounded-xl border-2 px-4 text-lg font-bold transition ${
        speaking
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100'
      } ${className}`}
    >
      <SpeakerIcon speaking={speaking} />
      {label && <span>{label}</span>}
    </button>
  )
}

function SpeakerIcon({ speaking }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" stroke="none" />
      {speaking ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      )}
    </svg>
  )
}

export function MicIcon({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4M8 22h8" />
    </svg>
  )
}

export function Progress({ current, total, lang }) {
  const pct = total ? Math.round((current / total) * 100) : 0
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between text-base font-semibold text-ink-soft">
        <span>
          {t('question', lang)} {current} {t('of', lang)} {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Banner({ tone = 'info', children, className = '' }) {
  const styles = {
    info: 'bg-brand-50 border-brand-500 text-brand-700',
    good: 'bg-good-50 border-good-500 text-good-600',
    warn: 'bg-saffron-50 border-saffron-500 text-saffron-600',
    bad: 'bg-bad-50 border-bad-500 text-bad-600',
  }[tone]
  return (
    <div
      className={`rounded-xl border-l-4 px-4 py-3 text-lg font-medium ${styles} ${className}`}
    >
      {children}
    </div>
  )
}

export function BottomBar({ children }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl gap-3 px-4 py-3">{children}</div>
    </div>
  )
}

export function CheckIcon({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 12 6 6L20 6" />
    </svg>
  )
}
