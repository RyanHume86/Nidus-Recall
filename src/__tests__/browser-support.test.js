import { describe, it, expect } from "vitest"
import { isUnsupportedBrowser } from "@/lib/browser-support"

// ── Chrome ─────────────────────────────────────────────────────────────────
describe("Chrome", () => {
  it("returns false for Chrome 110 (minimum)", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 AppleWebKit/537.36 Chrome/110.0.0.0 Safari/537.36")).toBe(false)
  })
  it("returns false for Chrome 120", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")).toBe(false)
  })
  it("returns true for Chrome 109 (below minimum)", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 AppleWebKit/537.36 Chrome/109.0.0.0 Safari/537.36")).toBe(true)
  })
})

// ── Edge ──────────────────────────────────────────────────────────────────
describe("Edge (Chromium)", () => {
  it("returns false for Edge 110", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 AppleWebKit/537.36 Chrome/110.0.0.0 Safari/537.36 Edg/110.0.1587.57")).toBe(false)
  })
  it("returns true for Edge 109", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 AppleWebKit/537.36 Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.61")).toBe(true)
  })
})

// ── Firefox ───────────────────────────────────────────────────────────────
describe("Firefox", () => {
  it("returns false for Firefox 110", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 Gecko/20100101 Firefox/110.0")).toBe(false)
  })
  it("returns true for Firefox 109", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 Gecko/20100101 Firefox/109.0")).toBe(true)
  })
})

// ── Safari ─────────────────────────────────────────────────────────────────
describe("Safari", () => {
  it("returns false for Safari 16.4", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/16.4 Safari/605.1.15")).toBe(false)
  })
  it("returns true for Safari 15", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/15.6 Safari/605.1.15")).toBe(true)
  })
  it("does not flag Chrome UA that mentions Safari", () => {
    // Chrome UAs include "Safari" at end but should be detected as Chrome
    expect(isUnsupportedBrowser("Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")).toBe(false)
  })
})

// ── Samsung Internet ───────────────────────────────────────────────────────
describe("Samsung Internet", () => {
  it("returns false for Samsung Internet 21", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 SamsungBrowser/21.0 Chrome/110 Safari/604.1")).toBe(false)
  })
  it("returns true for Samsung Internet 20", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 SamsungBrowser/20.0 Chrome/103 Safari/604.1")).toBe(true)
  })
})

// ── Internet Explorer ──────────────────────────────────────────────────────
describe("Internet Explorer", () => {
  it("returns true for IE 11", () => {
    expect(isUnsupportedBrowser("Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko")).toBe(true)
  })
  it("returns true for IE with MSIE token", () => {
    expect(isUnsupportedBrowser("Mozilla/4.0 (compatible; MSIE 9.0; Windows NT 6.1)")).toBe(true)
  })
})
