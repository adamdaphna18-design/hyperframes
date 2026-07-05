import { Ledger } from "./ledger.js";
import { type AgentKey, type Commitment, agentKeyFromSecret, commit } from "./zkp.js";
import { type Transaction, createTransaction } from "./transaction.js";
import { hexToBigInt, sha256 } from "./hash.js";
import {
  CONTRACT_DEPLOY_ACTION,
  CONTRACT_INVOKE_ACTION,
  contractIdOf,
  deployPayload,
  invokePayload,
  serializeProgram,
} from "./contract.js";
import type { Instruction } from "./vm.js";

/**
 * ButterflyLedger SDK — drop-in instrumentation for AI agents.
 *
 * The core primitive is `wrapTool()`: wrap any async tool function and every
 * call is (1) pre-checked against an on-chain policy contract — a rejected
 * call throws BEFORE the tool executes — and (2) recorded on the ledger with
 * a zero-knowledge authorship proof. Inputs and outputs are stored as SHA-256
 * hashes by default (attest without disclosing); sensitive numeric fields can
 * be Pedersen-committed with the openings returned to the caller for
 * off-chain custody.
 *
 * Framework adapters (e.g. integrations/langchain.ts) are thin layers over
 * this client, so any agent runtime — LangChain, OpenAI tool calling, Claude
 * tool use, bespoke harnesses — integrates the same way.
 */

/** Load an agent key from an environment variable holding the hex secret. */
export function agentKeyFromEnv(name = "AGENT_SECRET"): AgentKey {
  const hex = process.env[name];
  if (!hex) {
    throw new Error(`environment variable ${name} is not set (expected hex agent secret)`);
  }
  return agentKeyFromSecret(hexToBigInt(hex));
}

/** Canonical, stable JSON for hashing arbitrary tool inputs/outputs. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const body = Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${body.join(",")}}`;
}

/** Hash any JSON-serialisable value for on-chain attestation without disclosure. */
export function attestHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

/** Policy binding for a wrapped tool: which contract to consult, with what args. */
export interface ToolPolicy<I> {
  readonly contractId: string;
  /** Map the tool input to the contract's invocation arguments. */
  readonly args: (input: I) => readonly bigint[];
}

export interface RecordToolCallInput {
  readonly tool: string;
  /** Arbitrary tool input; hashed on-chain unless `disclose` is set. */
  readonly input: unknown;
  /** Arbitrary tool output; hashed on-chain unless `disclose` is set. */
  readonly output?: unknown;
  readonly status: "ok" | "error";
  /** Id of the parent invocation (nested agent calls), if any. */
  readonly parentId?: string;
  /** Store raw input/output on-chain instead of hashes. Default false. */
  readonly disclose?: boolean;
  /** Sensitive numeric fields to Pedersen-commit (field → value). */
  readonly confidential?: Record<string, bigint>;
}

export interface RecordedToolCall {
  readonly tx: Transaction;
  /**
   * Openings for the Pedersen commitments in the payload. Custody these
   * off-chain — they are what lets you later prove the committed values.
   */
  readonly openings: Record<string, Commitment>;
}

export interface ButterflyClientOptions {
  readonly ledger: Ledger;
  readonly key: AgentKey;
  /**
   * Timestamp source. Defaults to a logical clock (monotonic counter) so the
   * ledger stays deterministic; pass `() => Date.now()` for wall-clock time.
   */
  readonly clock?: () => number;
}

export class ButterflyClient {
  private readonly ledger: Ledger;
  private readonly key: AgentKey;
  private readonly clock?: () => number;
  private nonce: number;
  private logicalClock: number;

  constructor(options: ButterflyClientOptions) {
    this.ledger = options.ledger;
    this.key = options.key;
    this.clock = options.clock;
    // Resume the per-agent nonce from what is already on-chain + pending, so
    // reconnecting clients never reuse a nonce.
    const mine = (tx: Transaction) => tx.agentId === options.key.publicId;
    const sealed = this.ledger.chain.reduce((n, b) => n + b.transactions.filter(mine).length, 0);
    this.nonce = sealed + this.ledger.mempool.filter(mine).length;
    this.logicalClock = this.nonce;
  }

  /** The agent's public identity on the ledger. */
  get agentId(): string {
    return this.key.publicId;
  }

  private nextTimestamp(): number {
    return this.clock ? this.clock() : ++this.logicalClock;
  }

  /** Record an arbitrary action verb + payload. Low-level escape hatch. */
  recordAction(action: string, payload: string): Transaction {
    const tx = createTransaction(this.key, {
      action,
      payload,
      timestamp: this.nextTimestamp(),
      nonce: this.nonce,
    });
    this.ledger.record(tx); // throws on proof/replay/policy failure
    this.nonce += 1;
    return tx;
  }

  /** Record a tool call with hashed (or committed) inputs and outputs. */
  recordToolCall(call: RecordToolCallInput): RecordedToolCall {
    const openings: Record<string, Commitment> = {};
    const committed: Record<string, string> = {};
    for (const [field, value] of Object.entries(call.confidential ?? {})) {
      const c = commit(value);
      openings[field] = c;
      committed[field] = c.commitment;
    }
    const payload = canonicalJson({
      v: 1,
      tool: call.tool,
      input: call.disclose ? call.input : { sha256: attestHash(call.input) },
      output:
        call.output === undefined
          ? null
          : call.disclose
            ? call.output
            : { sha256: attestHash(call.output) },
      status: call.status,
      parent: call.parentId ?? null,
      committed,
    });
    const tx = this.recordAction("tool.call", payload);
    return { tx, openings };
  }

  /** Deploy a policy contract; returns its on-chain id. */
  deployContract(program: readonly Instruction[]): { id: string; tx: Transaction } {
    const tx = this.recordAction(CONTRACT_DEPLOY_ACTION, deployPayload(program));
    return { id: contractIdOf(serializeProgram(program)), tx };
  }

  /** Invoke a policy contract. Throws when the policy rejects. */
  invokeContract(contractId: string, args: readonly bigint[]): Transaction {
    return this.recordAction(CONTRACT_INVOKE_ACTION, invokePayload(contractId, args));
  }

  /**
   * Wrap an async tool so every call is policy-checked *before* execution and
   * recorded on the ledger after it. If the policy contract rejects, the tool
   * never runs — enforcement, not just observation. Tool failures are also
   * recorded (status "error") before the error is rethrown.
   */
  wrapTool<I, O>(
    tool: string,
    fn: (input: I) => Promise<O>,
    options: { policy?: ToolPolicy<I>; parentId?: string; disclose?: boolean } = {},
  ): (input: I) => Promise<O> {
    return async (input: I): Promise<O> => {
      if (options.policy) {
        // Throws on rejection: the violation is blocked, not merely logged.
        this.invokeContract(options.policy.contractId, options.policy.args(input));
      }
      try {
        const output = await fn(input);
        this.recordToolCall({
          tool,
          input,
          output,
          status: "ok",
          parentId: options.parentId,
          disclose: options.disclose,
        });
        return output;
      } catch (error) {
        this.recordToolCall({
          tool,
          input,
          output: { error: error instanceof Error ? error.message : String(error) },
          status: "error",
          parentId: options.parentId,
          disclose: options.disclose,
        });
        throw error;
      }
    };
  }
}
