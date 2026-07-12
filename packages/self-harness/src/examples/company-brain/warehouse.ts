/**
 * The "data" layer — the numbers side of the brain. The diagram's SQLite DB:
 * metrics and exports the agents measure against, and where measured results
 * write back. The offline default is an in-memory table; a real drop-in
 * implements the same {@link Warehouse} interface over SQLite (then Postgres
 * when it outgrows one file).
 */
export interface Warehouse {
  read(metric: string): number | undefined;
  write(metric: string, value: number): void;
  snapshot(): Record<string, number>;
}

export class InMemoryWarehouse implements Warehouse {
  private readonly table = new Map<string, number>();

  // Dispatched through the Warehouse interface (by the brain and agents).
  // fallow-ignore-next-line unused-class-member
  read(metric: string): number | undefined {
    return this.table.get(metric);
  }

  write(metric: string, value: number): void {
    this.table.set(metric, value);
  }

  // Dispatched through the Warehouse interface.
  // fallow-ignore-next-line unused-class-member
  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.table.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

/** Seed the warehouse with each vertical's current (pre-optimization) metric. */
export function seedWarehouse(rows: Array<{ metric: string; value: number }>): InMemoryWarehouse {
  const warehouse = new InMemoryWarehouse();
  for (const row of rows) warehouse.write(row.metric, row.value);
  return warehouse;
}
