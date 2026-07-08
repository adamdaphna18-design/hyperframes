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
export {
  runSelfHarnessLoop,
  renderMemory,
  type SelfHarnessLoopConfig,
  type SelfHarnessLoopResult,
  type LoopIteration,
  type LoopMemory,
  type LoopStopContext,
  type LoopStopReason,
} from "./loop-runner.js";

export { ScriptedModel } from "./models/scripted.js";
export { AnthropicModel, type AnthropicModelOptions } from "./models/anthropic.js";

export { makeSimTask, SimulatedAgent, type Pathology, type SimTask } from "./agents/simulated.js";
export { LlmAgent, renderHarness } from "./agents/llm.js";

export { buildDemoSuite } from "./demo/pathologies.js";
export { runDemo, describeEvent } from "./demo/run-demo.js";
export { runLoopDemo } from "./demo/run-loop.js";

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
export {
  HttpAgent,
  type ApiTask,
  type HttpAgentOptions,
  type HttpEnvelope,
} from "./examples/public-apis/http-agent.js";
export { HttpHeuristicProposer } from "./examples/public-apis/http-proposer.js";
export { httpScriptedModel } from "./examples/public-apis/http-model.js";
export { buildPublicApiSuite } from "./examples/public-apis/tasks.js";
export { runPublicApiDemo } from "./examples/public-apis/run.js";

// Bruno (usebruno/bruno) collection → Self-Harness tasks.
export {
  parseBru,
  dictEntries,
  type BruDocument,
  type BruBlock,
  type BruEntry,
} from "./examples/bruno/bru-parser.js";
export {
  parseAssertions,
  evaluateAssertions,
  resolvePath,
  type Assertion,
  type AssertResponse,
} from "./examples/bruno/assertions.js";
export {
  parseEnvironment,
  interpolate,
  type BruEnvironment,
} from "./examples/bruno/environment.js";
export { toBruRequest, type BruRequest } from "./examples/bruno/request.js";
export {
  loadBrunoCollection,
  buildBrunoSuite,
  bruRequestToTask,
  demoCollectionDir,
} from "./examples/bruno/collection.js";
export { runBrunoDemo } from "./examples/bruno/run.js";

// Data-science task suite (tkarim45/Beginner-Data-Science-Projects) → tasks.
export {
  PROJECTS,
  PATHOLOGY_RULE,
  projectsAtLevel,
  projectsUpToLevel,
  type DsProject,
  type DsLevel,
  type DsPathology,
} from "./examples/data-science/projects.js";
export { DsAgent, type DsTask, type DsResult } from "./examples/data-science/ds-agent.js";
export { AgenticDsAgent, RuleAwareModel } from "./examples/data-science/agentic-agent.js";
export { DsHeuristicProposer } from "./examples/data-science/ds-proposer.js";
export { dsScriptedModel } from "./examples/data-science/ds-model.js";
export {
  CommitteeProposer,
  EmpiricalJudge,
  ArchitectJudge,
  EconomistJudge,
  defaultCommittee,
  renderCourtRecords,
  type Judge,
  type JudgeVerdict,
  type JudgeContext,
  type CommitteeConfig,
  type CommitteeVerdict,
} from "./examples/data-science/committee.js";
export { buildDsSuite, dsTasksAtLevel, growByLevel } from "./examples/data-science/tasks.js";
export { runDataScienceDemo } from "./examples/data-science/run.js";
