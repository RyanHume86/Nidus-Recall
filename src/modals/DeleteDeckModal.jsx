import { useState } from 'react'
import { C } from '@/lib/theme'

/**
 * Confirmation modal for deck deletion.
 * Requires an explicit checkbox before the Delete button is enabled.
 * Calls onConfirm() when the user confirms; calls onClose() to cancel.
 */
export function DeleteDeckModal({ deckName, cardCount, activeReviewCount, onConfirm, onClose }) {
  const [agreed, setAgreed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleConfirm = async () => {
    if (!agreed || deleting) return
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  return (
    <div
      data-testid="delete-deck-modal"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: C.elevated, borderRadius: 16, padding: 28,
        maxWidth: 440, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: C.text }}>
          Delete deck
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
          You are about to delete <strong style={{ color: C.text }}>{deckName}</strong>.
        </p>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 0',
          fontSize: 13, color: C.textSec,
        }}>
          <span>Total cards</span>
          <span style={{ fontWeight: 600, color: C.text, textAlign: 'right' }}
            data-testid="delete-deck-card-count">{cardCount}</span>
          <span>In active review</span>
          <span style={{ fontWeight: 600, color: activeReviewCount > 0 ? C.again : C.text, textAlign: 'right' }}
            data-testid="delete-deck-active-count">{activeReviewCount}</span>
        </div>

        {activeReviewCount > 0 && (
          <div style={{
            background: C.againBg, border: `1px solid ${C.again}40`,
            borderRadius: 8, padding: '9px 12px', marginBottom: 16,
            fontSize: 12, color: C.again, lineHeight: 1.5,
          }}>
            {activeReviewCount} card{activeReviewCount !== 1 ? 's' : ''} in this deck {activeReviewCount !== 1 ? 'have' : 'has'} active scheduling state.
            All scheduling history will be lost.
          </div>
        )}

        <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textMut, lineHeight: 1.5 }}>
          Cards are soft-deleted and can be recovered via the backend for up to 30 days.
          After that they are permanently removed.
        </p>

        <label
          data-testid="delete-deck-agree-label"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 20 }}
        >
          <input
            data-testid="delete-deck-checkbox"
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, accentColor: C.again }}
          />
          <span style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
            I understand this action is permanent. The deck and all its cards will be deleted.
          </span>
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            data-testid="delete-deck-cancel"
            className="rapp-btn rapp-btn-ghost"
            style={{ flex: 1, fontSize: 13 }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            data-testid="delete-deck-confirm"
            className="rapp-btn"
            disabled={!agreed || deleting}
            onClick={handleConfirm}
            style={{
              flex: 1, fontSize: 13, fontWeight: 600,
              background: agreed ? C.again : C.border,
              color: agreed ? '#fff' : C.textMut,
              border: 'none', opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Deleting...' : 'Delete deck'}
          </button>
        </div>
      </div>
    </div>
  )
}
