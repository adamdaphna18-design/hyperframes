/**
 * Fix Engine — types.
 *
 * A dev-time "fix queue" for any web app: Alt+click an element, write one line,
 * and a card lands in a Kanban board carrying a machine-readable *context
 * package* — enough for an agent to know exactly what you're pointing at and
 * which source file to touch, without paying an expensive discovery round-trip.
 */

/** Board columns. `inbox` → `in_progress` → `done`. */
export type CardStatus = "inbox" | "in_progress" | "done";

/** Who is acting on a card. Only a human may move a card to `done`. */
export type Actor = "human" | "agent";

/**
 * The environment captured at Alt+click time — aimed at the model, not at a
 * human. The goal: pin the exact element AND its source so the agent skips the
 * grep/read discovery loop entirely.
 */
export interface ContextPackage {
  /** `location.pathname + hash` at capture time. */
  route: string;
  /** Active sub-tab / panel, if the overlay could infer one. */
  tabState?: string;
  /** CSS-selector chain from the nearest tagged container down to the target. */
  selectorChain: string[];
  /** Best single selector for the clicked element. */
  anchor: string;
  /** Element tag name (lowercased). */
  tag: string;
  /** Trimmed visible text in/around the element (truncated). */
  nearbyText: string;
  /** Viewport rect of the element at capture time. */
  rect: { x: number; y: number; w: number; h: number };
  /** `data-area` of the nearest tagged container, if present. */
  area?: string;
  /**
   * Source file the element belongs to — from a `data-src` / `data-source`
   * tag on the nearest tagged container (or a build-time injector). Absent when
   * nothing is tagged; the agent then falls back to `route` + `nearbyText`.
   */
  sourceFile?: string;
  /** Capture timestamp (client clock). */
  ts: number;
}

/** A single fix request on the board. */
export interface FixCard {
  /** `fix_<seq>` — stable, monotonic per queue. */
  id: string;
  /** The one-line note the user typed. */
  note: string;
  context: ContextPackage;
  status: CardStatus;
  createdAt: number;
  updatedAt: number;
  /** The agent's per-card report, written when it processes the card. */
  report?: string;
}

/** Persisted queue state. */
export interface QueueState {
  cards: FixCard[];
  /** Monotonic counter for id assignment. */
  seq: number;
}

export const EMPTY_STATE: QueueState = { cards: [], seq: 0 };
