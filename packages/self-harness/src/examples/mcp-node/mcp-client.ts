/**
 * A real MCP streamable-http client — the deep half of the growth engine. Where the
 * registry scan reads metadata, this connects to a server, runs the protocol
 * handshake (`initialize` → `notifications/initialized` → `tools/list`), and returns
 * the server's actual tool schemas. It's genuinely functional against any open MCP
 * endpoint; inside a locked-down network the calls 403 and the deep scan reports true
 * coverage rather than faking it. `fetch` is injectable for tests and proxy-aware
 * dispatchers.
 */

/** MCP tool annotations (2025 spec): behavioral hints the reliability scan reads. */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

/** A JSON Schema property as it appears in a tool's `inputSchema`. */
export interface JsonSchemaProp {
  type?: string;
  format?: string;
  enum?: unknown[];
  pattern?: string;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

/** One tool as returned by `tools/list`. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
}

/** Anything that can list a server's tools — an {@link McpClient} live, or a fixture. */
export interface ToolSource {
  listTools(url: string): Promise<McpTool[]>;
}

interface JsonRpcResponse {
  result?: { tools?: McpTool[] };
  error?: { message?: string };
}

const PROTOCOL_VERSION = "2025-06-18";

export class McpClient implements ToolSource {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  /** Run the handshake and return the server's tools. Throws on transport/protocol error. */
  async listTools(url: string): Promise<McpTool[]> {
    const init = await this.rpc(url, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "reliability-scan", version: "0.1" },
      },
    });
    const session = init.sessionId;
    await this.notify(url, session);
    const listed = await this.rpc(url, session, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    if (listed.message.error) throw new Error(listed.message.error.message ?? "tools/list error");
    return listed.message.result?.tools ?? [];
  }

  private headers(session: string | undefined): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (session) h["Mcp-Session-Id"] = session;
    return h;
  }

  private async rpc(
    url: string,
    session: string | undefined,
    body: unknown,
  ): Promise<{ message: JsonRpcResponse; sessionId: string | undefined }> {
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers(session),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`mcp ${res.status}`);
    const sessionId = res.headers.get("mcp-session-id") ?? session;
    const message = await readMessage(res);
    return { message, sessionId };
  }

  private async notify(url: string, session: string | undefined): Promise<void> {
    await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers(session),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
  }
}

/** Parse a JSON-RPC message from either a plain JSON body or an SSE (`data:`) stream. */
async function readMessage(res: Response): Promise<JsonRpcResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (contentType.includes("text/event-stream")) {
    const data = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    return data ? (JSON.parse(data) as JsonRpcResponse) : {};
  }
  return text ? (JSON.parse(text) as JsonRpcResponse) : {};
}

/** An offline {@link ToolSource} backed by fixed tool lists — for demos and tests. */
export class FixtureToolSource implements ToolSource {
  private readonly byUrl: Record<string, McpTool[]>;

  constructor(byUrl: Record<string, McpTool[]>) {
    this.byUrl = byUrl;
  }

  async listTools(url: string): Promise<McpTool[]> {
    const tools = this.byUrl[url];
    if (!tools) throw new Error(`no fixture for ${url}`);
    return tools;
  }
}
