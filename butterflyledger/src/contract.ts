import { sha256Fields } from "./hash.js";
import { type Instruction, execute, isOpCode, validateProgram } from "./vm.js";

/**
 * Smart-contract layer.
 *
 * A ButterflyLedger contract is a deterministic policy program (vm.ts)
 * deployed *as a transaction*: the program itself lives on-chain, its id is
 * the SHA-256 of its canonical serialisation, and its state transitions are
 * re-executed by every validator. Each block header commits to the **state
 * root** — a SHA-256 over all contract programs and their state after the
 * block — so contract state enjoys the same butterfly-cascade protection as
 * the transactions themselves: forge one stored counter and every downstream
 * block hash diverges.
 *
 * Lifecycle:
 *   deploy  → tx { action: "contract.deploy",  payload: serialised program }
 *   invoke  → tx { action: "contract.invoke",  payload: {contract, args} }
 *
 * Invocations are executed at `record()` ingress (policy enforcement: a
 * rejected action never enters the mempool) and re-executed during
 * `validate()` (verifiability: the sealed state root must be reproducible).
 */

export const CONTRACT_DEPLOY_ACTION = "contract.deploy";
export const CONTRACT_INVOKE_ACTION = "contract.invoke";

/** Canonical serialisation of a program: op/arg pairs only, in order. */
export function serializeProgram(program: readonly Instruction[]): string {
  return JSON.stringify(
    program.map((i) => (i.arg === undefined ? { op: i.op } : { op: i.op, arg: i.arg })),
  );
}

/** A contract's id is the domain-separated SHA-256 of its serialised program. */
export function contractIdOf(serialized: string): string {
  return sha256Fields("butterflyledger/contract/v1", [serialized]);
}

/** Transaction payload for deploying `program`. */
export function deployPayload(program: readonly Instruction[]): string {
  return serializeProgram(program);
}

/** Transaction payload for invoking contract `id` with numeric `args`. */
export function invokePayload(id: string, args: readonly bigint[]): string {
  return JSON.stringify({ contract: id, args: args.map((a) => a.toString()) });
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Parse and statically validate a deploy payload. */
export function parseProgram(payload: string): { program: Instruction[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { error: "deploy payload is not valid JSON" };
  }
  if (!Array.isArray(raw)) return { error: "deploy payload must be an instruction array" };
  const program: Instruction[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.op !== "string" || !isOpCode(item.op)) {
      return { error: "malformed instruction in deploy payload" };
    }
    if (item.arg !== undefined && typeof item.arg !== "string") {
      return { error: "instruction arg must be a string" };
    }
    program.push({ op: item.op, arg: item.arg });
  }
  const problem = validateProgram(program);
  if (problem) return { error: problem };
  return { program };
}

/** Parse an invoke payload into a contract id and bigint arguments. */
export function parseInvocation(
  payload: string,
): { contract: string; args: bigint[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { error: "invoke payload is not valid JSON" };
  }
  if (!isRecord(raw) || typeof raw.contract !== "string" || !Array.isArray(raw.args)) {
    return { error: "invoke payload must be {contract, args}" };
  }
  const args: bigint[] = [];
  for (const a of raw.args) {
    if (typeof a !== "string") return { error: "invoke args must be decimal strings" };
    try {
      args.push(BigInt(a));
    } catch {
      return { error: `invoke arg is not an integer: ${a}` };
    }
  }
  return { contract: raw.contract, args };
}

/** Minimal view of a transaction the engine needs (action + payload). */
export interface ContractTxView {
  readonly action: string;
  readonly payload: string;
}

export type ApplyResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

interface ContractAccount {
  readonly serialized: string;
  readonly program: readonly Instruction[];
  state: Map<string, bigint>;
}

/**
 * The contract state machine. One instance tracks the registry and state of
 * every deployed contract; `apply()` advances it one transaction at a time.
 * Applying the same transactions in the same order always produces the same
 * state root — that determinism is what lets validators re-derive it.
 */
export class ContractEngine {
  private readonly accounts = new Map<string, ContractAccount>();

  /** Advance the state machine by one transaction. Non-contract actions are no-ops. */
  apply(tx: ContractTxView): ApplyResult {
    if (tx.action === CONTRACT_DEPLOY_ACTION) {
      const parsed = parseProgram(tx.payload);
      if ("error" in parsed) return { ok: false, error: parsed.error };
      const serialized = serializeProgram(parsed.program);
      const id = contractIdOf(serialized);
      if (this.accounts.has(id)) return { ok: false, error: `contract ${id} already deployed` };
      this.accounts.set(id, { serialized, program: parsed.program, state: new Map() });
      return { ok: true };
    }
    if (tx.action === CONTRACT_INVOKE_ACTION) {
      const parsed = parseInvocation(tx.payload);
      if ("error" in parsed) return { ok: false, error: parsed.error };
      const account = this.accounts.get(parsed.contract);
      if (!account) return { ok: false, error: `unknown contract ${parsed.contract}` };
      const result = execute(account.program, account.state, parsed.args);
      if (!result.accepted) {
        return { ok: false, error: result.error ?? "contract rejected the action" };
      }
      account.state = result.state;
      return { ok: true };
    }
    return { ok: true }; // plain agent actions are not contract-governed
  }

  /** SHA-256 commitment to every deployed program and its current state. */
  stateRoot(): string {
    const ids = [...this.accounts.keys()].sort();
    const roots = ids.map((id) => {
      const account = this.accounts.get(id)!;
      const entries = [...account.state.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
      return sha256Fields("butterflyledger/contract-state/v1", [
        id,
        account.serialized,
        ...entries.flatMap(([k, v]) => [k, v.toString()]),
      ]);
    });
    return sha256Fields("butterflyledger/state/v1", roots);
  }

  /** Deep copy, for speculative (mempool) execution ahead of sealing. */
  clone(): ContractEngine {
    const copy = new ContractEngine();
    for (const [id, account] of this.accounts) {
      copy.accounts.set(id, {
        serialized: account.serialized,
        program: account.program,
        state: new Map(account.state),
      });
    }
    return copy;
  }

  /** Inspect a contract's current state (decimal strings), if deployed. */
  inspect(id: string): { id: string; state: Record<string, string> } | undefined {
    const account = this.accounts.get(id);
    if (!account) return undefined;
    const state: Record<string, string> = {};
    for (const [k, v] of [...account.state.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      state[k] = v.toString();
    }
    return { id, state };
  }

  /** All deployed contract ids. */
  list(): string[] {
    return [...this.accounts.keys()].sort();
  }
}

/** State root of a chain with no contracts — the genesis state commitment. */
export const EMPTY_STATE_ROOT = new ContractEngine().stateRoot();
