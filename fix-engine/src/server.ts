/**
 * Fix Engine — local dev server.
 *
 * Serves the browser overlay + Kanban board and exposes the queue over a tiny
 * JSON API. Dependency-free (`node:http`). Gated by a config flag so the whole
 * thing is inert when disabled — flip `enabled: false` in the config file (or
 * set `FIX_ENGINE_ENABLED=0`) and the overlay no-ops and the API returns 503.
 *
 * Run: `bun run src/server.ts`  (or via the `serve` script)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FixQueue } from "./queue.ts";
import { JsonFileStore } from "./store.ts";
import type { Actor, CardStatus } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

export interface ServerConfig {
  enabled: boolean;
  port: number;
  /** Path to the JSON queue file. */
  queuePath: string;
}

export function loadConfig(): ServerConfig {
  const envEnabled = process.env.FIX_ENGINE_ENABLED;
  return {
    enabled: envEnabled ? envEnabled !== "0" : true,
    port: Number(process.env.FIX_ENGINE_PORT ?? 4599),
    queuePath: process.env.FIX_ENGINE_QUEUE ?? join(ROOT, "queue.json"),
  };
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function serveFile(res: ServerResponse, path: string, type: string) {
  try {
    const buf = await readFile(path);
    res.writeHead(200, { "content-type": type });
    res.end(buf);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

export function createFixServer(config: ServerConfig) {
  const queue = new FixQueue({ store: new JsonFileStore(config.queuePath) });

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
    const { pathname } = url;

    if (req.method === "OPTIONS") return send(res, 204, "");

    // Kill switch: overlay no-ops, API refuses.
    if (!config.enabled) {
      if (pathname === "/fix-engine.js") {
        return serveFile(res, join(ROOT, "client", "fix-engine.disabled.js"), "text/javascript");
      }
      return send(res, 503, { error: "fix engine disabled" });
    }

    try {
      if (pathname === "/" || pathname === "/kanban") {
        return serveFile(res, join(ROOT, "client", "kanban.html"), "text/html");
      }
      if (pathname === "/fix-engine.js") {
        return serveFile(res, join(ROOT, "client", "fix-engine.js"), "text/javascript");
      }
      if (pathname === "/api/queue" && req.method === "GET") {
        const status = url.searchParams.get("status") as CardStatus | null;
        return send(res, 200, await queue.list(status ?? undefined));
      }
      if (pathname === "/api/summary" && req.method === "GET") {
        return send(res, 200, await queue.summary());
      }
      if (pathname === "/api/fix" && req.method === "POST") {
        const body = await readJson(req);
        const card = await queue.add(String(body.note ?? ""), body.context as never);
        return send(res, 201, card);
      }
      if (pathname === "/api/pull" && req.method === "POST") {
        return send(res, 200, await queue.pull());
      }
      if (pathname === "/api/report" && req.method === "POST") {
        const body = await readJson(req);
        return send(res, 200, await queue.report(String(body.id), String(body.report ?? "")));
      }
      if (pathname === "/api/move" && req.method === "POST") {
        const body = await readJson(req);
        const card = await queue.move(
          String(body.id),
          String(body.status) as CardStatus,
          String(body.actor ?? "agent") as Actor,
        );
        return send(res, 200, card);
      }
      return send(res, 404, { error: "not found" });
    } catch (err) {
      send(res, 400, { error: (err as Error).message });
    }
  });
}

// Entrypoint when run directly.
if (import.meta.main) {
  const config = loadConfig();
  if (!config.enabled) {
    console.log("[fix-engine] disabled (FIX_ENGINE_ENABLED=0) — serving no-op overlay");
  }
  createFixServer(config).listen(config.port, () => {
    console.log(`[fix-engine] http://localhost:${config.port}  queue=${config.queuePath}`);
  });
}
