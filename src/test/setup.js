/* global global */
// @testing-library/jest-dom: MIT, testing-library/jest-dom, extends vitest matchers with DOM assertions.
import '@testing-library/jest-dom'

// Recharts uses ResizeObserver which jsdom does not implement.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}