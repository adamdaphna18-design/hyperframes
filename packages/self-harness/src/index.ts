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
export { runDemo, describeEvent } from "./demo/run-demo.js";

// Real-world example: driving the loop against public-apis endpoints.
export { ENDPOINTS, endpointByUrl, type ApiEndpoint } from "./examples/public-apis/endpoints.js";
export {
  FetchHttpClient,
  RecordedHttpClient,
  TimeoutError,
  type HttpClient,
  type HttpOptions,
  type HttpResult,
} from "./examples/public-apis/http-client.js";
export { HttpAgent, type ApiTask } from "./examples/public-apis/http-agent.js";
export { HttpHeuristicProposer } from "./examples/public-apis/http-proposer.js";
export { buildPublicApiSuite } from "./examples/public-apis/tasks.js";
export { runPublicApiDemo } from "./examples/public-apis/run.js";
