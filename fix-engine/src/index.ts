/**
 * Fix Engine — a dev-time click-to-fix queue for any web app.
 *
 * Alt+click an element → write one line → a card lands on a Kanban board with a
 * machine-readable *context package* (route, tab, selector chain, nearby text,
 * rect, and — when tagged — the source file). An agent pulls the queue, fixes
 * each card, and reports back; only you move a card to done.
 *
 * This module is the storage + queue core. The browser overlay lives in
 * `client/fix-engine.js`, the HTTP server in `src/server.ts`, and the agent CLI
 * in `bin/fix-queue.ts`.
 */
export { FixQueue, type FixQueueOptions } from "./queue.ts";
export { JsonFileStore, MemoryStore, type QueueStore } from "./store.ts";
export {
  EMPTY_STATE,
  type Actor,
  type CardStatus,
  type ContextPackage,
  type FixCard,
  type QueueState,
} from "./types.ts";
