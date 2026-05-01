/**
 * POPIA compliance surface tests.
 * Covers: legal pages render, AgreementGate blocks without checkbox,
 * Settings privacy tab export/delete flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

vi.mock('@/api/storage', () => ({
  deleteAllUserData: vi.fn().mockResolvedValue(undefined),
  getUserSchedulerParams: vi.fn().mockReturnValue(null),
  listCardStates: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: vi.fn().mockResolvedValue(null), updateMe: vi.fn().mockResolvedValue({}) },
    entities: {},
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { LegalPage }       from '@/pages/legal/LegalPage'
import { AgreementGate }   from '@/components/AgreementGate'
import { SettingsView }    from '@/views/SettingsView'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SETTINGS = {
  newCardCap: 15, reviewCap: 100, catchupDays: 7, leechThreshold: 5,
  retentionTarget: 0.90, sleepBedtime: null, sleepWindowMinutes: 90,
  sleepBannerEnabled: false, matureModeEnabled: true, matureCardThreshold: 30,
  fatigueAlertsEnabled: true, attentionDeclarationEnabled: true, sleepPrefersReviews: true,
}

beforeEach(() => vi.clearAllMocks())

// ── Legal page tests ──────────────────────────────────────────────────────────

describe('LegalPage — legal pages render', () => {
  it('renders Privacy Policy content', () => {
    render(<LegalPage type="privacy" />)
    expect(screen.getAllByText(/Privacy Policy/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/POPIA/i).length).toBeGreaterThan(0)
  })

  it('renders Terms of Use content', () => {
    render(<LegalPage type="terms" />)
    expect(screen.getAllByText(/Terms of Use/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/educational/i).length).toBeGreaterThan(0)
  })

  it('renders Data Processing content', () => {
    render(<LegalPage type="data-processing" />)
    expect(screen.getByText('Data Processing')).toBeInTheDocument()
  })

  it('renders "Back to app" link on all pages', () => {
    render(<LegalPage type="privacy" />)
    expect(screen.getByText(/back to app/i)).toBeInTheDocument()
  })
})

// ── AgreementGate tests ───────────────────────────────────────────────────────

describe('AgreementGate — sign-up consent gate', () => {
  it('shows the "Continue" button as disabled when checkbox is unchecked', () => {
    render(<AgreementGate onAccept={vi.fn()} />)
    const btn = screen.getByTestId('agreement-continue-btn')
    expect(btn).toBeDisabled()
  })

  it('enables "Continue" button when checkbox is checked', () => {
    render(<AgreementGate onAccept={vi.fn()} />)
    const checkbox = screen.getByTestId('agreement-checkbox')
    fireEvent.click(checkbox)
    const btn = screen.getByTestId('agreement-continue-btn')
    expect(btn).not.toBeDisabled()
  })

  it('calls onAccept with the agreement version when continue is clicked', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined)
    render(<AgreementGate onAccept={onAccept} />)
    fireEvent.click(screen.getByTestId('agreement-checkbox'))
    fireEvent.click(screen.getByTestId('agreement-continue-btn'))
    expect(onAccept).toHaveBeenCalledWith('v1.0')
  })

  it('links to Privacy Policy and Terms of Use', () => {
    render(<AgreementGate onAccept={vi.fn()} />)
    expect(screen.getAllByText(/Privacy Policy/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Terms of Use/i).length).toBeGreaterThan(0)
  })
})

// ── SettingsView Privacy tab tests ────────────────────────────────────────────

describe('SettingsView — Privacy tab', () => {
  const baseProps = {
    settings: SETTINGS, onUpdateSettings: vi.fn(),
    cards: [], decks: [], onExport: vi.fn(), onImport: vi.fn(),
    onImportCards: vi.fn(), onImportAnki: vi.fn(),
    onRefitParams: vi.fn(), schedulerParams: null,
    onDeleteAccount: vi.fn().mockResolvedValue(undefined),
  }

  function renderPrivacyTab(props = {}) {
    const r = render(<SettingsView {...baseProps} {...props} />)
    // Navigate to Privacy tab
    fireEvent.click(screen.getByRole('button', { name: /Privacy/i }))
    return r
  }

  it('shows Privacy tab button', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByRole('button', { name: /Privacy/i })).toBeInTheDocument()
  })

  it('Privacy tab shows links to legal pages', () => {
    renderPrivacyTab()
    expect(screen.getAllByText(/Privacy Policy/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Terms of Use/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/How we process/i)).toBeInTheDocument()
  })

  it('Privacy tab shows Export my data button', () => {
    renderPrivacyTab()
    expect(screen.getByTestId('export-data-btn')).toBeInTheDocument()
  })

  it('Export button calls onExport', () => {
    const onExport = vi.fn()
    renderPrivacyTab({ onExport })
    fireEvent.click(screen.getByTestId('export-data-btn'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('Delete account requires two-step confirmation', () => {
    const onDeleteAccount = vi.fn()
    renderPrivacyTab({ onDeleteAccount })
    // Step 0: initial button
    const btn = screen.getByTestId('delete-account-btn')
    expect(btn).toBeInTheDocument()
    // Step 1: first click shows confirmation panel
    fireEvent.click(btn)
    expect(screen.getByTestId('delete-confirm-panel')).toBeInTheDocument()
    // onDeleteAccount not called yet
    expect(onDeleteAccount).not.toHaveBeenCalled()
  })

  it('Cancel in confirmation panel returns to initial state', () => {
    renderPrivacyTab()
    fireEvent.click(screen.getByTestId('delete-account-btn'))
    fireEvent.click(screen.getByTestId('delete-cancel-btn'))
    // Should be back to initial
    expect(screen.getByTestId('delete-account-btn')).toBeInTheDocument()
  })

  it('Confirming deletion calls onDeleteAccount', async () => {
    const onDeleteAccount = vi.fn().mockResolvedValue(undefined)
    renderPrivacyTab({ onDeleteAccount })
    fireEvent.click(screen.getByTestId('delete-account-btn'))
    fireEvent.click(screen.getByTestId('delete-confirm-yes-btn'))
    expect(onDeleteAccount).toHaveBeenCalledTimes(1)
  })
})
