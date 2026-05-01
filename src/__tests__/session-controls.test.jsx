import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StudySelectView } from "@/views/StudySelectView"

const BASE_SETTINGS = {
  newCardCap: 15, reviewCap: 100, catchupDays: 7,
  matureModeEnabled: true, matureCardThreshold: 30,
  attentionDeclarationEnabled: false,
}

function makeCard(overrides) {
  return { id: "c1", deck: "Cardiology", front: "Q", back: "A", stability: 0, ...overrides }
}

describe("StudySelectView — mature card count", () => {
  it("shows mature count when there are mature cards", () => {
    const cards = [
      makeCard({ id:"c1", stability:35, interval:35, due:new Date(Date.now()-86400000).toISOString() }),
    ]
    render(
      <StudySelectView
        cards={cards} decks={["Cardiology"]}
        settings={BASE_SETTINGS}
        onStartSRS={() => {}} onStartFree={() => {}} onStartInterleaved={() => {}}
      />
    )
    const matureEl = screen.getByTestId("mature-count")
    expect(matureEl).toBeTruthy()
    expect(matureEl.textContent).toContain("1")
  })

  it("hides mature count when matureModeEnabled is false", () => {
    const cards = [makeCard({ id:"c1", stability:35, interval:35, due:new Date(Date.now()-86400000).toISOString() })]
    render(
      <StudySelectView
        cards={cards} decks={["Cardiology"]}
        settings={{ ...BASE_SETTINGS, matureModeEnabled: false }}
        onStartSRS={() => {}} onStartFree={() => {}} onStartInterleaved={() => {}}
      />
    )
    expect(screen.queryByTestId("mature-count")).toBeNull()
  })

  it("hides mature count when there are no mature cards", () => {
    const cards = [makeCard({ id:"c1", stability:5 })]
    render(
      <StudySelectView
        cards={cards} decks={["Cardiology"]}
        settings={BASE_SETTINGS}
        onStartSRS={() => {}} onStartFree={() => {}} onStartInterleaved={() => {}}
      />
    )
    expect(screen.queryByTestId("mature-count")).toBeNull()
  })
})

describe("StudySelectView — mode selection", () => {
  it("shows SRS stats card when SRS mode is active", () => {
    render(
      <StudySelectView
        cards={[]} decks={[]}
        settings={BASE_SETTINGS}
        onStartSRS={() => {}} onStartFree={() => {}} onStartInterleaved={() => {}}
      />
    )
    expect(screen.getByTestId("srs-stats-row")).toBeTruthy()
  })

  it("clicking Free Study mode shows free card count", () => {
    render(
      <StudySelectView
        cards={[]} decks={[]}
        settings={BASE_SETTINGS}
        onStartSRS={() => {}} onStartFree={() => {}} onStartInterleaved={() => {}}
      />
    )
    fireEvent.click(screen.getByText("Free Study"))
    expect(screen.queryByTestId("srs-stats-row")).toBeNull()
  })
})
