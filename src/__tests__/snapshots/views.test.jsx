/**
 * Snapshot regression suite for Home.jsx views and modals (baseline 2026-04-27).
 *
 * Purpose: any decomposition change that alters the rendered DOM will produce
 * a snapshot diff. Investigate before accepting: confirm via manual smoke test
 * that the visual output is identical, then update with `vitest run --update`.
 *
 * All external I/O is mocked. Views receive representative prop payloads only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

// ── Mocks (must appear before any import that transitively loads these modules) ─

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: vi.fn().mockResolvedValue(null), logout: vi.fn() },
    entities: {
      Flashcard:  { filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      Deck:       { filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      SessionLog: { filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
      CardHistory:{ filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
      CardState:  { filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      UserSchedulerParams: { filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    },
    functions: { callFunction: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('@/api/storage', () => ({
  loadAll: vi.fn().mockResolvedValue({ cards: [], deckNames: [], log: [], deckParentMap: new Map() }),
  syncCards: vi.fn().mockResolvedValue(undefined),
  syncCardStates: vi.fn().mockResolvedValue(undefined),
  appendLog: vi.fn().mockResolvedValue({}),
  updateLog: vi.fn().mockResolvedValue({}),
  ensureDeck: vi.fn().mockResolvedValue({}),
  adjustDeckCount: vi.fn().mockResolvedValue(undefined),
  recalculateDeckCount: vi.fn().mockResolvedValue(undefined),
  saveCardHistory: vi.fn().mockResolvedValue({}),
  listCardHistory: vi.fn().mockResolvedValue([]),
  getUserSchedulerParams: vi.fn().mockReturnValue(null),
  saveUserSchedulerParams: vi.fn().mockResolvedValue({}),
  listCardStates: vi.fn().mockResolvedValue([]),
  runMigration: vi.fn().mockResolvedValue({ migrated: 0 }),
  getDeckParentMap: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@/api/excel', () => ({
  exportToExcel: vi.fn().mockResolvedValue(undefined),
  importFromExcel: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/notion', () => ({
  testConnection: vi.fn().mockResolvedValue(false),
  exportToNotion: vi.fn().mockResolvedValue(undefined),
  importFromNotion: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/offline-store', () => ({
  seedFromNetwork: vi.fn().mockResolvedValue(undefined),
  queueRating: vi.fn().mockResolvedValue(undefined),
  onReconnect: vi.fn().mockReturnValue(() => {}),
  getQueue: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/pwa', () => ({
  isInstallable: vi.fn().mockReturnValue(false),
  triggerInstallPrompt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SETTINGS = {
  newCardCap: 15, reviewCap: 100, leechThreshold: 5, retentionTarget: 0.90,
  catchupDays: 7, sleepBedtime: null, sleepWindowMinutes: 90,
  sleepBannerEnabled: true, matureModeEnabled: true, matureCardThreshold: 30,
  fatigueAlertsEnabled: true, attentionDeclarationEnabled: true,
  sleepPrefersReviews: true,
}

const DECK_A = 'Common Pharmacology: Essentials'
const DECK_B = 'Clinical Anatomy'

const mkCard = (overrides = {}) => ({
  id: 'card-1', front: 'What is the mechanism of metformin?',
  back: 'Activates AMPK, inhibits hepatic gluconeogenesis.',
  deck: DECK_A, contentType: 'Mechanism', cardType: 'basic',
  status: 'Active', interval: 5, reviewCount: 3, lapses: 0,
  stability: 4.5, difficulty: 5.5, nextReview: '2026-01-15',
  lastReview: '2026-01-10', elaboration: 'Key mechanism for T2DM.',
  anchor: null, source: 'BNF', stakes_flag: false,
  prerequisite_card_id: null, tags: ['pharm', 'diabetes'],
  connects_to: [], ratingHistory: [], ai_edited: false,
  imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
  ...overrides,
})

const CARD_1 = mkCard()
const CARD_2 = mkCard({ id: 'card-2', front: 'Sulphonylureas MoA?', back: 'Close K-ATP channel.', deck: DECK_B, nextReview: '2026-01-14' })
const CARDS = [CARD_1, CARD_2]
const DECKS = [DECK_A, DECK_B]
const LOG = [
  { date: '2026-01-14', reviewed: 10, failed: 1, newAdded: 3, frictionNote: '', intensity_score: null, status: 'complete' },
  { date: '2026-01-13', reviewed: 15, failed: 2, newAdded: 0, frictionNote: '', intensity_score: null, status: 'complete' },
]

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { OnboardingView } from '@/views/OnboardingView'
import { LibraryView } from '@/views/LibraryView'
import { DeckView } from '@/views/DeckView'
import { StudySelectView } from '@/views/StudySelectView'
import { SessionView } from '@/views/SessionView'
import { FreeStudyView } from '@/views/FreeStudyView'
import { StatsView } from '@/views/StatsView'
import { SettingsView } from '@/views/SettingsView'
import { EditCardModal } from '@/modals/EditCardModal'
import { AIDiffModal } from '@/modals/AIDiffModal'
import { CardHistoryModal } from '@/modals/CardHistoryModal'
import { OcclusionCardRenderer } from '@/components/OcclusionCardRenderer'
import { ImageOcclusionEditor } from '@/components/ImageOcclusionEditor'
import { ReviewHeatmap } from '@/components/ReviewHeatmap'

// ── Snapshot tests ────────────────────────────────────────────────────────────

describe('view snapshots', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('LibraryView: empty state', () => {
    const { container } = render(
      <LibraryView
        cards={[]} decks={[]} deckMeta={{}} settings={SETTINGS}
        onSelectDeck={vi.fn()} onCreateDeck={vi.fn()} onCreateSampleDeck={vi.fn()}
        syncStatus="idle" lastSynced={null} deckParentMap={new Map()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('LibraryView: with decks and cards', () => {
    const { container } = render(
      <LibraryView
        cards={CARDS} decks={DECKS} deckMeta={{}} settings={SETTINGS}
        onSelectDeck={vi.fn()} onCreateDeck={vi.fn()} onCreateSampleDeck={vi.fn()}
        syncStatus="saved" lastSynced="2026-01-15T09:00:00.000Z"
        deckParentMap={new Map()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('OnboardingView', () => {
    const { container } = render(
      <OnboardingView onCreateDeck={vi.fn()} onCreateSampleDeck={vi.fn()} />
    )
    expect(container).toMatchSnapshot()
  })

  it('DeckView: with cards', () => {
    const { container } = render(
      <DeckView
        deckName={DECK_A} cards={CARDS} decks={DECKS} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={vi.fn()} onArchiveDeck={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('StudySelectView: with due cards', () => {
    const { container } = render(
      <StudySelectView
        cards={CARDS} decks={DECKS} settings={SETTINGS}
        onStartSRS={vi.fn()} onStartFree={vi.fn()} onStartInterleaved={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('SessionView: no due cards (empty queue)', () => {
    const { container } = render(
      <SessionView
        cards={[]} settings={SETTINGS} studyDeckName={DECK_A} log={[]}
        onUpdateCards={vi.fn()} onSaveLog={vi.fn()} onDone={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('SessionView: with due cards', () => {
    const dueCard = mkCard({ nextReview: '2026-01-01' })
    const { container } = render(
      <SessionView
        cards={[dueCard]} settings={SETTINGS} studyDeckName={DECK_A} log={[]}
        onUpdateCards={vi.fn()} onSaveLog={vi.fn()} onDone={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('FreeStudyView: with cards', () => {
    const { container } = render(
      <FreeStudyView cards={CARDS} studyDeckName={DECK_A} settings={SETTINGS} onDone={vi.fn()} />
    )
    expect(container).toMatchSnapshot()
  })

  it('StatsView: empty log', () => {
    const { container } = render(
      <StatsView log={[]} cards={[]} decks={[]} settings={SETTINGS} />
    )
    expect(container).toMatchSnapshot()
  })

  it('StatsView: with log and cards', () => {
    const { container } = render(
      <StatsView log={LOG} cards={CARDS} decks={DECKS} settings={SETTINGS} />
    )
    expect(container).toMatchSnapshot()
  })

  it('SettingsView', () => {
    const { container } = render(
      <SettingsView
        settings={SETTINGS} onUpdateSettings={vi.fn()} cards={CARDS} decks={DECKS}
        onExport={vi.fn()} onImport={vi.fn()} onImportCards={vi.fn()}
        onImportAnki={vi.fn()} onRefitParams={vi.fn()} schedulerParams={null}
      />
    )
    expect(container).toMatchSnapshot()
  })
})

describe('modal snapshots', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('EditCardModal: existing card', () => {
    const { container } = render(
      <EditCardModal
        card={CARD_1} cards={CARDS} decks={DECKS}
        onUpdateCards={vi.fn()} onClose={vi.fn()} onSaveHistory={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('AIDiffModal: without clinical warning', () => {
    const { container } = render(
      <AIDiffModal
        original={{ front: 'Original front', back: 'Original back' }}
        proposed={{ front: 'Improved front', back: 'Improved back with detail' }}
        isClinical={false}
        onApprove={vi.fn()} onEdit={vi.fn()} onReject={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('AIDiffModal: with clinical warning', () => {
    const { container } = render(
      <AIDiffModal
        original={{ front: 'Drug dose', back: 'Metformin 500mg BD' }}
        proposed={{ front: 'Drug dose (updated)', back: 'Metformin 500mg BD with meals' }}
        isClinical={true}
        onApprove={vi.fn()} onEdit={vi.fn()} onReject={vi.fn()}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('CardHistoryModal: empty history', () => {
    const { container } = render(
      <CardHistoryModal cardId="card-1" onClose={vi.fn()} />
    )
    expect(container).toMatchSnapshot()
  })
})

describe('feature component snapshots', () => {
  it('OcclusionCardRenderer: front side (masked)', () => {
    const card = {
      imageUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      occlusionRegions: [
        { id: 'r1', label: 'Frontal lobe', type: 'rect', x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
        { id: 'r2', label: 'Temporal lobe', type: 'rect', x: 0.5, y: 0.3, width: 0.25, height: 0.15 },
      ],
      occlusionRegionId: 'r1',
    }
    const { container } = render(<OcclusionCardRenderer card={card} revealed={false} />)
    expect(container).toMatchSnapshot()
  })

  it('OcclusionCardRenderer: back side (revealed)', () => {
    const card = {
      imageUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      occlusionRegions: [
        { id: 'r1', label: 'Frontal lobe', type: 'rect', x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
      ],
      occlusionRegionId: 'r1',
    }
    const { container } = render(<OcclusionCardRenderer card={card} revealed={true} />)
    expect(container).toMatchSnapshot()
  })

  it('ImageOcclusionEditor: initial state (no image)', () => {
    const { container } = render(<ImageOcclusionEditor onSave={vi.fn()} />)
    expect(container).toMatchSnapshot()
  })

  it('ReviewHeatmap: empty log', () => {
    const { container } = render(<ReviewHeatmap log={[]} today="2026-01-15" />)
    expect(container).toMatchSnapshot()
  })

  it('ReviewHeatmap: with activity', () => {
    const { container } = render(<ReviewHeatmap log={LOG} today="2026-01-15" />)
    expect(container).toMatchSnapshot()
  })
})
