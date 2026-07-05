import type { ButterflyClient, ToolPolicy } from "../sdk.js";

/**
 * LangChain.js integration: a callback handler that records every tool call
 * (and chain run) on the ButterflyLedger, with optional pre-execution policy
 * enforcement via on-chain contracts.
 *
 * Deliberately dependency-free: this class implements the LangChain
 * `CallbackHandlerMethods` surface structurally (handleToolStart /
 * handleToolEnd / handleToolError / handleChainStart / handleChainEnd), so it
 * plugs into `callbacks: [handler]` on any LangChain runnable without pinning
 * this package to a LangChain version. The same shape works for other
 * frameworks that expose start/end/error tool hooks — adapt by delegating to
 * these three methods.
 *
 *   const handler = new ButterflyCallbackHandler({
 *     client,
 *     policies: { transfer_funds: { contractId, args: (input) => [BigInt(...)] } },
 *   });
 *   const agent = new AgentExecutor({ tools, callbacks: [handler] });
 *
 * Policy semantics: `handleToolStart` runs the tool's policy contract BEFORE
 * the tool executes. A rejection throws, which LangChain surfaces as a tool
 * error — the violating call is blocked and the rejection itself is the
 * ledger record. Splunk tells you what happened; this refuses to let it
 * happen.
 */

/** Minimal structural view of LangChain's serialised tool descriptor. */
export interface SerializedToolView {
  readonly name?: string;
  readonly id?: readonly string[];
}

export interface ButterflyCallbackHandlerOptions {
  readonly client: ButterflyClient;
  /** Per-tool policy contracts, keyed by tool name. Input is the raw tool input string. */
  readonly policies?: Record<string, ToolPolicy<string>>;
  /** Store raw inputs/outputs on-chain instead of SHA-256 hashes. Default false. */
  readonly disclose?: boolean;
}

interface RunState {
  readonly tool: string;
  readonly input: string;
  readonly parentRunId?: string;
}

export class ButterflyCallbackHandler {
  /** LangChain identifies handlers by name; also used for de-duplication. */
  readonly name = "butterflyledger_callback_handler";
  /** Matches BaseCallbackHandler's flag so LangChain awaits our handlers. */
  readonly awaitHandlers = true;

  private readonly client: ButterflyClient;
  private readonly policies: Record<string, ToolPolicy<string>>;
  private readonly disclose: boolean;
  private readonly runs = new Map<string, RunState>();
  /** runId → ledger transaction id, so nested calls can reference parents. */
  private readonly recordedTx = new Map<string, string>();

  constructor(options: ButterflyCallbackHandlerOptions) {
    this.client = options.client;
    this.policies = options.policies ?? {};
    this.disclose = options.disclose ?? false;
  }

  private toolName(tool: SerializedToolView): string {
    return tool.name ?? tool.id?.[tool.id.length - 1] ?? "unknown_tool";
  }

  /**
   * Called by LangChain before a tool executes. Enforces the tool's policy
   * contract, if one is registered — a rejection throws and blocks the call.
   */
  async handleToolStart(
    tool: SerializedToolView,
    input: string,
    runId: string,
    parentRunId?: string,
  ): Promise<void> {
    const name = this.toolName(tool);
    this.runs.set(runId, { tool: name, input, parentRunId });
    const policy = this.policies[name];
    if (policy) {
      // Throws on policy rejection → LangChain aborts the tool call.
      this.client.invokeContract(policy.contractId, policy.args(input));
    }
  }

  /** Called by LangChain after a tool succeeds: record the full call. */
  async handleToolEnd(output: unknown, runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.delete(runId);
    const parentId = run.parentRunId ? this.recordedTx.get(run.parentRunId) : undefined;
    const { tx } = this.client.recordToolCall({
      tool: run.tool,
      input: run.input,
      output,
      status: "ok",
      parentId,
      disclose: this.disclose,
    });
    this.recordedTx.set(runId, tx.id);
  }

  /** Called by LangChain when a tool throws: the failure is part of the record. */
  async handleToolError(error: unknown, runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.delete(runId);
    const parentId = run.parentRunId ? this.recordedTx.get(run.parentRunId) : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const { tx } = this.client.recordToolCall({
      tool: run.tool,
      input: run.input,
      output: { error: message },
      status: "error",
      parentId,
      disclose: this.disclose,
    });
    this.recordedTx.set(runId, tx.id);
  }

  /** Chain/agent runs are recorded as scoping actions so tool calls can nest. */
  async handleChainStart(chain: SerializedToolView, inputs: unknown, runId: string): Promise<void> {
    const { tx } = this.client.recordToolCall({
      tool: `chain:${this.toolName(chain)}`,
      input: inputs,
      status: "ok",
      disclose: this.disclose,
    });
    this.recordedTx.set(runId, tx.id);
  }

  async handleChainEnd(_outputs: unknown, runId: string): Promise<void> {
    // The chain-start record is the scope anchor; nothing further to write.
    this.runs.delete(runId);
  }
}
