#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Ledger, type LedgerSnapshot } from "./ledger.js";
import { agentKeyFromSecret, generateAgentKey } from "./zkp.js";
import { createTransaction, verifyTransaction } from "./transaction.js";
import { measureDivergence, seedFromHash } from "./butterfly.js";
import { hexToBigInt } from "./hash.js";
import {
  CONTRACT_DEPLOY_ACTION,
  CONTRACT_INVOKE_ACTION,
  contractIdOf,
  invokePayload,
  parseProgram,
  serializeProgram,
} from "./contract.js";

/**
 * ButterflyLedger command-line interface.
 *
 * A thin operational wrapper over the library: generate agent keys, record
 * agent actions with zero-knowledge authorship proofs, seal blocks, verify the
 * chain, prove inclusion, and demonstrate the butterfly cascade.
 */

const DEFAULT_FILE = "butterfly-ledger.json";

function loadLedger(file: string): Ledger {
  if (!existsSync(file)) return new Ledger();
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as LedgerSnapshot;
  return Ledger.restore(snapshot);
}

function saveLedger(file: string, ledger: Ledger): void {
  writeFileSync(file, JSON.stringify(ledger.snapshot(), null, 2));
}

/** Minimal `--flag value` parser. */
function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

function help(): void {
  console.log(`ButterflyLedger — zero-knowledge audit chain for AI-agent actions

Usage: butterflyledger <command> [options]

Commands:
  keygen                         Generate a new agent keypair (secret + public id)
  record --secret <hex> --action <verb> --payload <text>
                                 Record an action (creates a ZK-signed transaction)
      [--timestamp <n>] [--nonce <n>] [--file <path>]
  seal   [--timestamp <n>] [--file <path>]
                                 Mine all pending transactions into a block
  verify [--file <path>]         Validate the entire chain end to end
  show   [--file <path>]         Print the chain summary
  prove  --tx <id> [--file <path>]
                                 Emit a Merkle inclusion proof for a transaction
  tamper --tx <id> --payload <text> [--file <path>]
                                 Mutate a sealed transaction to show the cascade
  deploy --secret <hex> --program <file.json> [--file <path>]
                                 Deploy a smart contract (policy program) on-chain
  invoke --secret <hex> --contract <id> --args <csv> [--file <path>]
                                 Invoke a contract; rejected actions never enter the mempool
  contracts [--file <path>]      List deployed contracts and their current state
  butterfly                      Demonstrate sensitive dependence (chaos) numerically

Global:
  --file <path>                  Ledger file (default: ${DEFAULT_FILE})
`);
}

