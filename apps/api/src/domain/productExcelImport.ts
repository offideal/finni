import type ExcelJS from "exceljs";
import {
  parseProductCreateBody,
  type ProductValidationFailure,
  type ValidatedProductCreate,
} from "./productInputValidation";

export const PRODUCT_IMPORT_MAX_ROWS = 2000;

export const IMPORT_STRUCTURE_INVALID = "IMPORT_STRUCTURE_INVALID" as const;

/** Normalized header → column index (1-based) */
export type HeaderMap = Record<string, number>;

/** Headers we accept (after normalize). Extra columns from export are ignored. */
const REQUIRED_HEADERS = ["name", "category", "qty", "unit", "a1-a3", "a4", "a5", "b", "c"] as const;

/** Map normalized header label to canonical key used in REQUIRED_HEADERS */
function normalizeHeaderLabel(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (s === "a1-a3" || s === "a1–a3") return "a1-a3";
  return s;
}

/** Recognized columns (canonical normalized). Unknown columns are ignored. */
const KNOWN_HEADERS = new Set([
  "product id",
  "name",
  "category",
  "qty",
  "unit",
  "co2e/unit",
  "a1-a3",
  "a4",
  "a5",
  "b",
  "c",
  "total kg co2e",
]);

export function cellToScalar(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null) {
    if ("result" in v && (v as { result?: unknown }).result !== undefined) {
      return (v as { result: unknown }).result;
    }
    if ("richText" in v && Array.isArray((v as { richText?: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((x) => x.text).join("");
    }
    if ("text" in v && typeof (v as { text?: string }).text === "string") {
      return (v as { text: string }).text;
    }
  }
  return String(v);
}

function readHeaderRow(row: ExcelJS.Row, maxCol: number): { map: HeaderMap; missing: string[] } {
  const map: HeaderMap = {};
  for (let c = 1; c <= maxCol; c++) {
    const raw = cellToScalar(row.getCell(c));
    const label =
      typeof raw === "string" ? normalizeHeaderLabel(raw) : raw != null ? normalizeHeaderLabel(String(raw)) : "";
    if (!label) continue;
    if (KNOWN_HEADERS.has(label) && map[label] === undefined) {
      map[label] = c;
    }
  }

  const missing: string[] = [];
  for (const h of REQUIRED_HEADERS) {
    if (map[h] === undefined) missing.push(h);
  }

  return { map, missing };
}

function rowToCreateBody(map: HeaderMap, row: ExcelJS.Row): Record<string, unknown> {
  const g = (key: (typeof REQUIRED_HEADERS)[number] | "product id" | "co2e/unit") => {
    const col = map[key];
    if (col === undefined) return undefined;
    return cellToScalar(row.getCell(col));
  };

  return {
    name: g("name"),
    category: g("category"),
    quantityValue: g("qty"),
    quantityUnit: g("unit"),
    moduleA1A3Share: g("a1-a3"),
    moduleA4Share: g("a4"),
    moduleA5Share: g("a5"),
    moduleBShare: g("b"),
    moduleCShare: g("c"),
  };
}

function isRowEmpty(map: HeaderMap, row: ExcelJS.Row): boolean {
  let any = false;
  for (const key of REQUIRED_HEADERS) {
    const col = map[key];
    if (col === undefined) continue;
    const v = cellToScalar(row.getCell(col));
    if (v !== undefined && v !== "" && v !== null) {
      any = true;
      break;
    }
  }
  return !any;
}

export type ImportPreviewRow = {
  excelRow: number;
  ok: boolean;
  fieldErrors?: Record<string, string>;
  data?: ValidatedProductCreate;
};

export type ProductImportPreviewResult = {
  worksheetName: string;
  structureOk: boolean;
  structureError?: string;
  code?: typeof IMPORT_STRUCTURE_INVALID;
  rows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
};

export async function parseProductImportWorkbook(buffer: Buffer): Promise<ProductImportPreviewResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws =
    wb.worksheets.find((w) => w.name.trim().toLowerCase() === "products") ?? wb.worksheets[0];

  if (!ws) {
    return {
      worksheetName: "",
      structureOk: false,
      structureError: "Workbook has no worksheets.",
      code: IMPORT_STRUCTURE_INVALID,
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  const headerRow = ws.getRow(1);
  const maxCol = Math.max(ws.columnCount || 0, headerRow.cellCount || 0, 20);
  const { map, missing } = readHeaderRow(headerRow, maxCol);

  if (missing.length > 0) {
    return {
      worksheetName: ws.name,
      structureOk: false,
      structureError: `Missing required column(s): ${missing.join(", ")}. Use the Finni export (Products sheet) or include columns: ${REQUIRED_HEADERS.join(", ")}.`,
      code: IMPORT_STRUCTURE_INVALID,
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  const rows: ImportPreviewRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  const lastRow = Math.min((ws as { rowCount?: number }).rowCount ?? 1, 65536);
  for (let r = 2; r <= lastRow; r++) {
    if (rows.length >= PRODUCT_IMPORT_MAX_ROWS) break;
    const row = ws.getRow(r);
    if (isRowEmpty(map, row)) continue;

    const body = rowToCreateBody(map, row);
    const parsed = parseProductCreateBody(body);
    const isFail = (x: unknown): x is ProductValidationFailure =>
      typeof x === "object" &&
      x !== null &&
      "code" in x &&
      (x as ProductValidationFailure).code === "PRODUCT_VALIDATION_FAILED";

    if (isFail(parsed)) {
      errorCount += 1;
      rows.push({ excelRow: r, ok: false, fieldErrors: parsed.fieldErrors });
    } else {
      validCount += 1;
      rows.push({ excelRow: r, ok: true, data: parsed });
    }
  }

  return {
    worksheetName: ws.name,
    structureOk: true,
    rows,
    validCount,
    errorCount,
  };
}

