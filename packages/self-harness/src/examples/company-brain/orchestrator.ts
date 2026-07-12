import { runTask } from "../../runner.js";
import type { Harness } from "../../types.js";
import type { CompanyBrain } from "./brain.js";
import type { CompanyAgent, OsResult } from "./os-agent.js";
import { buildCompanySuite } from "./tasks.js";
import { PLAYBOOK_FOR_VERTICAL, type Vertical } from "./verticals.js";

/** One vertical's shipped result — what the orchestrator hands back for review. */
export interface Deliverable {
  vertical: string;
  metric: string;
  value: number;
  shipped: boolean;
  detail: string;
}

/**
 * ORCHESTRATOR — runs the operating system. Given the learned harness it routes
 * every vertical to its specialist (with brain context), collects the
 * deliverables for review, and files results back into the brain and warehouse so
 * the next cycle starts from a stronger memory. This is the diagram's outer loop:
 * measured results write back, it compounds.
 */
export class Orchestrator {
  constructor(
    private readonly brain: CompanyBrain,
    private readonly agent: CompanyAgent,
  ) {}

  /** Route and run every vertical under the harness; return deliverables for approval. */
  async run(harness: Harness): Promise<Deliverable[]> {
    const deliverables: Deliverable[] = [];
    for (const task of buildCompanySuite()) {
      const { passed, detail, trajectory } = await runTask(this.agent, harness, task);
      const value = (JSON.parse(trajectory.output) as OsResult).metric ?? 0;
      deliverables.push({
        vertical: task.vertical.id,
        metric: task.vertical.metric,
        value,
        shipped: passed,
        detail,
      });
    }
    return deliverables;
  }

  /** File approved deliverables back: measured results to the warehouse, playbooks to the brain. */
  writeBack(harness: Harness, deliverables: Deliverable[], verticals: Vertical[]): void {
    for (const d of deliverables) {
      if (d.shipped) this.brain.warehouse.write(d.metric, d.value);
    }
    for (const rule of harness.rules) {
      const vertical = verticals.find((v) => PLAYBOOK_FOR_VERTICAL[v.id] === rule);
      this.brain.writeBack({
        id: `playbook-${rule}`,
        title: `Playbook: ${rule}`,
        body: `Learned practice "${rule}"${vertical ? ` for ${vertical.name}` : ""}, gated against regressions.`,
        tags: [...(vertical ? [vertical.id] : []), "playbook"].sort(),
        links: [],
        vertical: vertical?.id,
      });
    }
  }
}
