export type {
  Agent,
  FailureCluster,
  Harness,
  HarnessLimits,
  HarnessPatch,
  Model,
  PatchOp,
  Proposer,
  SuiteResult,
  Task,
  TaskResult,
  ToolCall,
  Trajectory,
} from "./types.js";

export { applyPatch, cloneHarness, defaultHarness, diffHarness, patchSize } from "./harness.js";
export { clusterFailures } from "./cluster.js";
export { passingIds, runSuite, runTask } from "./runner.js";
export { regressionGate, type GateDecision } from "./gate.js";
export { HeuristicProposer, ModelProposer, parseOps } from "./proposer.js";
export {
  selfHarness,
  type LoopEvent,
  type RoundLog,
  type SelfHarnessConfig,
  type SelfHarnessResult,
} from "./loop.js";

export { ScriptedModel } from "./models/scripted.js";
export { AnthropicModel, type AnthropicModelOptions } from "./models/anthropic.js";

export { makeSimTask, SimulatedAgent, type Pathology, type SimTask } from "./agents/simulated.js";
export { LlmAgent, renderHarness } from "./agents/llm.js";

export { buildDemoSuite } from "./demo/pathologies.js";
export { runDemo } from "./demo/run-demo.js";
