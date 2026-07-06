/**
 * Fix Engine — queue logic.
 *
 * The board flows inbox → in_progress → done. Two hard rules from the spec:
 *  - `pull()` is what the *agent* calls: it claims every inbox card into
 *    in_progress in one shot and returns them to be worked.
 *  - Only a **human** may move a card to `done`. The agent reports on a card
 *    but never marks it complete — that gate stays with you.
 *
 * All logic is storage-agnostic and clock-injected (no `Date.now()` inside),
 * so it is deterministic under test.
 */
import type { QueueStore } from "./store.ts";
import type { Actor, CardStatus, ContextPackage, FixCard, QueueState } from "./types.ts";

export interface FixQueueOptions {
  store: QueueStore;
  /** Injectable clock; defaults to `Date.now`. Tests pin it. */
  now?: () => number;
}

export class FixQueue {
  #store: QueueStore;
  #now: () => number;

  constructor(opts: FixQueueOptions) {
    this.#store = opts.store;
    this.#now = opts.now ?? (() => Date.now());
  }

  /** Add a card from an Alt+click capture. Lands in `inbox`. */
  async add(note: string, context: ContextPackage): Promise<FixCard> {
    const trimmed = note.trim();
    if (!trimmed) throw new Error("fix note is empty");

    const state = await this.#store.read();
    const seq = state.seq + 1;
    const ts = this.#now();
    const card: FixCard = {
      id: `fix_${seq}`,
      note: trimmed,
      context,
      status: "inbox",
      createdAt: ts,
      updatedAt: ts,
    };
    state.cards.push(card);
    state.seq = seq;
    await this.#store.write(state);
    return card;
  }

  /** All cards, optionally filtered by column. */
  async list(status?: CardStatus): Promise<FixCard[]> {
    const state = await this.#store.read();
    return status ? state.cards.filter((c) => c.status === status) : state.cards;
  }

  /**
   * Agent claim: move every `inbox` card to `in_progress` and return the batch
   * to work through. Cards already in progress are NOT re-returned, so a second
   * `pull()` after a crash won't double-process.
   */
  async pull(): Promise<FixCard[]> {
    const state = await this.#store.read();
    const ts = this.#now();
    const claimed: FixCard[] = [];
    for (const card of state.cards) {
      if (card.status === "inbox") {
        card.status = "in_progress";
        card.updatedAt = ts;
        claimed.push(card);
      }
    }
    if (claimed.length > 0) await this.#store.write(state);
    return claimed;
  }

  /**
   * Agent report: attach the per-card outcome. The card stays `in_progress` —
   * reporting is not completing. A human closes it out.
   */
  async report(id: string, report: string): Promise<FixCard> {
    const state = await this.#store.read();
    const card = state.cards.find((c) => c.id === id);
    if (!card) throw new Error(`no card ${id}`);
    card.report = report;
    card.updatedAt = this.#now();
    await this.#store.write(state);
    return card;
  }

  /**
   * Move a card between columns. Guardrail: only `actor: "human"` may set
   * `done`. An agent attempting to self-complete is rejected — the completion
   * gate is yours.
   */
  async move(id: string, status: CardStatus, actor: Actor): Promise<FixCard> {
    if (status === "done" && actor !== "human") {
      throw new Error(`only a human may move ${id} to done`);
    }
    const state = await this.#store.read();
    const card = state.cards.find((c) => c.id === id);
    if (!card) throw new Error(`no card ${id}`);
    card.status = status;
    card.updatedAt = this.#now();
    await this.#store.write(state);
    return card;
  }

  /** Column counts, for the badge and the CLI status line. */
  async summary(): Promise<Record<CardStatus, number>> {
    const state: QueueState = await this.#store.read();
    const counts: Record<CardStatus, number> = { inbox: 0, in_progress: 0, done: 0 };
    for (const c of state.cards) counts[c.status]++;
    return counts;
  }
}
