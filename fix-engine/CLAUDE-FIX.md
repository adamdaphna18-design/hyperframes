# The "fix" trigger — agent contract

When the user says **"fix"** (or "תיקון"), process the fix queue. This file is
the contract; follow it exactly.

## Loop

1. **Claim the queue.** Run `bun run bin/fix-queue.ts pull` (from `fix-engine/`).
   This moves every `inbox` card to `in_progress` and prints them as JSON.
   If it prints `[]`, there's nothing to do — say so and stop.
2. **For each claimed card**, use its `context` package to go straight to the
   code — do **not** grep/search to rediscover the location:
   - `context.sourceFile` → the file to open (when present).
   - `context.area` → logical area, if `sourceFile` is absent.
   - `context.selectorChain` + `context.anchor` → the exact element.
   - `context.route` + `context.tabState` + `context.nearbyText` → the screen
     and surrounding text, for when nothing is tagged (fallback only).
3. **Make the fix**, then record what you did:
   `bun run bin/fix-queue.ts report <id> "<one-paragraph summary>"`.
   The card stays `in_progress`.
4. **Ambiguous card?** Do **not** guess. Report your question instead
   (`report <id> "QUESTION: ..."`) and leave it for the human.

## Hard rules

- **Never move a card to `done`.** That gate is the human's. The API and CLI
  both refuse an agent `done` — don't try to work around it.
- **One card = one focused change.** Don't bundle unrelated edits.
- **Report every card you touch**, including ones you couldn't complete.
- When finished, print a short roll-up: N fixed, M questions, and let the user
  review the board and close cards themselves.

## Queue schema (`queue.json`)

```jsonc
{
  "seq": 3,                 // monotonic id counter
  "cards": [
    {
      "id": "fix_3",
      "note": "bell badge should show a count",
      "status": "inbox",    // inbox | in_progress | done
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000,
      "report": "…",        // set by you via `report`
      "context": {
        "route": "/dashboard#inbox",
        "tabState": "Notifications",
        "selectorChain": ["section#inbox", "button.bell"],
        "anchor": "button.bell",
        "tag": "button",
        "nearbyText": "Enable alerts for window X",
        "rect": { "x": 120, "y": 340, "w": 32, "h": 32 },
        "area": "dashboard/inbox",
        "sourceFile": "src/views/Inbox.tsx",
        "ts": 1700000000000
      }
    }
  ]
}
```
