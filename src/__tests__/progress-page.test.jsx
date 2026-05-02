import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatsView } from "@/views/StatsView"
import {
  computeStreak, computeSevenDayRetention,
  buildForecast, buildMaturityBuckets, buildContentTypeBreakdown, computeAlwaysCovered
} from "@/lib/stats"
import { isActive } from "@/lib/fsrs"

// ── Helper factories ──────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

function makeLog(overrides = []) {
  return overrides
}

function makeCard(overrides = {}) {
  return { id: "c1", deck: "D", front: "Q", back: "A", status: "Active", nextReview: null, ...overrides }
}

const EMPTY_SETTINGS = {}

function renderStats(log = [], cards = []) {
  return render(
    <StatsView log={log} cards={cards} decks={[]} settings={EMPTY_SETTINGS} />
  )
}

// ── Unit tests for stats helpers ─────────────────────────────────────────────
describe("computeStreak", () => {
  it("returns 0 when log is empty", () => {
    expect(computeStreak([])).toBe(0)
  })

  it("counts consecutive days including today", () => {
    const log = [
      { date: daysAgo(0) },
      { date: daysAgo(1) },
      { date: daysAgo(2) },
    ]
    expect(computeStreak(log)).toBe(3)
  })

  it("stops at a gap", () => {
    const log = [
      { date: daysAgo(0) },
      { date: daysAgo(1) },
      { date: daysAgo(3) },  // gap at day 2
    ]
    expect(computeStreak(log)).toBe(2)
  })
})

describe("computeSevenDayRetention", () => {
  it("returns null when no ratings in past 7 days", () => {
    expect(computeSevenDayRetention([])).toBeNull()
  })

  it("computes (good+easy)/total correctly", () => {
    const log = [{ date: daysAgo(0), ratingBreakdown: { again:2, hard:0, good:6, easy:2 } }]
    expect(computeSevenDayRetention(log)).toBe(80)  // (6+2)/10 = 80%
  })

  it("excludes sessions older than 7 days", () => {
    const log = [
      { date: daysAgo(0), ratingBreakdown: { again:0, hard:0, good:5, easy:5 } },
      { date: daysAgo(8), ratingBreakdown: { again:10, hard:0, good:0, easy:0 } },  // excluded
    ]
    expect(computeSevenDayRetention(log)).toBe(100)
  })
})

describe("buildForecast", () => {
  it("returns 30 entries", () => {
    expect(buildForecast([], isActive)).toHaveLength(30)
  })

  it("includes cards due today in day 0", () => {
    const card = makeCard({ nextReview: todayStr(), reviewCount: 1, stability: 5 })
    const result = buildForecast([card], isActive)
    expect(result[0].due).toBe(1)
  })

  it("places future cards in the correct future bucket", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const card = makeCard({ nextReview: tomorrow, reviewCount: 1, stability: 5 })
    const result = buildForecast([card], isActive)
    expect(result[0].due).toBe(0)
    expect(result[1].due).toBe(1)
  })
})

describe("buildMaturityBuckets", () => {
  it("buckets unseen cards as new", () => {
    const card = makeCard({ reviewCount: 0 })
    const buckets = buildMaturityBuckets([card], isActive)
    expect(buckets.new).toBe(1)
  })

  it("buckets low-stability cards as learning", () => {
    const card = makeCard({ reviewCount: 3, stability: 4 })
    const buckets = buildMaturityBuckets([card], isActive)
    expect(buckets.learning).toBe(1)
  })

  it("buckets stability 7–29 as young", () => {
    const card = makeCard({ reviewCount: 3, stability: 15 })
    const buckets = buildMaturityBuckets([card], isActive)
    expect(buckets.young).toBe(1)
  })

  it("buckets stability >=30 as mature", () => {
    const card = makeCard({ reviewCount: 5, stability: 45 })
    const buckets = buildMaturityBuckets([card], isActive)
    expect(buckets.mature).toBe(1)
  })
})

describe("buildContentTypeBreakdown", () => {
  it("aggregates contentTypeBreakdown from sessions in last N days", () => {
    const log = [
      { date: daysAgo(0), contentTypeBreakdown: { Factual: 5, Anatomy: 2 } },
      { date: daysAgo(1), contentTypeBreakdown: { Factual: 3 } },
    ]
    const result = buildContentTypeBreakdown(log, 30)
    expect(result.Factual).toBe(8)
    expect(result.Anatomy).toBe(2)
  })

  it("excludes sessions older than the window", () => {
    const log = [
      { date: daysAgo(0), contentTypeBreakdown: { Factual: 5 } },
      { date: daysAgo(35), contentTypeBreakdown: { Factual: 100 } },  // excluded
    ]
    expect(buildContentTypeBreakdown(log, 30).Factual).toBe(5)
  })
})

