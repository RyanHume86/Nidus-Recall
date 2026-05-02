import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SettingsView } from "@/views/SettingsView"
import { StudySelectView } from "@/views/StudySelectView"

const BASE_SETTINGS = {
  newCardCap: 15, reviewCap: 100, leechThreshold: 5,
  retentionTarget: 0.90, catchupDays: 7,
  sleepBedtime: null, sleepWindowMinutes: 90, sleepBannerEnabled: true, sleepPrefersReviews: true,
  matureModeEnabled: true, matureCardThreshold: 30,
  fatigueAlertsEnabled: true, attentionDeclarationEnabled: true,
  dailyNewCardLimit: 20, dailyReviewLimit: 200,
  timezone: "Africa/Johannesburg",
}

function renderSettings(overrides = {}, onUpdate = vi.fn()) {
  return render(
    <SettingsView
      settings={{ ...BASE_SETTINGS, ...overrides }}
      onUpdateSettings={onUpdate}
      cards={[]}
      decks={[]}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onImportCards={vi.fn()}
      onImportAnki={vi.fn()}
      onRefitParams={vi.fn()}
      schedulerParams={null}
      onDeleteAccount={vi.fn()}
    />
  )
}

describe("SettingsView — tabs", () => {
  it("renders profile tab by default", () => {
    renderSettings()
    expect(screen.getByTestId("first-name-input")).toBeTruthy()
  })

  it("shows timezone selector on profile tab", () => {
    renderSettings()
    expect(screen.getByTestId("timezone-select")).toBeTruthy()
  })

  it("renders schedule tab with daily limits when clicked", () => {
    renderSettings()
    fireEvent.click(screen.getByText("Schedule"))
    expect(screen.getByText("Daily limits")).toBeTruthy()
    expect(screen.getByText("New cards per day")).toBeTruthy()
  })

  it("renders algorithm tab when clicked", () => {
    renderSettings()
    fireEvent.click(screen.getByText("Algorithm"))
    expect(screen.getByTestId("show-advanced-algo")).toBeTruthy()
  })

  it("shows FSRS advanced controls when 'Show advanced' is clicked", () => {
    renderSettings()
    fireEvent.click(screen.getByText("Algorithm"))
    fireEvent.click(screen.getByTestId("show-advanced-algo"))
    expect(screen.getByText("Request retention")).toBeTruthy()
    expect(screen.getByText("Maximum interval")).toBeTruthy()
  })

  it("renders data tab", () => {
    renderSettings()
    fireEvent.click(screen.getByText("Data"))
    expect(screen.getAllByText(/export/i).length).toBeGreaterThan(0)
  })

  it("renders privacy tab with delete account button", () => {
    renderSettings()
    fireEvent.click(screen.getByText("Privacy"))
    expect(screen.getByTestId("delete-account-btn")).toBeTruthy()
  })

  it("renders about section regardless of active tab", () => {
    renderSettings()
    expect(screen.getByTestId("about-section")).toBeTruthy()
  })
})

describe("SettingsView — profile", () => {
  it("shows email and role when user object provided", () => {
    render(
      <SettingsView
        settings={BASE_SETTINGS} onUpdateSettings={vi.fn()}
        cards={[]} decks={[]} onExport={vi.fn()} onImport={vi.fn()}
        onImportCards={vi.fn()} onImportAnki={vi.fn()} onRefitParams={vi.fn()}
        schedulerParams={null} onDeleteAccount={vi.fn()}
        user={{ email: "test@example.com", role: "Student" }}
      />
    )
    expect(screen.getByDisplayValue("test@example.com")).toBeTruthy()
    expect(screen.getByDisplayValue("Student")).toBeTruthy()
  })

  it("does not render email/role fields when no user object", () => {
    renderSettings()
    expect(screen.queryByDisplayValue("test@example.com")).toBeNull()
  })
})

describe("SettingsView — timezone", () => {
  it("calls onUpdateSettings with timezone when changed", () => {
    const onUpdate = vi.fn()
    renderSettings({}, onUpdate)
    const select = screen.getByTestId("timezone-select")
    fireEvent.change(select, { target: { value: "Europe/London" } })
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Europe/London" })
    )
  })
})

describe("SettingsView — daily limits", () => {
  it("calls onUpdateSettings with dailyNewCardLimit when changed", () => {
    const onUpdate = vi.fn()
    renderSettings({}, onUpdate)
    fireEvent.click(screen.getByText("Schedule"))
    const sliders = screen.getAllByRole("slider")
    // First slider is dailyNewCardLimit
    fireEvent.change(sliders[0], { target: { value: "10" } })
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ dailyNewCardLimit: 10 })
    )
  })
})

describe("StudySelectView — daily limit caps", () => {
  const TODAY = new Date().toISOString().split('T')[0]
  const makeDueCard = (id) => ({
    id, deck: "D", front: "Q", back: "A", status: "Active",
    nextReview: TODAY, reviewCount: 1, stability: 5,
  })
  const makeNewCard = (id) => ({
    id, deck: "D", front: "Q", back: "A", status: "Active",
    nextReview: null, reviewCount: 0, stability: null,
  })

  it("daily_review_limit caps the displayed due count", () => {
    const cards = [makeDueCard("d1"), makeDueCard("d2"), makeDueCard("d3")]
    render(
      <StudySelectView
        cards={cards}
        decks={["D"]}
        settings={{ ...BASE_SETTINGS, dailyReviewLimit: 2, reviewCap: 100, catchupDays: 1 }}
        onStartSRS={vi.fn()} onStartFree={vi.fn()} onStartInterleaved={vi.fn()}
      />
    )
    const statsRow = screen.getByTestId("srs-stats-row")
    // Due count should be capped at 2 (dailyReviewLimit), not 3
    expect(statsRow.textContent).toMatch(/\b2\b/)
    expect(statsRow.textContent).not.toMatch(/\b3\b/)
  })

  it("daily_new_card_limit caps the displayed new count", () => {
    const cards = [makeNewCard("n1"), makeNewCard("n2"), makeNewCard("n3"), makeNewCard("n4"), makeNewCard("n5")]
    render(
      <StudySelectView
        cards={cards}
        decks={["D"]}
        settings={{ ...BASE_SETTINGS, dailyNewCardLimit: 3, newCardCap: 15, catchupDays: 1 }}
        onStartSRS={vi.fn()} onStartFree={vi.fn()} onStartInterleaved={vi.fn()}
      />
    )
    const statsRow = screen.getByTestId("srs-stats-row")
    expect(statsRow.textContent).toContain("3")
    expect(statsRow.textContent).not.toContain("5 new")
  })
})
