# Fix Engine

A dev-time **click-to-fix queue** for any web app. Alt+click an element, write
one line, and a card lands on a Kanban board carrying a **machine-readable
context package** — enough for an agent to know exactly what you pointed at and
which file to touch, without paying an expensive code-discovery round-trip.

Then you say **"fix"** once, and the agent walks the queue, fixes each card, and
reports back. **Only you** move a card to Done.

- **Kills the ping-pong.** No more "the red button in tab X, above sector Y —
  no, worse, go back." You point; the exact element + context is captured.
- **Saves tokens.** Describing a location in words forces the model to grep and
  read files just to find *where* you mean. Here you pin the file/area directly,
  so the discovery loop is skipped — and the saving compounds over hundreds of
  fixes.
- **Batches the backlog.** Twenty "later I'll ask for X" notes stop living in
  your head. File them as you notice them; process them in one pass.

## How it works

```
Alt+click element ──▶ context package ──▶ queue.json ──▶ Kanban board
                                                              │
                    you say "fix" ──▶ agent pulls ──▶ fixes ──┘──▶ reports back
                                                              │
                                          only you move a card ▶ Done
```

The **context package** captures the whole environment, not just "what I
clicked": the route + active sub-tab, the selector chain down to the element,
nearby text, position/size, and — when you tag containers — the source file.

## Setup (2 steps)

**1. Run the dev server** (from `fix-engine/`):

```bash
bun run src/server.ts     # → http://localhost:4599  (board + overlay + API)
```

**2. Drop the overlay into your app** (dev builds only):

```html
<script>window.FIX_ENGINE = { endpoint: "http://localhost:4599" };</script>
<script src="http://localhost:4599/fix-engine.js" defer></script>
```

Now Alt+click any element, type a line, hit Enter. Open the board at
`http://localhost:4599`.

### One-time tagging for pinpoint file targeting (recommended)

Tag your **big containers** once so every capture inside them resolves straight
to a file — no search round-trip:

```html
<section data-area="dashboard/inbox" data-src="src/views/Inbox.tsx"> … </section>
```

Where nothing is tagged, capture falls back to route + nearby text (still
useful, just less precise). A build-time injector that stamps
`data-source="file:line"` works too — the overlay reads that as well.

## Processing the queue

Say **"fix"** to your agent. Under the hood it runs the CLI:

```bash
bun run bin/fix-queue.ts status              # column counts
bun run bin/fix-queue.ts pull                # claim inbox → in_progress, print JSON
bun run bin/fix-queue.ts report <id> <text>  # attach a per-card report
```

There is **no `done` verb** — the completion gate is yours (move cards on the
board). See [`CLAUDE-FIX.md`](./CLAUDE-FIX.md) for the exact agent contract.

## Kill switch

Set `FIX_ENGINE_ENABLED=0` (or `enabled: false`) and the overlay serves a no-op
and the API returns 503 — the scaffold goes inert without touching your app.

## Design notes

- **Framework-agnostic.** The overlay is plain JS with no build step; works with
  React, Vue, Svelte, or vanilla.
- **JSON, not a DB.** The whole queue is one `queue.json` file (gitignored), so
  the scaffold lifts out in one move when you're done.
- **Completion gate is human-only.** The agent reports but never self-completes
  — enforced in the queue logic *and* the HTTP layer (an agent `done` is a 400).
- **Deterministic core.** Queue logic is storage-agnostic and clock-injected; 12
  passing tests cover capture, agent pull (no double-processing), the report
  flow, and the human-only-Done guard.

## Develop

```bash
bun install
bun test          # 12 tests
bun run typecheck # tsc --noEmit, strict
bun run serve     # dev server
```

## Layout

```
src/       types · store (JSON file + in-memory) · queue logic · HTTP server
client/    fix-engine.js (overlay) · fix-engine.disabled.js (kill switch) · kanban.html
bin/       fix-queue.ts (agent CLI)
test/      queue.test.ts
CLAUDE-FIX.md   the "fix" trigger contract for the agent
```
