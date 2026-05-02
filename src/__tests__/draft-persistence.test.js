import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
/* global global */
import { saveDraft, loadDrafts, clearDraft, clearAllDrafts, withRetry } from "@/lib/draft-persistence"

// ── Mock localStorage ─────────────────────────────────────────────────────────
const store = {}
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
  get length() { return Object.keys(store).length },
  key: (i) => Object.keys(store)[i],
  clear: () => { for (const k in store) delete store[k] },
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

beforeEach(() => localStorageMock.clear())

// ── Draft CRUD ────────────────────────────────────────────────────────────────
describe("saveDraft", () => {
  it("writes a nidus.draft.flashcard.* key to localStorage", () => {
    const cards = [{ id: "c1", front: "Q", back: "A" }]
    const key = saveDraft(cards)
    expect(key).toMatch(/^nidus\.draft\.flashcard\./)
    expect(JSON.parse(localStorage.getItem(key))).toEqual(cards)
  })
})

describe("loadDrafts", () => {
  it("returns empty array when no drafts exist", () => {
    expect(loadDrafts()).toEqual([])
  })

  it("returns all draft entries with key and cards", () => {
    const cards = [{ id: "c1" }]
    const key = saveDraft(cards)
    const drafts = loadDrafts()
    expect(drafts).toHaveLength(1)
    expect(drafts[0].key).toBe(key)
    expect(drafts[0].cards).toEqual(cards)
  })

  it("ignores non-draft localStorage keys", () => {
    localStorage.setItem("some.other.key", "value")
    expect(loadDrafts()).toHaveLength(0)
  })
})

describe("clearDraft", () => {
  it("removes the specific draft key", () => {
    const key = saveDraft([{ id: "c1" }])
    clearDraft(key)
    expect(loadDrafts()).toHaveLength(0)
  })
})

describe("clearAllDrafts", () => {
  it("removes all draft keys but leaves others intact", () => {
    saveDraft([{ id: "c1" }])
    saveDraft([{ id: "c2" }])
    localStorage.setItem("other.key", "x")
    clearAllDrafts()
    expect(loadDrafts()).toHaveLength(0)
    expect(localStorage.getItem("other.key")).toBe("x")
  })
})

// ── withRetry ─────────────────────────────────────────────────────────────────
describe("withRetry", () => {
  it("resolves immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    const result = await withRetry(fn, 3, 0)
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries up to maxAttempts on failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"))
    await expect(withRetry(fn, 3, 0)).rejects.toThrow("fail")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("succeeds on a later attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok")
    const result = await withRetry(fn, 3, 0)
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("throws the last error after all attempts exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network"))
    await expect(withRetry(fn, 2, 0)).rejects.toThrow("network")
    expect(fn).toHaveBeenCalledTimes(2)
  })
})