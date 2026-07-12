import type { HarnessPatch, PatchOp } from "./types.js";

let counter = 0;

/** Build a harness patch with a process-unique id under the given prefix. */
export function makePatch(
  idPrefix: string,
  targetPattern: string,
  rationale: string,
  ops: PatchOp[],
): HarnessPatch {
  counter += 1;
  return { id: `${idPrefix}-${counter}`, targetPattern, rationale, ops };
}
