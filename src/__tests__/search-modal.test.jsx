import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react"
import { SearchModal } from "@/modals/SearchModal"

const DECKS = ["Cardiology", "Pharmacology", "Neurology"]
const CARDS = [
  { id: "c1", front: "What is the mechanism of aspirin?", back: "Irreversible COX inhibitor", deck: "Pharmacology" },
  { id: "c2", front: "Name the layers of the heart wall", back: "Epicardium, myocardium, endocardium", deck: "Cardiology" },
  { id: "c3", front: "What is the action potential threshold?", back: "-55 mV", deck: "Neurology" },
]

describe("SearchModal", () => {
  it("renders the modal with input focused placeholder", () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId("search-input")).toBeTruthy()
    expect(screen.getByTestId("search-tab-all")).toBeTruthy()
    expect(screen.getByTestId("search-tab-decks")).toBeTruthy()
    expect(screen.getByTestId("search-tab-cards")).toBeTruthy()
  })

  it("shows 'type to search' hint when query is empty", () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/type to search/i)).toBeTruthy()
  })

  it("shows no-results message for unmatched query", async () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "xyznotfound" } })
    await waitFor(() => expect(screen.getByText(/no results/i)).toBeTruthy(), { timeout: 500 })
  })

  it("shows matching deck in All tab", async () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "Cardio" } })
    await waitFor(() => expect(screen.getByTestId("search-deck-result-Cardiology")).toBeTruthy(), { timeout: 500 })
  })

  it("shows matching card in All tab", async () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "aspirin" } })
    await waitFor(() => expect(screen.getByTestId("search-card-result-c1")).toBeTruthy(), { timeout: 500 })
  })

  it("switching to Decks tab hides cards section", async () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "Cardio" } })
    await waitFor(() => screen.getByTestId("search-decks-section"), { timeout: 500 })
    fireEvent.click(screen.getByTestId("search-tab-decks"))
    expect(screen.queryByTestId("search-cards-section")).toBeNull()
    expect(screen.getByTestId("search-decks-section")).toBeTruthy()
  })

  it("switching to Cards tab hides decks section", async () => {
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "aspirin" } })
    await waitFor(() => screen.getByTestId("search-tab-cards"))
    fireEvent.click(screen.getByTestId("search-tab-cards"))
    await waitFor(() => expect(screen.getByTestId("search-cards-section")).toBeTruthy(), { timeout: 500 })
    expect(screen.queryByTestId("search-decks-section")).toBeNull()
  })

  it("calls onNavigate with deck type when deck result clicked", async () => {
    const onNavigate = vi.fn()
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={onNavigate} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "Cardio" } })
    await waitFor(() => screen.getByTestId("search-deck-result-Cardiology"), { timeout: 500 })
    fireEvent.click(screen.getByTestId("search-deck-result-Cardiology"))
    expect(onNavigate).toHaveBeenCalledWith({ type:"deck", deck:"Cardiology" })
  })

  it("calls onNavigate with card type when card result clicked", async () => {
    const onNavigate = vi.fn()
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={onNavigate} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "aspirin" } })
    await waitFor(() => screen.getByTestId("search-card-result-c1"), { timeout: 500 })
    fireEvent.click(screen.getByTestId("search-card-result-c1"))
    expect(onNavigate).toHaveBeenCalledWith({ type:"card", deck:"Pharmacology", cardId:"c1" })
  })

  it("calls onClose when Escape key pressed", () => {
    const onClose = vi.fn()
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={onClose} />)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn()
    render(<SearchModal cards={CARDS} decks={DECKS} onNavigate={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByTestId("search-modal-backdrop"))
    expect(onClose).toHaveBeenCalled()
  })
})
