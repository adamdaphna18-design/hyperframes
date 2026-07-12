/**
 * The "sources" layer of the company brain — what was *said*: calls, chats,
 * docs, transcripts. In the real system these are markdown files in a
 * `sources/` folder; here they are a deterministic in-repo seed so the whole
 * pipeline (ingest → brain → orchestrated agents → write-back) runs offline.
 * A real drop-in reads the same `Source` shape from disk.
 */
export type SourceKind = "call" | "chat" | "doc" | "transcript";

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  text: string;
  /** Verticals this source informs — seeds the brain's tags and cross-links. */
  verticals: string[];
}

export const SEED_SOURCES: Source[] = [
  {
    id: "call-q3-growth",
    kind: "call",
    title: "Q3 growth sync",
    text: "Organic traffic is flat; we rank for brand terms but miss high-intent keywords.",
    verticals: ["seo", "content"],
  },
  {
    id: "chat-brand-voice",
    kind: "chat",
    title: "Brand voice thread",
    text: "Keep copy plain and human. No keyword stuffing — it reads as spam and erodes trust.",
    verticals: ["content", "seo"],
  },
  {
    id: "doc-pr-playbook",
    kind: "doc",
    title: "PR playbook",
    text: "Pitches land when they lead with a concrete proof point, not adjectives.",
    verticals: ["pr"],
  },
  {
    id: "transcript-paid-review",
    kind: "transcript",
    title: "Paid media review",
    text: "CAC crept above target. Cap spend to keep CAC under a third of LTV.",
    verticals: ["paid"],
  },
  {
    id: "doc-cro-notes",
    kind: "doc",
    title: "CRO experiment notes",
    text: "Test one change at a time so a lift can be attributed to a single cause.",
    verticals: ["cro"],
  },
  {
    id: "chat-content-calendar",
    kind: "chat",
    title: "Content calendar",
    text: "Engagement holds when articles answer a real question in the reader's words.",
    verticals: ["content"],
  },
];
