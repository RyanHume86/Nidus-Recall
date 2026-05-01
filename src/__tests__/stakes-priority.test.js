import { describe, it, expect } from "vitest"
import { getDueWithCatchup, getStakesDue } from "@/lib/fsrs"

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

function makeCard(id, opts = {}) {
  return { id, deck: "D", front: "Q", back: "A", nextReview: yesterday, stability: 1, interval: 1, ...opts }
}

describe("getDueWithCatchup — stakes prioritization", () => {
  it("stakes cards survive cap when non-stakes would be trimmed", () => {
    const cards = [
      makeCard("s1", { stakes_flag: true }),
      makeCard("s2", { stakes_flag: true }),
      makeCard("n1", { stakes_flag: false }),
      makeCard("n2", { stakes_flag: false }),
      makeCard("n3", { stakes_flag: false }),
    ]
    const result = getDueWithCatchup(cards, 2, 3)
    const ids = result.map(c => c.id)
    expect(ids).toContain("s1")
    expect(ids).toContain("s2")
  })

  it("non-stakes fill remaining cap slots after stakes", () => {
    // 4 cards, cap=4, days=2 → effectiveCap = min(4, ceil(4/2)) = 2
    // So: 1 stakes slot + 1 non-stakes slot
    const cards = [
      makeCard("s1", { stakes_flag: true }),
      makeCard("n1", { stakes_flag: false }),
      makeCard("n2", { stakes_flag: false }),
      makeCard("n3", { stakes_flag: false }),
    ]
    const result = getDueWithCatchup(cards, 4, 2)
    expect(result.length).toBe(2)
    expect(result.some(c => c.stakes_flag)).toBe(true)
    expect(result.some(c => !c.stakes_flag)).toBe(true)
  })

  it("returns all cards when count <= cap (no trimming)", () => {
    const cards = [
      makeCard("s1", { stakes_flag: true }),
      makeCard("n1", { stakes_flag: false }),
    ]
    const result = getDueWithCatchup(cards, 10, 1)
    expect(result.length).toBe(2)
  })

  it("does not include future-due cards", () => {
    const future = makeCard("f1", { nextReview: "2099-01-01", stakes_flag: true })
    const due    = makeCard("d1", { stakes_flag: false })
    const result = getDueWithCatchup([future, due], 10, 1)
    const ids = result.map(c => c.id)
    expect(ids).not.toContain("f1")
    expect(ids).toContain("d1")
  })
})

describe("getStakesDue", () => {
  it("returns only stakes-flagged due cards", () => {
    const cards = [
      makeCard("s1", { stakes_flag: true }),
      makeCard("s2", { stakes_flag: true }),
      makeCard("n1", { stakes_flag: false }),
    ]
    const result = getStakesDue(cards)
    expect(result.every(c => c.stakes_flag)).toBe(true)
    expect(result.length).toBe(2)
  })

  it("returns empty array when no stakes cards are due", () => {
    const cards = [makeCard("n1", { stakes_flag: false })]
    expect(getStakesDue(cards)).toHaveLength(0)
  })
})
