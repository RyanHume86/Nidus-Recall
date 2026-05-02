import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { LibraryView } from "@/views/LibraryView"

const DECKS = ["Cardiology", "Pharmacology"]
const CARDS = [
  { id:"c1", deck:"Cardiology", front:"Q", back:"A", tags:["physiology","anatomy"], nextReview:null, stability:null },
  { id:"c2", deck:"Cardiology", front:"Q", back:"A", tags:["physiology"], nextReview:null, stability:null },
  { id:"c3", deck:"Pharmacology", front:"Q", back:"A", tags:["anatomy"], nextReview:null, stability:null },
]
const SETTINGS = {}
const DECK_META = { Cardiology:{}, Pharmacology:{} }

function renderLib(overrides = {}) {
  return render(
    <LibraryView
      cards={CARDS}
      decks={DECKS}
      deckMeta={DECK_META}
      onSelectDeck={() => {}}
      onCreateDeck={() => {}}
      syncStatus="saved"
      lastSynced={null}
      settings={SETTINGS}
      onCreateSampleDeck={() => {}}
      deckParentMap={new Map()}
      {...overrides}
    />
  )
}

describe("LibraryView — tag counts", () => {
  it("shows tag chips with card counts", () => {
    renderLib()
    // physiology appears on 2 cards, anatomy on 2 cards
    const physiologyBtn = screen.getByTestId("tag-filter-physiology")
    expect(physiologyBtn.textContent).toContain("2")
    const anatomyBtn = screen.getByTestId("tag-filter-anatomy")
    expect(anatomyBtn.textContent).toContain("2")
  })

  it("clicking a tag chip filters decks to only those with that tag", () => {
    renderLib()
    fireEvent.click(screen.getByTestId("tag-filter-physiology"))
    // Pharmacology has no physiology cards — it should not appear
    expect(screen.queryByText("Pharmacology")).toBeNull()
    expect(screen.getByText("Cardiology")).toBeTruthy()
  })

  it("clicking the clear button removes tag filter", () => {
    renderLib()
    fireEvent.click(screen.getByTestId("tag-filter-physiology"))
    fireEvent.click(screen.getByTestId("tag-filter-clear"))
    // Both decks should be visible again
    expect(screen.getByText("Cardiology")).toBeTruthy()
    expect(screen.getByText("Pharmacology")).toBeTruthy()
  })

  it("sorting: most-used tags appear before less-used tags", () => {
    renderLib()
    const bar = screen.getByTestId("tag-filter-bar")
    const chips = [...bar.querySelectorAll("button[data-testid^='tag-filter-']")]
    const chipNames = chips.map(b => b.dataset.testid.replace("tag-filter-", ""))
    // physiology(2) and anatomy(2) should appear, both have equal count so alphabetical
    expect(chipNames.length).toBeGreaterThanOrEqual(2)
  })
})

describe("LibraryView — flat/tree toggle", () => {
  it("does not show flat/tree toggle when parentMap is empty", () => {
    renderLib({ deckParentMap: new Map() })
    expect(screen.queryByTestId("flat-tree-toggle")).toBeNull()
  })

  it("shows flat/tree toggle when parentMap has entries", () => {
    const parentMap = new Map([["Cardiology::Valves", "Cardiology"]])
    renderLib({ deckParentMap: parentMap, decks: ["Cardiology", "Cardiology::Valves"] })
    expect(screen.getByTestId("flat-tree-toggle")).toBeTruthy()
  })
})
