import type { ExternalCo2SourceHandler } from "../types.ts";

/**
 * Placeholder "external" bundle: deterministic, versioned in code.
 * Replace `fetchRecordsForSync` with HTTP to a real API when adding a second integration.
 */
export const co2refStaticSource: ExternalCo2SourceHandler = {
  key: "co2ref_static",
  displayName: "CO₂ Reference (static bundle)",
  async fetchRecordsForSync() {
    return [
      {
        externalRecordId: "bundle_concrete_nh",
        sourceName: "[CO₂Ref] Concrete NH — national hybrid",
        category: "concrete",
        unit: "kg",
        co2ePerUnit: 0.148,
      },
      {
        externalRecordId: "bundle_steel_low",
        sourceName: "[CO₂Ref] Reinforcement — low-carbon pathway",
        category: "steel",
        unit: "kg",
        co2ePerUnit: 0.39,
      },
      {
        externalRecordId: "bundle_clt_std",
        sourceName: "[CO₂Ref] CLT — standard EPD profile",
        category: "wood",
        unit: "kg",
        co2ePerUnit: 0.048,
      },
      {
        externalRecordId: "bundle_glass_triple",
        sourceName: "[CO₂Ref] Triple glazing unit",
        category: "glass",
        unit: "m2",
        co2ePerUnit: 92.0,
      },
    ];
  },
};
