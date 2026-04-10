/**
 * Boundary types for external CO₂ catalog integrations.
 * Fetch/sync is separate from calculation: only snapshot fields on products feed the engine.
 */

export type ExternalCo2RecordPayload = {
  externalRecordId: string;
  sourceName: string;
  category: string;
  unit: string;
  co2ePerUnit: number;
};

export type ExternalCo2SourceHandler = {
  /** Stable key matching `external_co2_sources.key` and `emission_factors.external_source_key`. */
  key: string;
  /** Human-readable; used in API responses. */
  displayName: string;
  /**
   * Deterministic bundle for the initial integration (no network).
   * Future sources may perform HTTP here; keep I/O inside this function only.
   */
  fetchRecordsForSync: () => Promise<ExternalCo2RecordPayload[]>;
};
