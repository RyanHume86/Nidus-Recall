import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ContentTypeChips, readLastContentType, CONTENT_TYPES } from "@/components/ContentTypeChips"

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true })

beforeEach(() => localStorageMock.clear())

describe("ContentTypeChips", () => {
  it("renders all five chip types", () => {
    render(<ContentTypeChips value="Factual" onChange={() => {}} />)
    for (const t of CONTENT_TYPES) {
      expect(screen.getByTestId(`ct-chip-${t.replace(/\s+/g, "-")}`)).toBeTruthy()
    }
  })

  it("selected chip has aria-pressed=true, others false", () => {
    render(<ContentTypeChips value="Mechanism" onChange={() => {}} />)
    expect(screen.getByTestId("ct-chip-Mechanism").getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByTestId("ct-chip-Factual").getAttribute("aria-pressed")).toBe("false")
  })

  it("calls onChange with the clicked type", () => {
    const onChange = vi.fn()
    render(<ContentTypeChips value="Factual" onChange={onChange} />)
    fireEvent.click(screen.getByTestId("ct-chip-Pathology"))
    expect(onChange).toHaveBeenCalledWith("Pathology")
  })

  it("persists selection to localStorage on click", () => {
    render(<ContentTypeChips value="Factual" onChange={() => {}} />)
    fireEvent.click(screen.getByTestId("ct-chip-Mechanism"))
    expect(localStorageMock.getItem("nidus.lastContentType")).toBe("Mechanism")
  })

  it("persists Clinical Reasoning (with spaces) to localStorage", () => {
    render(<ContentTypeChips value="Factual" onChange={() => {}} />)
    fireEvent.click(screen.getByTestId("ct-chip-Clinical-Reasoning"))
    expect(localStorageMock.getItem("nidus.lastContentType")).toBe("Clinical Reasoning")
  })
})

describe("readLastContentType", () => {
  it("returns Factual when localStorage is empty", () => {
    expect(readLastContentType()).toBe("Factual")
  })

  it("returns stored value when valid", () => {
    localStorageMock.setItem("nidus.lastContentType", "Anatomy")
    expect(readLastContentType()).toBe("Anatomy")
  })

  it("returns Factual for an unknown stored value", () => {
    localStorageMock.setItem("nidus.lastContentType", "randomjunk")
    expect(readLastContentType()).toBe("Factual")
  })

  it("returns last-set type across simulated saves", () => {
    localStorageMock.setItem("nidus.lastContentType", "Mechanism")
    expect(readLastContentType()).toBe("Mechanism")
    localStorageMock.setItem("nidus.lastContentType", "Pathology")
    expect(readLastContentType()).toBe("Pathology")
  })
})
