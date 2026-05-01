import { useState } from 'react'
import { C } from '@/lib/theme'
import NidusLogo from '@/components/NidusLogo'

const AGREEMENT_VERSION = 'v1.0'

/**
 * Shown once per account when agreement_accepted_at is null.
 * Blocks app access until the user accepts the Privacy Policy and Terms of Use.
 * On acceptance, calls onAccept() which persists agreement_accepted_at to the User record.
 */
export function AgreementGate({ onAccept }) {
  const [checked, setChecked] = useState(false)
  const [saving,  setSaving]  = useState(false)

  const handleAccept = async () => {
    if (!checked || saving) return
    setSaving(true)
    try {
      await onAccept(AGREEMENT_VERSION)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(245,240,235,0.97)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: C.surface, borderRadius: 22, maxWidth: 440, width: '100%',
        padding: '36px 28px 32px', boxShadow: '0 8px 48px rgba(28,40,32,0.13)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <NidusLogo size={36} withWordmark />
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10, letterSpacing: '-0.3px' }}>
          Before you continue
        </h2>
        <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7, marginBottom: 20 }}>
          Nidus Recall stores your flashcards and study data. We are committed to protecting
          your privacy under the{' '}
          <strong style={{ color: C.text }}>Protection of Personal Information Act (POPIA)</strong>.
        </p>
        <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7, marginBottom: 24 }}>
          Please read our documents before continuing:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {[
            { href: '/privacy',          label: 'Privacy Policy' },
            { href: '/terms',            label: 'Terms of Use' },
            { href: '/data-processing',  label: 'How we process your data' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: C.accent, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 11 }}>↗</span> {label}
            </a>
          ))}
        </div>

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
          marginBottom: 24, padding: '12px 14px', borderRadius: 10,
          background: checked ? `${C.accent}12` : C.elevated,
          border: `1px solid ${checked ? C.accent : C.border}`,
          transition: 'background 0.15s, border-color 0.15s',
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            data-testid="agreement-checkbox"
            style={{ marginTop: 2, accentColor: C.accent, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            I have read and agree to the{' '}
            <strong style={{ color: C.text }}>Privacy Policy</strong> and{' '}
            <strong style={{ color: C.text }}>Terms of Use</strong>.
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || saving}
          data-testid="agreement-continue-btn"
          style={{
            width: '100%', padding: '12px', borderRadius: 12, border: 'none',
            background: checked ? C.accent : C.elevated,
            color: checked ? '#fff' : C.textMut,
            fontSize: 14, fontWeight: 600, cursor: checked ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Continue to Nidus Recall'}
        </button>
      </div>
    </div>
  )
}

export { AGREEMENT_VERSION }
