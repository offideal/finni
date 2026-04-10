import { createRequire } from "node:module";
import path from "node:path";
import {
  parseProductCreateBody,
  PRODUCT_VALIDATION_FAILED_CODE,
  type ProductValidationFailure,
  type ValidatedProductCreate,
} from "./productInputValidation.ts";

export const BIM_IMPORT_MAX_BYTES = 32 * 1024 * 1024;
/** Max IFC-derived product rows per import (same order of magnitude as Excel). */
export const BIM_IMPORT_MAX_PRODUCTS = 2000;

const PRODUCT_IFC_TYPE_NAMES = [
  "IFCBUILDINGELEMENTPROXY",
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCSLAB",
  "IFCBEAM",
  "IFCCOLUMN",
  "IFCMEMBER",
  "IFCWINDOW",
  "IFCDOOR",
  "IFCPLATE",
  "IFCCOVERING",
] as const;

export type IfcImportPreviewSpace = {
  sourceExpressId: number;
  name: string;
  areaM2: number | null;
};

export type IfcImportPreviewProductRow =
  | {
      sourceExpressId: number;
      ifcType: string;
      ok: true;
      data: ValidatedProductCreate;
    }
  | {
      sourceExpressId: number;
      ifcType: string;
      ok: false;
      fieldErrors: Record<string, string>;
    };

export type IfcImportPreviewResult = {
  structureOk: boolean;
  structureError?: string;
  schemaName?: string;
  /** Supported IFC scope banner for UI. */
  scopeNotes: string[];
  buildingName: string | null;
  /** Sum of parsed space floor areas when at least one space has an area. */
  suggestedGrossAreaM2: number | null;
  spaces: IfcImportPreviewSpace[];
  /** Heuristic warnings (e.g. partial quantities). */
  warnings: string[];
  productRows: IfcImportPreviewProductRow[];
  stats: {
    spaceCount: number;
    productCandidates: number;
    productOk: number;
    productError: number;
  };
};

let ifcApiSingleton: import("web-ifc").IfcAPI | null = null;
let ifcModuleSingleton: typeof import("web-ifc") | null = null;

async function getIfcRuntime(): Promise<{ api: import("web-ifc").IfcAPI; WebIfc: typeof import("web-ifc") }> {
  if (ifcApiSingleton && ifcModuleSingleton) {
    return { api: ifcApiSingleton, WebIfc: ifcModuleSingleton };
  }
  const WebIfc = await import("web-ifc");
  const api = new WebIfc.IfcAPI();
  const require = createRequire(import.meta.url);
  const pkgRoot = path.dirname(require.resolve("web-ifc/package.json"));
  api.SetWasmPath(path.join(pkgRoot, "/"), true);
  await api.Init(undefined, true);
  ifcApiSingleton = api;
  ifcModuleSingleton = WebIfc;
  return { api, WebIfc };
}

export function looksLikeIfcStepPhysicalFile(buffer: Buffer): boolean {
  const n = Math.min(buffer.length, 4096);
  const head = buffer.subarray(0, n).toString("utf8");
  return /ISO-10303-21/i.test(head) && /HEADER\s*;/i.test(head);
}

function extractLabel(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  if (typeof val === "object" && val !== null && "value" in val) {
    return extractLabel((val as { value: unknown }).value);
  }
  return null;
}

function extractLeafNumber(val: unknown, depth = 0): number | null {
  if (depth > 10) return null;
  if (typeof val === "number" && Number.isFinite(val) && val >= 0) return val;
  if (val && typeof val === "object" && "value" in val) {
    return extractLeafNumber((val as { value: unknown }).value, depth + 1);
  }
  return null;
}

