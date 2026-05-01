/**
 * Unit tests for SleepScheduleModal and sleepOnboardComplete.
 *
 * Covers:
 *   - Modal renders key UI elements
 *   - "Skip for now" closes without saving settings
 *   - "Save sleep schedule" calls onUpdateSettings + marks done
 *   - sleepOnboardComplete helper: authenticated path
 *   - sleepOnboardComplete helper: localStorage fallback (anonymous)
 *   - sleepOnboardComplete helper: returns false for a new user
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: {
      me:       vi.fn().mockResolvedValue(null),
      updateMe: vi.fn().mockResolvedValue({}),
      logout:   vi.fn(),
    },
    entities: {},
  },
}))

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

// AuthContext: default to authenticated with no onboarding flag
const mockUseAuth = vi.fn()
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => children,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { base44 } from '@/api/base44Client'
import { SleepScheduleModal, sleepOnboardComplete } from '../SleepScheduleModal'

const DEFAULT_SETTINGS = {
  sleepBedtime:       null,
  sleepWindowMinutes: 90,
  sleepBannerEnabled: true,
}

function renderModal({ settings = DEFAULT_SETTINGS, isAuth = true } = {}) {
  mockUseAuth.mockReturnValue({ isAuthenticated: isAuth })
  const onUpdateSettings = vi.fn()
  const onDone           = vi.fn()
  render(
    <SleepScheduleModal
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      onDone={onDone}
    />
  )
  return { onUpdateSettings, onDone }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SleepScheduleModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders heading, time input, window select, banner toggle, and action buttons', () => {
    renderModal()

    expect(screen.getByText(/set your bedtime/i)).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()            // review window select
    expect(screen.getByRole('switch')).toBeTruthy()              // banner toggle
    expect(screen.getByRole('button', { name: /save sleep schedule/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeTruthy()
  })

  it('skip does NOT call onUpdateSettings and marks done', async () => {
    const { onUpdateSettings, onDone } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onUpdateSettings).not.toHaveBeenCalled()
    expect(base44.auth.updateMe).toHaveBeenCalledWith({ onboarding_sleep_completed: true })
  })

  it('skip writes localStorage fallback for anonymous users', async () => {
    const { onDone } = renderModal({ isAuth: false })

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('nidus.sleepOnboardDone')).toBe('1')
  })

  it('save calls onUpdateSettings with entered values and marks done', async () => {
    const { onUpdateSettings, onDone } = renderModal()

    // Change bedtime to 23:00
    const timeInput = screen.getByDisplayValue('22:00')
    fireEvent.change(timeInput, { target: { value: '23:00' } })

    // Change window to 120 min
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '120' } })

    fireEvent.click(screen.getByRole('button', { name: /save sleep schedule/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))

    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sleepBedtime:       '23:00',
        sleepWindowMinutes: 120,
        sleepBannerEnabled: true,
      })
    )
    expect(base44.auth.updateMe).toHaveBeenCalledWith({ onboarding_sleep_completed: true })
  })

  it('banner toggle changes value passed to onUpdateSettings', async () => {
    const { onUpdateSettings } = renderModal()

    // Toggle off
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /save sleep schedule/i }))

    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ sleepBannerEnabled: false })
      )
    )
  })
})

// ── sleepOnboardComplete helper ───────────────────────────────────────────────

describe('sleepOnboardComplete', () => {
  afterEach(() => localStorage.clear())

  it('returns true for authenticated user with flag set', () => {
    expect(sleepOnboardComplete({ onboarding_sleep_completed: true }, true)).toBe(true)
  })

  it('returns false for authenticated user without flag', () => {
    expect(sleepOnboardComplete({ onboarding_sleep_completed: false }, true)).toBe(false)
  })

  it('returns false for authenticated user with no user object', () => {
    expect(sleepOnboardComplete(null, true)).toBe(false)
  })

  it('returns true when localStorage fallback is set (anonymous)', () => {
    localStorage.setItem('nidus.sleepOnboardDone', '1')
    expect(sleepOnboardComplete(null, false)).toBe(true)
  })

  it('returns false for anonymous user with no localStorage entry', () => {
    expect(sleepOnboardComplete(null, false)).toBe(false)
  })
})
