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
  RefiningModelProposer,
  renderRefinements,
  type RefiningConfig,
  type RefineAttempt,
} from "./refining-proposer.js";
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
export { dsScriptedModel, refiningDsScriptedModel } from "./examples/data-science/ds-model.js";
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

// Recon compliance: an OSINT tool map → guardrails the loop learns (authorized use only).
export {
  PROBES,
  GUARDRAIL_RULE,
  type OsintCategory,
  type OsintPathology,
  type OsintProbe,
} from "./examples/osint/catalog.js";
export { OsintAgent, type OsintTask, type OsintResult } from "./examples/osint/osint-agent.js";
export { OsintHeuristicProposer } from "./examples/osint/osint-proposer.js";
export { osintScriptedModel } from "./examples/osint/osint-model.js";
export { ComplianceJudge } from "./examples/osint/compliance-judge.js";
export { buildOsintSuite } from "./examples/osint/tasks.js";
export { runOsintDemo } from "./examples/osint/run.js";

// Company brain: the three-layer "AI-ready company" system, gated by Self-Harness.
export { SEED_SOURCES, type Source, type SourceKind } from "./examples/company-brain/sources.js";
export {
  InMemoryWarehouse,
  seedWarehouse,
  type Warehouse,
} from "./examples/company-brain/warehouse.js";
export {
  VERTICALS,
  PLAYBOOK_FOR_VERTICAL,
  HARMFUL_SEO_RULE,
  type Vertical,
} from "./examples/company-brain/verticals.js";
export { ingest, crossLink, type BrainPage } from "./examples/company-brain/ingest.js";
export { CompanyBrain, LexicalRetriever, type Retriever } from "./examples/company-brain/brain.js";
export {
  CompanyAgent,
  type CompanyTask,
  type OsResult,
} from "./examples/company-brain/os-agent.js";
export { CompanyPlaybookProposer } from "./examples/company-brain/os-proposer.js";
export { Orchestrator, type Deliverable } from "./examples/company-brain/orchestrator.js";
export { buildCompanySuite } from "./examples/company-brain/tasks.js";
export { runCompanyBrainDemo } from "./examples/company-brain/run.js";

// TinyRouter: a tiny router whose routing policy is a harness Self-Harness learns.
export {
  SPECIALISTS,
  DOMAINS,
  BEST_SPECIALIST,
  DEFAULT_SPECIALIST,
  specialistById,
  type Domain,
  type Specialist,
} from "./examples/router/specialists.js";
export { QUESTIONS, type Question } from "./examples/router/questions.js";
export {
  Router,
  pickSpecialist,
  type RouterTask,
  type RouteResult,
} from "./examples/router/router-agent.js";
export { RouterProposer } from "./examples/router/router-proposer.js";
export { buildRouterSuite } from "./examples/router/tasks.js";
export { runRouterDemo } from "./examples/router/run.js";
export {
  REAL_PROBLEMS,
  type RealProblem,
  type RealDomain,
} from "./examples/router/real-problems.js";
export {
  KeywordClassifier,
  ModelClassifier,
  parseDomain,
  type DomainClassifier,
} from "./examples/router/classifier.js";
export {
  evaluateRealRouting,
  runRealEvalDemo,
  type RealEvalResult,
} from "./examples/router/real-eval.js";
export {
  BayesClassifier,
  trainBayes,
  evaluateHeldOutBayes,
  type HeldOutResult,
} from "./examples/router/bayes-classifier.js";
export { runBayesEvalDemo } from "./examples/router/bayes-eval.js";

// Technical analysis: real indicators on a real AAPL series; the loop learns TA rules.
export {
  sma,
  ema,
  emaSeries,
  rsi,
  macd,
  bollinger,
  type Macd,
  type Bollinger,
} from "./examples/technical-analysis/indicators.js";
export {
  AAPL_CLOSES,
  AAPL_START_DATE,
  AAPL_END_DATE,
} from "./examples/technical-analysis/prices.js";
export {
  SCENARIOS,
  RULE_FOR_PATTERN,
  CORRECT_FOR_PATTERN,
  HARMFUL_RULE,
  type TaScenario,
  type TaPattern,
  type Signal,
} from "./examples/technical-analysis/scenarios.js";
export { TaAgent, type TaTask, type TaResult } from "./examples/technical-analysis/ta-agent.js";
export { TaProposer } from "./examples/technical-analysis/ta-proposer.js";
export { buildTaSuite } from "./examples/technical-analysis/tasks.js";
export { runTechnicalAnalysisDemo } from "./examples/technical-analysis/run.js";

// LLM cost-router: the loop learns the cheapest safe model tier per request class,
// gated so no cost cut ever regresses quality — the money wedge, as a real artifact.
export {
  MODEL_TIERS,
  MIN_TIER_FOR_CLASS,
  COST_CUT_RULE,
  TOP_TIER,
  DEFAULT_TIER,
  tierById,
  routeRule,
  parseRoute,
  type Tier,
  type TierId,
  type RequestClass,
} from "./examples/cost-router/tiers.js";
export {
  requestCost,
  routingCost,
  savingsReport,
  type CostRequest,
  type TokenProfile,
  type Routing,
  type SavingsReport,
} from "./examples/cost-router/cost.js";
export { buildRequests, TOKEN_PROFILES, WORKLOAD_MIX } from "./examples/cost-router/requests.js";
export { CostRouter, type CostTask, type CostResult } from "./examples/cost-router/router-agent.js";
export { CostProposer } from "./examples/cost-router/cost-proposer.js";
export { buildCostSuite } from "./examples/cost-router/tasks.js";
export { runCostRouterDemo } from "./examples/cost-router/run.js";

// The revenue layer on the cost-router: sell the savings, keep a share. The loop
// learns gated per-segment pricing; the output is retained MRR/ARR — money you make.
export {
  SEGMENTS,
  DEFAULT_TAKE_RATE,
  MAXIMIZE_TAKE_RULE,
  buildCustomerBook,
  customerSavings,
  invoice,
  bill,
  priceRule,
  parsePrice,
  takeRateFor,
  billingReport,
  type SegmentId,
  type Segment,
  type Customer,
  type Billing,
  type BillingReport,
} from "./examples/cost-router/billing.js";
export {
  BillingAgent,
  type BillingTask,
  type BillingResult,
} from "./examples/cost-router/billing-agent.js";
export { PricingProposer } from "./examples/cost-router/billing-proposer.js";
export { buildBillingSuite } from "./examples/cost-router/billing-tasks.js";
export { runBillingDemo } from "./examples/cost-router/billing-run.js";
