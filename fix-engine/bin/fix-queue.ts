#!/usr/bin/env bun
/**
 * Fix Engine — agent CLI. Drives the queue straight off `queue.json`, so an
 * agent (e.g. Claude Code) can process the board from the terminal without the
 * HTTP server running. This is what the "fix" trigger runs under the hood.
 *
 *   bun run bin/fix-queue.ts status              # column counts
 *   bun run bin/fix-queue.ts pull                # claim inbox → in_progress, print JSON
 *   bun run bin/fix-queue.ts list [status]       # print cards (optionally filtered)
 *   bun run bin/fix-queue.ts report <id> <text>  # attach a per-card report
 *
 * Note: there is no `done` verb — only a human closes a card (from the board).
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { FixQueue } from "../src/queue.ts";
import { JsonFileStore } from "../src/store.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const queuePath = process.env.FIX_ENGINE_QUEUE ?? join(ROOT, "queue.json");
const queue = new FixQueue({ store: new JsonFileStore(queuePath) });

const [cmd, ...args] = process.argv.slice(2);

function out(v: unknown) {
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
}

switch (cmd) {
  case "status": {
    out(await queue.summary());
    break;
  }
  case "pull": {
    const claimed = await queue.pull();
    out(claimed);
    if (claimed.length === 0) console.error("(inbox empty — nothing to pull)");
    break;
  }
  case "list": {
    out(await queue.list(args[0] as never));
    break;
  }
  case "report": {
    const [id, ...rest] = args;
    if (!id || rest.length === 0) {
      console.error("usage: fix-queue report <id> <text>");
      process.exit(1);
    }
    out(await queue.report(id, rest.join(" ")));
    break;
  }
  default:
    console.error("usage: fix-queue <status|pull|list|report>");
    process.exit(1);
}
