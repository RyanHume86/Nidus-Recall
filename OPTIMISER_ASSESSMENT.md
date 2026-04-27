# FSRS-5 Optimiser Assessment (2026-04-27)

## Question

Is porting the full 19-parameter FSRS-5 optimisation to JavaScript feasible in one session?

## Findings

`fsrs-browser` (npm v5.2.0, BSD-3-Clause, no declared dependencies) exists and advertises a browser-capable optimiser built on WebAssembly. It benchmarks at roughly 3.5 s for 24,000 review-log entries, so 500 entries is computationally trivial. However, the package is maintained by `alexerrant` (Pentive) rather than the official `open-spaced-repetition` org, its parameter count (21) does not match FSRS-5's canonical 19, and its API surface is undocumented beyond the GitHub README. Integrating a 1.7 MB WASM bundle into the existing Vite PWA requires non-trivial build configuration (`optimizeDeps.exclude`, Worker URL pattern, WASM serving), and testing WASM convergence in Vitest/jsdom adds further complexity. `ts-fsrs` (the scheduler already in use) does not include an optimiser. No official, well-maintained JS/WASM port of the 19-parameter descent exists today.

## Decision

**Path B** taken. The labeling bug (a single-parameter tuner called "FSRS-5 parameter gradient descent") is fixed immediately by renaming and honest UI copy. True 19-parameter optimisation is deferred to a dedicated future feature that will: audit the `open-spaced-repetition` WASM ecosystem for an official port, benchmark convergence on real review data, and wire the result into the existing `UserSchedulerParams` storage. The current retention-target tuner (adjusting `w[17]` and the `retentionTarget` setting from observed accuracy) is retained and correctly labelled.