/** Depth-limited walk for IFC flattened lines (Name, quantities, etc.). */
function findNumericByKeyHints(obj: unknown, keyHints: RegExp, depth = 0): number | null {
  if (depth > 12) return null;
  if (obj == null) return null;
  if (typeof obj === "number" && Number.isFinite(obj) && obj >= 0) return obj;
  if (typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const v = findNumericByKeyHints(x, keyHints, depth + 1);
      if (v != null) return v;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (keyHints.test(k)) {
      const leaf = extractLeafNumber(v);
      if (leaf != null) return leaf;
      const nested = findNumericByKeyHints(v, keyHints, depth + 1);
      if (nested != null) return nested;
    }
  }
  for (const v of Object.values(rec)) {
    const n = findNumericByKeyHints(v, keyHints, depth + 1);
    if (n != null) return n;
  }
  return null;
}

function pickNameFromLine(line: unknown): string | null {
  if (!line || typeof line !== "object") return null;
  const o = line as Record<string, unknown>;
  const long = extractLabel(o.LongName);
  if (long) return long;
  const name = extractLabel(o.Name);
  if (name) return name;
  return null;
}

/** Exported for unit tests; maps IFC type name to Finni product category. */
export function inferCategoryFromIfcType(typeName: string): string {
  const t = typeName.toUpperCase();
  if (t.includes("WALL") || t.includes("SLAB")) return "concrete";
  if (t.includes("BEAM") || t.includes("COLUMN") || t.includes("MEMBER")) return "steel";
  if (t.includes("WINDOW") || t.includes("DOOR") || t.includes("PLATE") || t.includes("COVERING")) return "glass";
  return "other";
}

function quantityFromElementLine(line: unknown): { quantityValue: number | null; quantityUnit: string | null } {
  const vol = findNumericByKeyHints(line, /NetVolume|GrossVolume/i);
  if (vol != null && vol > 0) {
    return { quantityValue: vol, quantityUnit: "m3" };
  }
  const area = findNumericByKeyHints(line, /NetArea|GrossFloorArea|GrossSideArea|Area$/i);
  if (area != null && area > 0) {
    return { quantityValue: area, quantityUnit: "m2" };
  }
  return { quantityValue: null, quantityUnit: null };
}

/**
 * Parse IFC buffer into a deterministic preview (narrow BIM scope: building + element-based product candidates).
 */
