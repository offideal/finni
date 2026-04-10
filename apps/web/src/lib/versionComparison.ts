import type { CalculationResult, ModuleBreakdown } from "@workspace/api-client-react";

const MODULE_ORDER = ["A1-A3", "A4", "A5", "B", "C"] as const;

/** Aggregate included line CO₂e by normalized product name (handles duplicate names). */
export function aggregateCo2eByProductName(
  calc: CalculationResult,
): Map<string, { displayName: string; kg: number }> {
  const m = new Map<string, { displayName: string; kg: number }>();
  for (const line of calc.products) {
    if (line.eligibility !== "included" || line.co2eTotal == null) continue;
    const key = line.name.trim().toLowerCase();
    const prev = m.get(key);
    const kg = line.co2eTotal;
    if (prev) {
      m.set(key, { displayName: prev.displayName, kg: prev.kg + kg });
    } else {
      m.set(key, { displayName: line.name.trim(), kg });
    }
  }
  return m;
}

export type ModuleDeltaRow = {
  module: string;
  kgA: number;
  kgB: number;
  delta: number;
};

export function compareModuleTotals(a: CalculationResult, b: CalculationResult): ModuleDeltaRow[] {
  const byKey = (mods: ModuleBreakdown[]) => {
    const map = new Map<string, number>();
    for (const m of mods) {
      map.set(m.module, m.co2eTotal);
    }
    return map;
  };
  const mapA = byKey(a.modules);
  const mapB = byKey(b.modules);
  return MODULE_ORDER.map((key) => {
    const kgA = mapA.get(key) ?? 0;
    const kgB = mapB.get(key) ?? 0;
    return { module: key, kgA, kgB, delta: kgB - kgA };
  });
}

export type ProductDeltaRow = {
  key: string;
  name: string;
  kgA: number;
  kgB: number;
  delta: number;
};

/** Per-name deltas; names present in only one side get 0 on the other. */
export function compareProductsByName(a: CalculationResult, b: CalculationResult): ProductDeltaRow[] {
  const aggA = aggregateCo2eByProductName(a);
  const aggB = aggregateCo2eByProductName(b);
  const keys = new Set([...aggA.keys(), ...aggB.keys()]);
  const rows: ProductDeltaRow[] = [];
  for (const key of keys) {
    const rowA = aggA.get(key);
    const rowB = aggB.get(key);
    const kgA = rowA?.kg ?? 0;
    const kgB = rowB?.kg ?? 0;
    const name = rowA?.displayName ?? rowB?.displayName ?? key;
    rows.push({ key, name, kgA, kgB, delta: kgB - kgA });
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return rows;
}