function main(): number {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);
  const file = flags.file ?? DEFAULT_FILE;

  switch (command) {
    case "keygen": {
      const key = generateAgentKey();
      console.log(`secret   (keep private): ${key.secret.toString(16)}`);
      console.log(`agent id (publish this): ${key.publicId}`);
      return 0;
    }

    case "record": {
      if (!flags.secret || !flags.action || flags.payload === undefined) {
        console.error("record requires --secret, --action and --payload");
        return 1;
      }
      const ledger = loadLedger(file);
      const key = agentKeyFromSecret(hexToBigInt(flags.secret));
      const tx = createTransaction(key, {
        action: flags.action,
        payload: flags.payload,
        timestamp: flags.timestamp ? Number(flags.timestamp) : ledger.height + 1,
        nonce: flags.nonce ? Number(flags.nonce) : ledger.mempool.length,
      });
      ledger.record(tx);
      saveLedger(file, ledger);
      console.log(`recorded ${tx.id}`);
      console.log(`  agent   ${tx.agentId.slice(0, 24)}…`);
      console.log(`  proof   verified=${verifyTransaction(tx)}`);
      console.log(`  mempool ${ledger.mempool.length} pending`);
      return 0;
    }

    case "seal": {
      const ledger = loadLedger(file);
      if (ledger.mempool.length === 0) {
        console.error("nothing to seal: mempool is empty");
        return 1;
      }
      const timestamp = flags.timestamp ? Number(flags.timestamp) : ledger.height + 1;
      const block = ledger.sealPending(timestamp);
      saveLedger(file, ledger);
      console.log(`sealed block #${block.height}`);
      console.log(`  hash      ${block.hash}`);
      console.log(`  butterfly ${block.butterfly}`);
      console.log(`  pow nonce ${block.nonce} (difficulty ${block.difficulty})`);
      console.log(`  txs       ${block.transactions.length}`);
      return 0;
    }

    case "verify": {
      const ledger = loadLedger(file);
      const result = ledger.validate();
      if (result.valid) {
        console.log(`OK — chain of ${ledger.height} block(s) is valid`);
        return 0;
      }
      console.error(`INVALID at block #${result.brokenAtHeight}: ${result.reason}`);
      return 1;
    }

    case "show": {
      const ledger = loadLedger(file);
      console.log(`ButterflyLedger — ${ledger.height} block(s), ${ledger.mempool.length} pending`);
      for (const block of ledger.chain) {
        console.log(`\n#${block.height}  ${block.hash.slice(0, 16)}…`);
        console.log(`  prev      ${block.previousHash.slice(0, 16)}…`);
        console.log(`  butterfly ${block.butterfly.slice(0, 16)}…`);
        for (const tx of block.transactions) {
          console.log(`  · ${tx.action.padEnd(14)} ${tx.payload.slice(0, 40)}`);
        }
      }
      return 0;
    }

    case "prove": {
      if (!flags.tx) {
        console.error("prove requires --tx <id>");
        return 1;
      }
      const ledger = loadLedger(file);
      const { blockHash, proof } = ledger.proveInclusion(flags.tx);
      const at = ledger.locate(flags.tx)!;
      const ok = ledger.verifyInclusion(at.height, proof);
      console.log(`inclusion proof for ${flags.tx}`);
      console.log(`  block   #${at.height} ${blockHash.slice(0, 16)}…`);
      console.log(`  root    ${proof.root}`);
      console.log(`  steps   ${proof.steps.length}`);
      console.log(`  valid   ${ok}`);
      return ok ? 0 : 1;
    }

    case "tamper": {
      if (!flags.tx || flags.payload === undefined) {
        console.error("tamper requires --tx <id> and --payload <text>");
        return 1;
      }
      const ledger = loadLedger(file);
      const at = ledger.locate(flags.tx);
      if (!at) {
        console.error(`transaction ${flags.tx} not found`);
        return 1;
      }
      const before = ledger.validate();
      // Reach into the stored snapshot and forge the payload.
      const forgedPayload = flags.payload;
      const snapshot = ledger.snapshot();
      const block = snapshot.blocks[at.height]!;
      snapshot.blocks[at.height] = {
        ...block,
        transactions: block.transactions.map((t, i) =>
          i === at.index ? { ...t, payload: forgedPayload } : t,
        ),
      };
      const tampered = Ledger.restore(snapshot);
      const after = tampered.validate();
      console.log(`before tamper: valid=${before.valid}`);
      console.log(
        `after  tamper: valid=${after.valid} — cascade detected at block #${after.brokenAtHeight}`,
      );
      console.log(`reason: ${after.reason}`);
      console.log("(the forged ledger was NOT saved)");
      return 0;
    }

    case "deploy": {
      if (!flags.secret || !flags.program) {
        console.error("deploy requires --secret and --program <file.json>");
        return 1;
      }
      const source = readFileSync(flags.program, "utf8");
      const parsed = parseProgram(source);
      if ("error" in parsed) {
        console.error(`invalid program: ${parsed.error}`);
        return 1;
      }
      const serialized = serializeProgram(parsed.program);
      const ledger = loadLedger(file);
      const key = agentKeyFromSecret(hexToBigInt(flags.secret));
      const tx = createTransaction(key, {
        action: CONTRACT_DEPLOY_ACTION,
        payload: serialized,
        timestamp: flags.timestamp ? Number(flags.timestamp) : ledger.height + 1,
        nonce: flags.nonce ? Number(flags.nonce) : ledger.mempool.length,
      });
      ledger.record(tx);
      saveLedger(file, ledger);
      console.log(`deployed contract ${contractIdOf(serialized)}`);
      console.log(`  tx ${tx.id} (pending seal)`);
      return 0;
    }

    case "invoke": {
      if (!flags.secret || !flags.contract || flags.args === undefined) {
        console.error("invoke requires --secret, --contract and --args <csv>");
        return 1;
      }
      const args =
        flags.args.length === 0 ? [] : flags.args.split(",").map((a) => BigInt(a.trim()));
      const ledger = loadLedger(file);
      const key = agentKeyFromSecret(hexToBigInt(flags.secret));
      const tx = createTransaction(key, {
        action: CONTRACT_INVOKE_ACTION,
        payload: invokePayload(flags.contract, args),
        timestamp: flags.timestamp ? Number(flags.timestamp) : ledger.height + 1,
        nonce: flags.nonce ? Number(flags.nonce) : ledger.mempool.length,
      });
      try {
        ledger.record(tx); // contract policy runs here — rejection throws
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
      saveLedger(file, ledger);
      console.log(`invoked ${flags.contract.slice(0, 16)}… — accepted`);
      console.log(`  tx ${tx.id} (pending seal)`);
      const view = ledger.inspectContract(flags.contract);
      if (view) console.log(`  state ${JSON.stringify(view.state)}`);
      return 0;
    }

    case "contracts": {
      const ledger = loadLedger(file);
      const ids = ledger.listContracts();
      console.log(`${ids.length} contract(s) deployed`);
      for (const id of ids) {
        const view = ledger.inspectContract(id)!;
        console.log(`  ${id}`);
        console.log(`    state ${JSON.stringify(view.state)}`);
      }
      return 0;
    }

    case "butterfly": {
      const seedA = seedFromHash("a");
      const report = measureDivergence(seedA);
      console.log("Butterfly effect — logistic map r=3.99, epsilon=1e-12");
      console.log(`  seed                 ${seedA.toFixed(15)}`);
      console.log(`  separation step      ${report.separationStep} iterations`);
      console.log(`  final distance       ${report.finalDistance.toFixed(6)}`);
      console.log(
        `  Lyapunov estimate    ${report.lyapunovEstimate.toFixed(4)} (positive ⇒ chaotic)`,
      );
      return 0;
    }

    case undefined:
    case "help":
    case "--help":
    case "-h":
      help();
      return 0;

    default:
      console.error(`unknown command: ${command}\n`);
      help();
      return 1;
  }
}

process.exit(main());
