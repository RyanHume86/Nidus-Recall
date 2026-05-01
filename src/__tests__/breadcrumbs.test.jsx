/**
 * Tests for Prompt 3.2: Breadcrumbs component.
 * Verifies the correct trail is rendered at five distinct routes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'

const nav = vi.fn()

describe('Breadcrumbs', () => {
  it('renders nothing for the Library root (single crumb)', () => {
    const { container } = render(<Breadcrumbs view="library" selectedDeck={null} onNavigate={nav} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows Library › [deck] on deck view', () => {
    render(<Breadcrumbs view="deck" selectedDeck="Cardiology" onNavigate={nav} />)
    const bc = screen.getByTestId('breadcrumbs')
    expect(bc.textContent).toContain('Library')
    expect(bc.textContent).toContain('Cardiology')
  })

  it('Library link in deck view navigates back to library', () => {
    render(<Breadcrumbs view="deck" selectedDeck="Cardiology" onNavigate={nav} />)
    fireEvent.click(screen.getByText('Library'))
    expect(nav).toHaveBeenCalledWith('library')
  })

  it('deck name is the active (non-link) crumb on deck view', () => {
    render(<Breadcrumbs view="deck" selectedDeck="Neurology" onNavigate={nav} />)
    const active = screen.getByText('Neurology')
    expect(active.getAttribute('aria-current')).toBe('page')
  })

  it('shows Study on study-select view (single active crumb, no nav)', () => {
    render(<Breadcrumbs view="study-select" selectedDeck={null} onNavigate={nav} />)
    expect(screen.queryByTestId('breadcrumbs')).toBeNull()
  })

  it('shows Study › Session in progress on session view', () => {
    render(<Breadcrumbs view="session" selectedDeck={null} onNavigate={nav} />)
    const bc = screen.getByTestId('breadcrumbs')
    expect(bc.textContent).toContain('Study')
    expect(bc.textContent).toContain('Session in progress')
  })

  it('Study link in session view navigates to study-select', () => {
    render(<Breadcrumbs view="session" selectedDeck={null} onNavigate={nav} />)
    fireEvent.click(screen.getByText('Study'))
    expect(nav).toHaveBeenCalledWith('study-select')
  })

  it('shows Study › Free study on free-study view', () => {
    render(<Breadcrumbs view="free-study" selectedDeck={null} onNavigate={nav} />)
    const bc = screen.getByTestId('breadcrumbs')
    expect(bc.textContent).toContain('Free study')
  })

  it('renders nothing for the Progress root', () => {
    const { container } = render(<Breadcrumbs view="stats" selectedDeck={null} onNavigate={nav} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for the Settings root', () => {
    const { container } = render(<Breadcrumbs view="settings" selectedDeck={null} onNavigate={nav} />)
    expect(container.firstChild).toBeNull()
  })

  it('breadcrumbs nav has correct aria-label', () => {
    render(<Breadcrumbs view="deck" selectedDeck="Surgery" onNavigate={nav} />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
  })
})
