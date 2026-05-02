import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { DeckView } from "@/views/DeckView"
import { LibraryView } from "@/views/LibraryView"

const BASE_CARDS = []
const BASE_SETTINGS = {}

function renderDeckView(overrides = {}) {
  return render(
    <DeckView
      deckName="Cardiology"
      cards={BASE_CARDS}
      onUpdateCards={vi.fn()}
      onBack={vi.fn()}
      decks={["Cardiology"]}
      settings={BASE_SETTINGS}
      onArchiveDeck={vi.fn()}
      cardsLoading={false}
      deckMeta={{}}
      {...overrides}
    />
  )
}

describe("DeckView — archive menu", () => {
  it("shows 'Archive deck' when deck is not archived", () => {
    renderDeckView({ deckMeta: { Cardiology: { archived: false } } })
    fireEvent.click(screen.getByLabelText("Deck actions"))
    expect(screen.getByTestId("deck-menu-archive")).toBeTruthy()
    expect(screen.queryByTestId("deck-menu-unarchive")).toBeNull()
  })

  it("shows 'Unarchive deck' when deck is already archived", () => {
    renderDeckView({ deckMeta: { Cardiology: { archived: true } } })
    fireEvent.click(screen.getByLabelText("Deck actions"))
    expect(screen.getByTestId("deck-menu-unarchive")).toBeTruthy()
    expect(screen.queryByTestId("deck-menu-archive")).toBeNull()
  })

  it("clicking Archive shows confirmation dialog (not immediate action)", () => {
    const onArchiveDeck = vi.fn()
    renderDeckView({ deckMeta: {}, onArchiveDeck })
    fireEvent.click(screen.getByLabelText("Deck actions"))
    fireEvent.click(screen.getByTestId("deck-menu-archive"))
    expect(screen.getByTestId("archive-confirm")).toBeTruthy()
    expect(onArchiveDeck).not.toHaveBeenCalled()
  })

  it("confirmation Cancel dismisses dialog without archiving", () => {
    const onArchiveDeck = vi.fn()
    renderDeckView({ deckMeta: {}, onArchiveDeck })
    fireEvent.click(screen.getByLabelText("Deck actions"))
    fireEvent.click(screen.getByTestId("deck-menu-archive"))
    fireEvent.click(screen.getByText("Cancel"))
    expect(screen.queryByTestId("archive-confirm")).toBeNull()
    expect(onArchiveDeck).not.toHaveBeenCalled()
  })

  it("confirmation Archive button calls onArchiveDeck", () => {
    const onArchiveDeck = vi.fn()
    renderDeckView({ deckMeta: {}, onArchiveDeck })
    fireEvent.click(screen.getByLabelText("Deck actions"))
    fireEvent.click(screen.getByTestId("deck-menu-archive"))
    fireEvent.click(screen.getByTestId("archive-confirm-ok"))
    expect(onArchiveDeck).toHaveBeenCalledWith("Cardiology")
  })

  it("clicking Unarchive calls onArchiveDeck immediately (no confirmation)", () => {
    const onArchiveDeck = vi.fn()
    renderDeckView({ deckMeta: { Cardiology: { archived: true } }, onArchiveDeck })
    fireEvent.click(screen.getByLabelText("Deck actions"))
    fireEvent.click(screen.getByTestId("deck-menu-unarchive"))
    expect(onArchiveDeck).toHaveBeenCalledWith("Cardiology")
    expect(screen.queryByTestId("archive-confirm")).toBeNull()
  })

  it("shows archived badge in header when deck is archived", () => {
    renderDeckView({ deckMeta: { Cardiology: { archived: true } } })
    expect(screen.getByTestId("archived-badge")).toBeTruthy()
  })

  it("does not show archived badge when deck is not archived", () => {
    renderDeckView({ deckMeta: { Cardiology: { archived: false } } })
    expect(screen.queryByTestId("archived-badge")).toBeNull()
  })
})

const DECKS = ["Cardiology", "Pharmacology"]
const CARDS = []
const DECK_META = { Cardiology: { archived: true }, Pharmacology: { archived: false } }

function renderLib(overrides = {}) {
  return render(
    <LibraryView
      cards={CARDS}
      decks={DECKS}
      deckMeta={DECK_META}
      onSelectDeck={vi.fn()}
      onCreateDeck={vi.fn()}
      syncStatus="saved"
      lastSynced={null}
      settings={{}}
      onCreateSampleDeck={vi.fn()}
      deckParentMap={new Map()}
      onArchiveDeck={vi.fn()}
      {...overrides}
    />
  )
}

describe("LibraryView — unarchive button on archived deck cards", () => {
  it("shows Unarchive button on archived deck cards when showArchived is toggled", () => {
    renderLib()
    // Toggle to show archived decks
    fireEvent.click(screen.getByText(/Show.*archived/i))
    expect(screen.getByTestId("unarchive-btn-Cardiology")).toBeTruthy()
  })

  it("Unarchive button calls onArchiveDeck with deck name", () => {
    const onArchiveDeck = vi.fn()
    renderLib({ onArchiveDeck })
    fireEvent.click(screen.getByText(/Show.*archived/i))
    fireEvent.click(screen.getByTestId("unarchive-btn-Cardiology"))
    expect(onArchiveDeck).toHaveBeenCalledWith("Cardiology")
  })

  it("does not show Unarchive button on non-archived deck cards", () => {
    renderLib()
    expect(screen.queryByTestId("unarchive-btn-Pharmacology")).toBeNull()
  })
})
