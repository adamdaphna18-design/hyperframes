import { makeSimTask, type SimTask } from "../agents/simulated.js";

/**
 * The demo task suite. Two healthy tasks (which the regression gate must
 * protect) plus three recurring pathologies, two tasks each. Run against the
 * default naive harness, only the healthy tasks pass; the loop discovers and
 * fixes the rest.
 */
export function buildDemoSuite(): SimTask[] {
  return [
    // Healthy tasks — legitimately need a dozen tool calls, so an
    // over-aggressive tool-call cap will regress them at the gate.
    makeSimTask("healthy-deploy", "healthy", "Deploy the service and verify health checks.", 12),
    makeSimTask("healthy-migrate", "healthy", "Run the database migration end to end.", 12),

    // MiniMax-style pathology: no cap on tool-call loops.
    makeSimTask("explore-audit", "runaway-exploration", "Audit the repo and write findings.md."),
    makeSimTask("explore-report", "runaway-exploration", "Summarize the logs into report.md."),

    // Qwen-style pathology: re-running a command that already failed.
    makeSimTask("build-app", "repeated-failed-command", "Build the app and produce the binary."),
    makeSimTask("build-docs", "repeated-failed-command", "Build the docs site to /public."),

    // GLM-style pathology: environment lost between sessions.
    makeSimTask("env-token", "lost-env-var", "Set an auth token, then call the API with it."),
    makeSimTask("env-path", "lost-env-var", "Export a PATH entry, then run the installed tool."),
  ];
}
