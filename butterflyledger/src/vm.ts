/**
 * Deterministic stack VM for ButterflyLedger smart contracts.
 *
 * Contracts on an audit ledger are *policy programs*: they decide whether an
 * agent action is allowed and update on-chain state (counters, budgets,
 * quotas). The execution model is therefore deliberately tiny and totally
 * deterministic — no floats, no host calls, no clock, no randomness — so that
 * every validator replays the exact same state transition, and the state root
 * committed in each block header (see contract.ts) is reproducible forever.
 *
 * Gas metering bounds every invocation, so a malicious or buggy program can
 * never stall sealing or validation.
 */

export type OpCode =
  | "PUSH" // push literal (arg: decimal bigint)
  | "POP" // discard top
  | "DUP" // duplicate top
  | "ADD" // a b → a+b
  | "SUB" // a b → a−b
  | "MUL" // a b → a·b
  | "DIV" // a b → a/b (integer; b=0 traps)
  | "MOD" // a b → a mod b (b=0 traps)
  | "LT" // a b → a<b ? 1 : 0
  | "GT" // a b → a>b ? 1 : 0
  | "EQ" // a b → a==b ? 1 : 0
  | "NOT" // a → a==0 ? 1 : 0
  | "AND" // a b → (a≠0 && b≠0) ? 1 : 0
  | "OR" // a b → (a≠0 || b≠0) ? 1 : 0
  | "JMP" // unconditional jump (arg: instruction index)
  | "JZ" // pop; jump if zero (arg: instruction index)
  | "LOAD" // push state[arg] (0 if unset)
  | "STORE" // pop → state[arg]
  | "ARG" // push invocation argument #arg
  | "HALT" // pop; nonzero ⇒ accept, zero ⇒ reject
  | "REJECT"; // reject immediately

export interface Instruction {
  readonly op: OpCode;
  /** Literal, jump target, state key, or argument index — depending on op. */
  readonly arg?: string;
}

/** Ops that require an argument. */
const NEEDS_ARG: ReadonlySet<OpCode> = new Set(["PUSH", "JMP", "JZ", "LOAD", "STORE", "ARG"]);

const ALL_OPS: ReadonlySet<OpCode> = new Set<OpCode>([
  "PUSH",
  "POP",
  "DUP",
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "MOD",
  "LT",
  "GT",
  "EQ",
  "NOT",
  "AND",
  "OR",
  "JMP",
  "JZ",
  "LOAD",
  "STORE",
  "ARG",
  "HALT",
  "REJECT",
]);

/** Type guard: is `x` a known opcode string? */
export function isOpCode(x: string): x is OpCode {
  const names: ReadonlySet<string> = ALL_OPS; // safe widening, no assertion
  return names.has(x);
}

export const MAX_PROGRAM_LENGTH = 4096;
export const MAX_STATE_KEY_LENGTH = 64;
export const DEFAULT_GAS_LIMIT = 10_000;

/** Per-op gas costs: state access is priced above pure stack work. */
function gasCost(op: OpCode): number {
  if (op === "STORE") return 5;
  if (op === "LOAD") return 2;
  return 1;
}

/**
 * Statically validate a program before deployment: known ops, required args
 * present and well-formed, jump targets in range. Returns an error string or
 * undefined when valid.
 */
export function validateProgram(program: readonly Instruction[]): string | undefined {
  if (program.length === 0) return "program is empty";
  if (program.length > MAX_PROGRAM_LENGTH)
    return `program exceeds ${MAX_PROGRAM_LENGTH} instructions`;
  for (let i = 0; i < program.length; i++) {
    const ins = program[i]!;
    if (!ALL_OPS.has(ins.op)) return `instruction ${i}: unknown op ${ins.op}`;
    if (NEEDS_ARG.has(ins.op)) {
      if (ins.arg === undefined) return `instruction ${i}: ${ins.op} requires an argument`;
      if (ins.op === "PUSH") {
        try {
          BigInt(ins.arg);
        } catch {
          return `instruction ${i}: PUSH argument is not an integer`;
        }
      } else if (ins.op === "JMP" || ins.op === "JZ") {
        const target = Number(ins.arg);
        if (!Number.isInteger(target) || target < 0 || target > program.length) {
          return `instruction ${i}: jump target out of range`;
        }
      } else if (ins.op === "LOAD" || ins.op === "STORE") {
        if (ins.arg.length === 0 || ins.arg.length > MAX_STATE_KEY_LENGTH) {
          return `instruction ${i}: state key length out of range`;
        }
      } else if (ins.op === "ARG") {
        const idx = Number(ins.arg);
        if (!Number.isInteger(idx) || idx < 0) return `instruction ${i}: bad argument index`;
      }
    }
  }
  return undefined;
}

