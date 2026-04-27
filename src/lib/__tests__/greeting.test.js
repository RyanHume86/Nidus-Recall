import { describe, it, expect } from "vitest"
import { getTimeOfDay, getGreeting } from "../greeting"

function h(hour) { return new Date(2026, 0, 1, hour, 0, 0) }

describe("getTimeOfDay", () => {
  it("returns morning at 05:00", () => expect(getTimeOfDay(h(5))).toBe("morning"))
  it("returns morning at 11:59", () => expect(getTimeOfDay(h(11))).toBe("morning"))
  it("returns afternoon at 12:00", () => expect(getTimeOfDay(h(12))).toBe("afternoon"))
  it("returns afternoon at 16:59", () => expect(getTimeOfDay(h(16))).toBe("afternoon"))
  it("returns evening at 17:00", () => expect(getTimeOfDay(h(17))).toBe("evening"))
  it("returns evening at 20:59", () => expect(getTimeOfDay(h(20))).toBe("evening"))
  it("returns night at 21:00", () => expect(getTimeOfDay(h(21))).toBe("night"))
  it("returns night at 23:00", () => expect(getTimeOfDay(h(23))).toBe("night"))
  it("returns night at 00:00", () => expect(getTimeOfDay(h(0))).toBe("night"))
  it("returns night at 04:59", () => expect(getTimeOfDay(h(4))).toBe("night"))
})

describe("getGreeting", () => {
  it("includes first name when provided", () => {
    expect(getGreeting("Ryan", h(9))).toBe("Good morning, Ryan")
  })
  it("omits suffix when name is empty string", () => {
    expect(getGreeting("", h(9))).toBe("Good morning")
  })
  it("omits suffix when name is null", () => {
    expect(getGreeting(null, h(14))).toBe("Good afternoon")
  })
  it("omits suffix when name is whitespace", () => {
    expect(getGreeting("   ", h(14))).toBe("Good afternoon")
  })
  it("uses Hello at night, not Good night", () => {
    expect(getGreeting("Ryan", h(22))).toBe("Hello, Ryan")
  })
  it("uses Hello at night without name", () => {
    expect(getGreeting(null, h(2))).toBe("Hello")
  })
  it("trims name whitespace", () => {
    expect(getGreeting("  Alex  ", h(18))).toBe("Good evening, Alex")
  })
})
