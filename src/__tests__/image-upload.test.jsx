/**
 * Tests for the ImageUpload component and imageId-based occlusion card creation.
 */

/* global global */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

vi.mock('@/api/storage', () => ({
  saveImage: vi.fn(),
}))

vi.mock('@/lib/dates', () => ({
  genId: () => 'mock-id-' + Math.random().toString(36).slice(2),
}))

// Canvas mock — jsdom has no canvas; stub getContext + toDataURL
HTMLCanvasElement.prototype.getContext = () => ({ drawImage: vi.fn() })
HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,MOCK_COMPRESSED'

// URL.createObjectURL / revokeObjectURL are not in jsdom
global.URL.createObjectURL = vi.fn(() => 'blob:mock-object-url')
global.URL.revokeObjectURL = vi.fn()

// Image mock — simulate 3000×2000 source so compression kicks in
beforeEach(() => {
  global.Image = class {
    naturalWidth = 3000
    naturalHeight = 2000
    onload = null
    set src(_) { setTimeout(() => this.onload?.(), 0) }
  }
})

// ── Imports after mocks ────────────────────────────────────────────────────────

import { ImageUpload } from '@/components/cards/ImageUpload'
import { createOcclusionCards } from '@/lib/occlusion'
import { saveImage } from '@/api/storage'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeImageFile(name = 'test.jpg', type = 'image/jpeg') {
  return new File(['img-bytes'], name, { type })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ImageUpload component', () => {
  const onSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    saveImage.mockResolvedValue({ id: 'img-entity-123' })
  })

  it('renders the drag-and-drop zone initially', () => {
    render(<ImageUpload onSave={onSave} />)
    expect(screen.getByTestId('image-drop-zone')).toBeInTheDocument()
    expect(screen.getByText(/drop an image/i)).toBeInTheDocument()
  })

  it('shows file input hidden by default', () => {
    render(<ImageUpload onSave={onSave} />)
    const input = screen.getByTestId('image-file-input')
    expect(input).toHaveStyle({ display: 'none' })
  })

  it('transitions to drawing UI after valid image file selected', async () => {
    render(<ImageUpload onSave={onSave} />)
    const input = screen.getByTestId('image-file-input')
    fireEvent.change(input, { target: { files: [makeImageFile()] } })
    await waitFor(() => {
      expect(screen.getByAltText('Occlusion source')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('image-drop-zone')).not.toBeInTheDocument()
  })

  it('save button is disabled when no regions drawn', async () => {
    render(<ImageUpload onSave={onSave} />)
    const input = screen.getByTestId('image-file-input')
    fireEvent.change(input, { target: { files: [makeImageFile()] } })
    await waitFor(() => screen.getByTestId('image-upload-save-btn'))
    expect(screen.getByTestId('image-upload-save-btn')).toBeDisabled()
  })

  it('shows "Change image" button to return to drop zone', async () => {
    render(<ImageUpload onSave={onSave} />)
    const input = screen.getByTestId('image-file-input')
    fireEvent.change(input, { target: { files: [makeImageFile()] } })
    await waitFor(() => screen.getByText('Change image'))
    fireEvent.click(screen.getByText('Change image'))
    await waitFor(() => {
      expect(screen.getByTestId('image-drop-zone')).toBeInTheDocument()
    })
  })

  it('rejects non-image files silently (drop zone persists)', async () => {
    render(<ImageUpload onSave={onSave} />)
    const input = screen.getByTestId('image-file-input')
    const pdfFile = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [pdfFile] } })
    // Drop zone should still be visible (no state change for invalid file type)
    expect(screen.getByTestId('image-drop-zone')).toBeInTheDocument()
  })

  it('shows compressed image src from canvas toDataURL', async () => {
    // Image mock: naturalWidth=3000, naturalHeight=2000 → compressed to 1920×1280
    render(<ImageUpload onSave={onSave} />)
    const input = screen.getByTestId('image-file-input')
    fireEvent.change(input, { target: { files: [makeImageFile('large.jpg', 'image/jpeg')] } })
    await waitFor(() => {
      expect(screen.getByAltText('Occlusion source')).toBeInTheDocument()
    })
    const img = screen.getByAltText('Occlusion source')
    expect(img.src).toContain('MOCK_COMPRESSED')
  })
})

describe('createOcclusionCards with imageId', () => {
  const regions = [
    { id: 'r1', label: 'Left ventricle',  type: 'rect', x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
    { id: 'r2', label: 'Right ventricle', type: 'rect', x: 0.5, y: 0.2, width: 0.3, height: 0.2 },
  ]

  it('creates one card per region', () => {
    const cards = createOcclusionCards('data:img', regions, 'Cardiology', null)
    expect(cards).toHaveLength(2)
  })

  it('sets imageId on each card when provided', () => {
    const cards = createOcclusionCards(null, regions, 'Cardiology', 'img-entity-123')
    expect(cards[0].imageId).toBe('img-entity-123')
    expect(cards[1].imageId).toBe('img-entity-123')
  })

  it('nullifies inline imageUrl and occlusionRegions when imageId provided', () => {
    const cards = createOcclusionCards('data:img', regions, 'Cardiology', 'img-entity-123')
    expect(cards[0].imageUrl).toBeNull()
    expect(cards[0].occlusionRegions).toBeNull()
  })

  it('preserves inline imageUrl and occlusionRegions for legacy cards (no imageId)', () => {
    const url = 'data:image/png;base64,ABC'
    const cards = createOcclusionCards(url, regions, 'Cardiology')
    expect(cards[0].imageUrl).toBe(url)
    expect(cards[0].occlusionRegions).toEqual(regions)
  })

  it('each card has the correct occlusionRegionId', () => {
    const cards = createOcclusionCards('data:img', regions, 'Cardiology', 'img-entity-123')
    expect(cards[0].occlusionRegionId).toBe('r1')
    expect(cards[1].occlusionRegionId).toBe('r2')
  })

  it('front and back equal the region label', () => {
    const cards = createOcclusionCards('data:img', regions, 'Cardiology', 'img-entity-123')
    expect(cards[0].front).toBe('Left ventricle')
    expect(cards[0].back).toBe('Left ventricle')
  })

  it('sets cardType to image_occlusion', () => {
    const cards = createOcclusionCards('data:img', regions, 'Cardiology', 'img-entity-123')
    expect(cards.every(c => c.cardType === 'image_occlusion')).toBe(true)
  })

  it('imageId is null on legacy cards when not provided', () => {
    const cards = createOcclusionCards('data:img', regions, 'Cardiology')
    expect(cards[0].imageId).toBeNull()
  })
})