export interface VmResult {
  /** Did the program accept the action? Traps and REJECT both yield false. */
  readonly accepted: boolean;
  /** Gas consumed before halting/trapping. */
  readonly gasUsed: number;
  /** Post-execution state. Identical to the input state unless accepted. */
  readonly state: Map<string, bigint>;
  /** Trap/reject explanation, when not cleanly accepted. */
  readonly error?: string;
}

/**
 * Execute a validated program against a contract's state and the invocation
 * arguments. State writes land in a draft and are committed only on accept —
 * a rejected or trapped invocation cannot mutate on-chain state.
 */
export function execute(
  program: readonly Instruction[],
  state: ReadonlyMap<string, bigint>,
  args: readonly bigint[],
  gasLimit: number = DEFAULT_GAS_LIMIT,
): VmResult {
  const draft = new Map(state);
  const stack: bigint[] = [];
  let gasUsed = 0;
  let pc = 0;

  const reject = (error: string): VmResult => ({
    accepted: false,
    gasUsed,
    state: new Map(state),
    error,
  });

  while (pc < program.length) {
    const ins = program[pc]!;
    gasUsed += gasCost(ins.op);
    if (gasUsed > gasLimit) return reject(`out of gas at instruction ${pc}`);
    pc++;

    switch (ins.op) {
      case "PUSH":
        stack.push(BigInt(ins.arg!));
        break;
      case "POP":
        if (stack.pop() === undefined) return reject("stack underflow on POP");
        break;
      case "DUP": {
        const top = stack[stack.length - 1];
        if (top === undefined) return reject("stack underflow on DUP");
        stack.push(top);
        break;
      }
      case "ADD":
      case "SUB":
      case "MUL":
      case "DIV":
      case "MOD":
      case "LT":
      case "GT":
      case "EQ":
      case "AND":
      case "OR": {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) return reject(`stack underflow on ${ins.op}`);
        if ((ins.op === "DIV" || ins.op === "MOD") && b === 0n) return reject("division by zero");
        stack.push(binaryOp(ins.op, a, b));
        break;
      }
      case "NOT": {
        const a = stack.pop();
        if (a === undefined) return reject("stack underflow on NOT");
        stack.push(a === 0n ? 1n : 0n);
        break;
      }
      case "JMP":
        pc = Number(ins.arg!);
        break;
      case "JZ": {
        const a = stack.pop();
        if (a === undefined) return reject("stack underflow on JZ");
        if (a === 0n) pc = Number(ins.arg!);
        break;
      }
      case "LOAD":
        stack.push(draft.get(ins.arg!) ?? 0n);
        break;
      case "STORE": {
        const v = stack.pop();
        if (v === undefined) return reject("stack underflow on STORE");
        draft.set(ins.arg!, v);
        break;
      }
      case "ARG": {
        const value = args[Number(ins.arg!)];
        if (value === undefined) return reject(`missing invocation argument ${ins.arg}`);
        stack.push(value);
        break;
      }
      case "HALT": {
        const verdict = stack.pop();
        if (verdict === undefined) return reject("stack underflow on HALT");
        if (verdict === 0n) return reject("policy rejected the action");
        return { accepted: true, gasUsed, state: draft };
      }
      case "REJECT":
        return reject("explicit REJECT");
    }
  }
  return reject("program ended without HALT");
}

function binaryOp(op: OpCode, a: bigint, b: bigint): bigint {
  switch (op) {
    case "ADD":
      return a + b;
    case "SUB":
      return a - b;
    case "MUL":
      return a * b;
    case "DIV":
      return a / b;
    case "MOD":
      return a % b;
    case "LT":
      return a < b ? 1n : 0n;
    case "GT":
      return a > b ? 1n : 0n;
    case "EQ":
      return a === b ? 1n : 0n;
    case "AND":
      return a !== 0n && b !== 0n ? 1n : 0n;
    case "OR":
      return a !== 0n || b !== 0n ? 1n : 0n;
    default:
      // Unreachable: callers only pass binary ops.
      throw new Error(`not a binary op: ${op}`);
  }
}
