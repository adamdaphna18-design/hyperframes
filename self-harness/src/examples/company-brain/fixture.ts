import { CompanyBrain } from "./brain.js";
import { ingest } from "./ingest.js";
import { SEED_SOURCES } from "./sources.js";
import { VERTICALS } from "./verticals.js";
import { seedWarehouse } from "./warehouse.js";

/**
 * The seeded demo brain: the seed sources ingested into a cross-linked wiki, with
 * the warehouse primed to each vertical's pre-optimization baseline. Shared by the
 * demo runner and the tests so there is exactly one definition of "the brain".
 */
export function buildDemoBrain(): CompanyBrain {
  const warehouse = seedWarehouse(
    VERTICALS.map((v) => ({ metric: v.metric, value: v.baselineMetric })),
  );
  return new CompanyBrain(ingest(SEED_SOURCES), warehouse);
}
