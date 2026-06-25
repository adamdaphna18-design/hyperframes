# Test Coverage Findings

A point-in-time audit of the monorepo's automated tests, the gaps worth
closing, and the concrete first steps taken on this branch. Generated as part
of a test-coverage review; treat the structural findings below as actionable
backlog items, not as already-fixed.

## Snapshot

- **~400 test files**, uniformly Vitest 3.2.4, `*.test.ts` convention.
- Testing culture is strong where it exists — parsers, the runtime, and the
  capture engine are genuinely well covered.
- Coverage **measurement** is almost absent, and two CI gaps mean a meaningful
  slice of existing tests never gates a PR.

| Package                    | Test / Source files | Health                                                    |
| -------------------------- | ------------------- | --------------------------------------------------------- |
| engine                     | 33 / 35             | 🟢 strong                                                 |
| core                       | 106 / 143           | 🟢 parsers/runtime strong; lint/slideshow/studio-api gaps |
| producer                   | 45 / 79             | 🔴 render pipeline; **unit tests excluded from CI**       |
| cli                        | 77 / 159            | 🟡 auth solid; top-level commands untested                |
| studio                     | 96 / 319            | 🔴 ~30%; mostly UI/state untested                         |
| sdk                        | 10 / 19             | 🟡 edit engine partly untested                            |
| player                     | 10 / 21             | 🟡 ~half untested                                         |
| aws-lambda / gcp-cloud-run | 10/15, 7/13         | 🟡 SDK funcs tested, infra/entry not                      |
| shader-transitions         | 2 / 7               | 🔴 WebGL/capture core untested                            |

## Structural findings (highest leverage)

### 1. Producer's unit tests never run in CI

`packages/producer` has **45 Vitest `*.test.ts` files**, but:

- its `test` script is the Docker render-regression harness
  (`tsx src/regression-harness.ts`), not Vitest;
- it declares **no `vitest` dependency and no `test:unit` script**;
- every workflow that runs Vitest explicitly excludes it
  (`ci.yml`: `bun run --filter '!@hyperframes/producer' test`;
  `windows-render.yml`: "all packages except producer").

Net effect: pure-logic unit tests for the render pipeline
(`planValidation`, `encodeStage`, `cleanup`, `probeStage`, `htmlCompiler`,
`renderOrchestrator`, …) only run if a developer invokes Vitest by hand. A
regression in any of them lands green.

**Recommended fix:** add `vitest` as a producer devDependency and a
`"test:unit": "vitest run"` script, then add a CI job that runs it. Some
producer suites spawn Chrome/FFmpeg, so the job should scope to the
environment-independent suites (or provide the FFmpeg/Chrome the existing
render jobs already set up) — verify the selected set is green before making
the check required.

### 2. Coverage thresholds exist but never execute

`packages/core/vitest.config.ts` defines v8 coverage with thresholds
(statements 75 / branches 70 / functions 80 / lines 75) — but they only run
via `test:coverage` (`vitest run --coverage`), and **no workflow invokes
it**. CI runs plain `vitest run`. The thresholds are dead, and the scope is
limited to `src/runtime/**` regardless.

No other package has any coverage configuration.

**Recommended fix:** run coverage in CI (start non-blocking, report-only),
broaden core's `include` beyond `src/runtime/**`, and give the other library
packages a `@vitest/coverage-v8` config. Ratchet per-package floors upward as
gaps close rather than setting an aspirational gate on day one.

## Module-level gaps worth prioritizing

- **producer render pipeline** — `renderOrchestrator.ts` (~1.9k LOC) and
  `htmlCompiler.ts` (~1.9k LOC) are the heart of HTML→video and are thinly
  covered; `distributed/plan.ts` planning logic rewards unit tests.
- **cli commands** — `render.ts` (~1.5k LOC), `preview.ts`, `layout.ts`,
  `snapshot.ts`, and the `capture/` pipeline are untested. Extract and test
  the pure arg-parsing / path-resolution logic rather than chasing full e2e.
- **core/lint** — `npx hyperframes lint` is a documented gate yet
  `src/lint/{index,context,utils}.ts` have no direct tests. Rule-based code is
  ideal for fixture-driven table tests. Same for `slideshow/`, `storyboard/`,
  `beats/`, `studio-api/`.
- **sdk edit engine** — `apply-patches.ts`, `cssWriter.ts`, `model.ts` are
  pure data transforms (highest test ROI shape in the repo).
- **studio** — target logic-bearing modules (`hooks/useTimelineEditing.ts`,
  `store/`, `worker/`) over presentational components; the existing
  `studio-load-smoke` job catches crashes but proves no behavior.

## First steps taken on this branch

Added passing unit suites for genuinely untested **pure** modules (43 tests,
all green) as a template for the larger effort:

| File                                               | Module under test                                  |
| -------------------------------------------------- | -------------------------------------------------- |
| `packages/producer/src/utils/semaphore.test.ts`    | async concurrency primitive                        |
| `packages/player/src/shader-options.test.ts`       | shader attr normalization + URL/srcdoc injection   |
| `packages/player/src/playback-state.test.ts`       | runtime state transitions (loop/complete/throttle) |
| `packages/sdk/src/engine/keyframeBackfill.test.ts` | keyframe default backfill                          |
| `packages/sdk/src/engine/variableModel.test.ts`    | composition-variable read/write/clear              |

The two structural fixes (producer CI wiring, coverage-in-CI) are intentionally
**not** applied here — they change shared CI behavior for the whole team and
need a maintainer's call on scope and required-check status.