describe("computeAlwaysCovered", () => {
  it("returns null when no stakes cards", () => {
    expect(computeAlwaysCovered([], isActive)).toBeNull()
  })

  it("counts stakes cards reviewed in past 7 days", () => {
    const reviewed = makeCard({ stakes_flag: true, lastReview: daysAgo(0) })
    const unreviewed = makeCard({ id: "c2", stakes_flag: true, lastReview: null })
    const result = computeAlwaysCovered([reviewed, unreviewed], isActive)
    expect(result.covered).toBe(1)
    expect(result.total).toBe(2)
    expect(result.pct).toBe(50)
  })

  it("returns 100% when all stakes cards reviewed recently", () => {
    const card = makeCard({ stakes_flag: true, lastReview: daysAgo(1) })
    const result = computeAlwaysCovered([card], isActive)
    expect(result.pct).toBe(100)
  })
})

// ── Render tests for StatsView sections ──────────────────────────────────────
describe("StatsView — empty state", () => {
  it("renders empty state when no sessions", () => {
    renderStats([], [])
    expect(screen.getByTestId("empty-state")).toBeTruthy()
  })
})

describe("StatsView — headline stats", () => {
  it("renders headline stats row", () => {
    renderStats([], [])
    expect(screen.getByTestId("headline-stats")).toBeTruthy()
  })

  it("shows streak and due-today stats", () => {
    renderStats([], [])
    expect(screen.getByTestId("stat-streak")).toBeTruthy()
    expect(screen.getByTestId("stat-due-today")).toBeTruthy()
  })
})

describe("StatsView — forecast section", () => {
  it("renders forecast when cards have future due dates", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const card = makeCard({ nextReview: tomorrow, reviewCount: 1, stability: 5 })
    renderStats([], [card])
    expect(screen.getByTestId("forecast-section")).toBeTruthy()
  })

  it("does not render forecast when no cards are due", () => {
    renderStats([], [])
    expect(screen.queryByTestId("forecast-section")).toBeNull()
  })
})

describe("StatsView — maturity section", () => {
  it("renders maturity distribution when active cards exist", () => {
    const card = makeCard({ reviewCount: 0 })
    renderStats([], [card])
    expect(screen.getByTestId("maturity-section")).toBeTruthy()
  })

  it("does not render maturity section when no active cards", () => {
    renderStats([], [])
    expect(screen.queryByTestId("maturity-section")).toBeNull()
  })
})

describe("StatsView — always-covered badge", () => {
  it("renders always-covered when stakes cards exist", () => {
    const card = makeCard({ stakes_flag: true, lastReview: null })
    renderStats([], [card])
    expect(screen.getByTestId("always-covered-section")).toBeTruthy()
    expect(screen.getByTestId("always-covered-pct").textContent).toBe("0%")
  })

  it("does not render always-covered when no stakes cards", () => {
    renderStats([], [makeCard({ stakes_flag: false })])
    expect(screen.queryByTestId("always-covered-section")).toBeNull()
  })
})

describe("StatsView — content-type section", () => {
  it("renders content-type breakdown when sessions have ct data", () => {
    const log = [{ date: daysAgo(0), contentTypeBreakdown: { Factual: 5 }, reviewed: 5, failed: 0, newAdded: 0 }]
    renderStats(log, [])
    expect(screen.getByTestId("content-type-section")).toBeTruthy()
  })

  it("does not render content-type section with no ct data", () => {
    renderStats([], [])
    expect(screen.queryByTestId("content-type-section")).toBeNull()
  })
})

describe("StatsView — friction log", () => {
  it("renders friction notes section when entries have notes", () => {
    const log = [
      { date: daysAgo(0), frictionNote: "Hard to focus today", reviewed: 5, failed: 0, newAdded: 0 },
    ]
    renderStats(log, [])
    const section = screen.getByTestId("friction-log-section")
    expect(section).toBeTruthy()
    expect(section.textContent).toContain("Hard to focus today")
  })

  it("does not render friction log when no notes exist", () => {
    const log = [{ date: daysAgo(0), frictionNote: "", reviewed: 5, failed: 0, newAdded: 0 }]
    renderStats(log, [])
    expect(screen.queryByTestId("friction-log-section")).toBeNull()
  })
})
