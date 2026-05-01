import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EmptyState, ErrorState } from "@/components/EmptyState"
import { CardSkeleton } from "@/components/CardSkeleton"

describe("EmptyState", () => {
  it("renders icon, title, and body", () => {
    render(<EmptyState icon="📭" title="Nothing here" body="Add something to get started." />)
    expect(screen.getByTestId("empty-state")).toBeTruthy()
    expect(screen.getByText("Nothing here")).toBeTruthy()
    expect(screen.getByText("Add something to get started.")).toBeTruthy()
    expect(screen.getByText("📭")).toBeTruthy()
  })

  it("renders action button when provided", () => {
    const onClick = () => {}
    render(<EmptyState icon="📭" title="Empty" action={{ label: "Create deck", onClick }} />)
    expect(screen.getByText("Create deck")).toBeTruthy()
  })

  it("omits action button when not provided", () => {
    render(<EmptyState icon="📭" title="Empty" />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("calls action.onClick when button clicked", () => {
    let clicked = false
    render(<EmptyState icon="📭" title="Empty" action={{ label: "Go", onClick: () => { clicked = true } }} />)
    fireEvent.click(screen.getByText("Go"))
    expect(clicked).toBe(true)
  })
})

describe("ErrorState", () => {
  it("renders error title and message", () => {
    render(<ErrorState message="Could not load data." />)
    expect(screen.getByTestId("error-state")).toBeTruthy()
    expect(screen.getByText("Something went wrong")).toBeTruthy()
    expect(screen.getByText("Could not load data.")).toBeTruthy()
  })

  it("renders retry button when onRetry provided", () => {
    let retried = false
    render(<ErrorState onRetry={() => { retried = true }} />)
    fireEvent.click(screen.getByText("Try again"))
    expect(retried).toBe(true)
  })

  it("omits retry button when not provided", () => {
    render(<ErrorState message="Oops" />)
    expect(screen.queryByText("Try again")).toBeNull()
  })
})

describe("CardSkeleton", () => {
  it("renders correct number of skeleton rows", () => {
    render(<CardSkeleton count={3} />)
    expect(screen.getByTestId("card-skeleton")).toBeTruthy()
    const rows = screen.getByTestId("card-skeleton").children
    expect(rows.length).toBe(3)
  })

  it("defaults to 5 rows", () => {
    render(<CardSkeleton />)
    expect(screen.getByTestId("card-skeleton").children.length).toBe(5)
  })
})
