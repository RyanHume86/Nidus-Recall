import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SearchModal } from "@/modals/SearchModal"
import { ContentTypeChips, CONTENT_TYPES } from "@/components/ContentTypeChips"
import { Breadcrumbs } from "@/components/layout/Breadcrumbs"

describe("SearchModal — accessibility and mobile structure", () => {
  it("renders dialog with role and aria-modal", () => {
    render(<SearchModal cards={[]} decks={[]} onNavigate={() => {}} onClose={() => {}} />)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("aria-label")).toBe("Search")
  })

  it("modal container has nid-search-modal class for CSS bottom-sheet targeting", () => {
    render(<SearchModal cards={[]} decks={[]} onNavigate={() => {}} onClose={() => {}} />)
    const modal = screen.getByTestId("search-modal")
    expect(modal.classList.contains("nid-search-modal")).toBe(true)
  })

  it("backdrop has nid-search-backdrop class for CSS bottom-sheet targeting", () => {
    render(<SearchModal cards={[]} decks={[]} onNavigate={() => {}} onClose={() => {}} />)
    const backdrop = screen.getByTestId("search-modal-backdrop")
    expect(backdrop.classList.contains("nid-search-backdrop")).toBe(true)
  })
})

describe("ContentTypeChips — mobile accessibility", () => {
  it("chip group has role=group and aria-label", () => {
    render(<ContentTypeChips value="Factual" onChange={() => {}} />)
    const group = screen.getByRole("group", { name: "Content type" })
    expect(group).toBeTruthy()
  })

  it("all chips are type=button (not submit)", () => {
    render(<ContentTypeChips value="Factual" onChange={() => {}} />)
    for (const t of CONTENT_TYPES) {
      const btn = screen.getByTestId(`ct-chip-${t.replace(/\s+/g, "-")}`)
      expect(btn.getAttribute("type")).toBe("button")
    }
  })
})

describe("Breadcrumbs — overflow guard", () => {
  it("renders nav with aria-label Breadcrumb", () => {
    render(<Breadcrumbs view="deck" selectedDeck="Cardiology" onNavigate={() => {}} />)
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(nav).toBeTruthy()
  })

  it("breadcrumb list is an ol element", () => {
    render(<Breadcrumbs view="deck" selectedDeck="Cardiology" onNavigate={() => {}} />)
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(nav.querySelector("ol")).toBeTruthy()
  })

  it("returns null for single-crumb views (no overflow risk)", () => {
    const { container } = render(<Breadcrumbs view="library" selectedDeck={null} onNavigate={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
