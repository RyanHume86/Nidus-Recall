/**
 * Import guide tests (Item 8).
 * Verifies that the Notion and Excel setup guides toggle correctly.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportExportPanel } from '@/components/ImportExportPanel'

vi.mock('@/api/notionSettings', () => ({
  getNotionCredentials: vi.fn().mockResolvedValue({ token: '', db: '' }),
  setNotionCredentials: vi.fn().mockResolvedValue(undefined),
  clearNotionCredentials: vi.fn().mockResolvedValue(undefined),
}))

const defaultProps = {
  cards: [],
  decks: [],
  onImportFile: vi.fn(),
  onImportCards: vi.fn(),
  onExport: vi.fn(),
  onImportAnki: vi.fn(),
}

describe('Notion import guide', () => {
  it('is hidden by default', () => {
    render(<ImportExportPanel {...defaultProps} />)
    expect(screen.queryByTestId('notion-guide')).toBeNull()
  })

  it('shows when toggle is clicked', () => {
    render(<ImportExportPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('notion-guide-toggle'))
    expect(screen.getByTestId('notion-guide')).toBeTruthy()
  })

  it('hides again when toggle is clicked a second time', () => {
    render(<ImportExportPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('notion-guide-toggle'))
    fireEvent.click(screen.getByTestId('notion-guide-toggle'))
    expect(screen.queryByTestId('notion-guide')).toBeNull()
  })

  it('guide contains step-by-step instructions', () => {
    render(<ImportExportPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('notion-guide-toggle'))
    expect(screen.getByText(/Create an integration/i)).toBeTruthy()
    expect(screen.getByText(/Connect your database/i)).toBeTruthy()
  })
})

describe('Excel import guide', () => {
  beforeEach(() => {
    render(<ImportExportPanel {...defaultProps} />)
    fireEvent.click(screen.getByText('Excel'))
  })

  it('is hidden by default', () => {
    expect(screen.queryByTestId('excel-guide')).toBeNull()
  })

  it('shows when toggle is clicked', () => {
    fireEvent.click(screen.getByTestId('excel-guide-toggle'))
    expect(screen.getByTestId('excel-guide')).toBeTruthy()
  })

  it('guide contains template download link', () => {
    fireEvent.click(screen.getByTestId('excel-guide-toggle'))
    expect(screen.getByTestId('excel-template-download')).toBeTruthy()
  })

  it('guide lists required columns', () => {
    fireEvent.click(screen.getByTestId('excel-guide-toggle'))
    expect(screen.getByText(/required\. The question or prompt/i)).toBeTruthy()
  })
})