export async function parseIfcBufferForPreview(buffer: Buffer): Promise<IfcImportPreviewResult> {
  const base: IfcImportPreviewResult = {
    structureOk: false,
    scopeNotes: [
      "IFC STEP physical file (ISO-10303-21), schema detected from model.",
      "Building: first IfcBuilding name; gross area = sum of IfcSpace floor areas when parsable.",
      "Products: limited element types (walls, slabs, beams, columns, windows, doors, proxies, …) with Name/LongName and optional NetVolume/NetArea.",
      "Emission factors are never imported.",
    ],
    buildingName: null,
    suggestedGrossAreaM2: null,
    spaces: [],
    warnings: [],
    productRows: [],
    stats: { spaceCount: 0, productCandidates: 0, productOk: 0, productError: 0 },
  };

  if (buffer.length === 0) {
    return { ...base, structureError: "Empty file" };
  }
  if (buffer.length > BIM_IMPORT_MAX_BYTES) {
    return { ...base, structureError: `File exceeds ${BIM_IMPORT_MAX_BYTES} bytes` };
  }
  if (!looksLikeIfcStepPhysicalFile(buffer)) {
    return {
      ...base,
      structureError: "Not a recognized IFC STEP file (expected ISO-10303-21 HEADER).",
    };
  }

  const { api } = await getIfcRuntime();
  const modelID = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0) {
    return { ...base, structureError: "Could not open IFC model (unsupported or corrupt file)." };
  }

  try {
    const schemaName = api.GetModelSchema(modelID) || undefined;
    base.schemaName = schemaName;

    const buildingType = api.GetTypeCodeFromName("IFCBUILDING");
    if (buildingType !== undefined && buildingType > 0) {
      const bIds = api.GetLineIDsWithType(modelID, buildingType, false);
      if (bIds.size() > 0) {
        const line = api.GetLine(modelID, bIds.get(0), true);
        base.buildingName = pickNameFromLine(line);
      }
    }

    const spaceType = api.GetTypeCodeFromName("IFCSPACE");
    const spaces: IfcImportPreviewSpace[] = [];
    if (spaceType !== undefined && spaceType > 0) {
      const sIds = api.GetLineIDsWithType(modelID, spaceType, true);
      for (let i = 0; i < sIds.size(); i++) {
        const eid = sIds.get(i);
        const line = api.GetLine(modelID, eid, true);
        const name = pickNameFromLine(line) ?? `Space #${eid}`;
        const area =
          findNumericByKeyHints(line, /GrossFloorArea|NetFloorArea|GrossArea|NetArea/i) ??
          findNumericByKeyHints(line, /Area$/i);
        spaces.push({
          sourceExpressId: eid,
          name,
          areaM2: area != null && Number.isFinite(area) ? area : null,
        });
      }
    }
    base.spaces = spaces;
    base.stats.spaceCount = spaces.length;

    const withArea = spaces.filter((s) => s.areaM2 != null);
    if (withArea.length > 0) {
      base.suggestedGrossAreaM2 = withArea.reduce((a, s) => a + (s.areaM2 as number), 0);
      if (withArea.length < spaces.length) {
        base.warnings.push("Some IfcSpace rows had no parsable floor area; suggested gross uses only spaces with areas.");
      }
    } else if (spaces.length > 0) {
      base.warnings.push("No floor areas found on IfcSpace; set gross area manually before applying building data.");
    }

    const seenProduct = new Set<number>();
    const productRows: IfcImportPreviewProductRow[] = [];

    for (const typeName of PRODUCT_IFC_TYPE_NAMES) {
      const code = api.GetTypeCodeFromName(typeName);
      if (code === undefined || code <= 0) continue;
      const ids = api.GetLineIDsWithType(modelID, code, true);
      for (let i = 0; i < ids.size(); i++) {
        if (productRows.length >= BIM_IMPORT_MAX_PRODUCTS) break;
        const eid = ids.get(i);
        if (seenProduct.has(eid)) continue;
        seenProduct.add(eid);

        const line = api.GetLine(modelID, eid, true);
        const nm = pickNameFromLine(line) ?? `${typeName} #${eid}`;
        const { quantityValue, quantityUnit } = quantityFromElementLine(line);
        const category = inferCategoryFromIfcType(typeName);
        const body = {
          name: nm,
          category,
          quantityValue,
          quantityUnit,
          moduleA1A3Share: 1,
          moduleA4Share: 0,
          moduleA5Share: 0,
          moduleBShare: 0,
          moduleCShare: 0,
        };
        const parsed = parseProductCreateBody(body);
        const failed = parsed as ProductValidationFailure;
        if ("code" in parsed && failed.code === PRODUCT_VALIDATION_FAILED_CODE) {
          productRows.push({
            sourceExpressId: eid,
            ifcType: typeName,
            ok: false,
            fieldErrors: failed.fieldErrors,
          });
        } else {
          productRows.push({
            sourceExpressId: eid,
            ifcType: typeName,
            ok: true,
            data: parsed as ValidatedProductCreate,
          });
        }
      }
      if (productRows.length >= BIM_IMPORT_MAX_PRODUCTS) break;
    }

    base.productRows = productRows;
    base.stats.productCandidates = productRows.length;
    base.stats.productOk = productRows.filter((r) => r.ok).length;
    base.stats.productError = productRows.filter((r) => !r.ok).length;

    if (productRows.length >= BIM_IMPORT_MAX_PRODUCTS) {
      base.warnings.push(`Product list truncated at ${BIM_IMPORT_MAX_PRODUCTS} rows.`);
    }

    base.structureOk = true;
    return base;
  } finally {
    api.CloseModel(modelID);
  }
}
