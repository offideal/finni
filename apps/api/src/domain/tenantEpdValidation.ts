import { PRODUCT_CATEGORIES, QUANTITY_UNITS, type ProductCategory, type QuantityUnit } from "./productInputValidation.ts";

export const TENANT_EPD_VALIDATION_FAILED = "TENANT_EPD_VALIDATION_FAILED" as const;

const NAME_MAX = 500;

export type TenantEpdFieldErrors = Record<string, string>;

export type TenantEpdValidationFailure = {
  error: string;
  code: typeof TENANT_EPD_VALIDATION_FAILED;
  fieldErrors: TenantEpdFieldErrors;
};

export type ValidatedTenantEpdCreate = {
  sourceName: string;
  category: ProductCategory;
  unit: QuantityUnit;
  co2ePerUnit: number;
};

export type ValidatedTenantEpdUpdate = {
  sourceName?: string;
  category?: ProductCategory;
  unit?: QuantityUnit;
  co2ePerUnit?: number;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function failure(fieldErrors: TenantEpdFieldErrors, message = "Invalid EPD data"): TenantEpdValidationFailure {
  return { error: message, code: TENANT_EPD_VALIDATION_FAILED, fieldErrors };
}

function parseNonNegativeFinite(value: unknown, field: string, fieldErrors: TenantEpdFieldErrors): number | null {
  if (value === null || value === undefined || value === "") {
    fieldErrors[field] = "Required";
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    fieldErrors[field] = "Must be a valid number";
    return null;
  }
  if (n < 0) {
    fieldErrors[field] = "Cannot be negative";
    return null;
  }
  return n;
}

export function parseTenantEpdCreateBody(body: unknown): ValidatedTenantEpdCreate | TenantEpdValidationFailure {
  if (!isRecord(body)) {
    return failure({ _body: "Request body must be a JSON object" });
  }
  const fieldErrors: TenantEpdFieldErrors = {};

  const rawName = body["sourceName"];
  const sourceName =
    typeof rawName === "string"
      ? rawName.trim()
      : rawName === undefined
        ? ""
        : String(rawName ?? "").trim();
  if (!sourceName) {
    fieldErrors.sourceName = "Name is required";
  } else if (sourceName.length > NAME_MAX) {
    fieldErrors.sourceName = `Name must be at most ${NAME_MAX} characters`;
  }

  const rawCat = body["category"];
  const catStr = typeof rawCat === "string" ? rawCat.trim() : String(rawCat ?? "").trim();
  if (!catStr) {
    fieldErrors.category = "Category is required";
  } else if (!PRODUCT_CATEGORIES.includes(catStr as ProductCategory)) {
    fieldErrors.category = `Must be one of: ${PRODUCT_CATEGORIES.join(", ")}`;
  }

  const rawUnit = body["unit"];
  const unitStr = typeof rawUnit === "string" ? rawUnit.trim() : String(rawUnit ?? "").trim();
  if (!unitStr) {
    fieldErrors.unit = "Unit is required";
  } else if (!QUANTITY_UNITS.includes(unitStr as QuantityUnit)) {
    fieldErrors.unit = `Must be one of: ${QUANTITY_UNITS.join(", ")}`;
  }

  const co2ePerUnit = parseNonNegativeFinite(body["co2ePerUnit"], "co2ePerUnit", fieldErrors);

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  return {
    sourceName,
    category: catStr as ProductCategory,
    unit: unitStr as QuantityUnit,
    co2ePerUnit: co2ePerUnit as number,
  };
}

export function parseTenantEpdUpdateBody(body: unknown): ValidatedTenantEpdUpdate | TenantEpdValidationFailure {
  if (!isRecord(body)) {
    return failure({ _body: "Request body must be a JSON object" });
  }
  const fieldErrors: TenantEpdFieldErrors = {};
  const out: ValidatedTenantEpdUpdate = {};

  if (body["sourceName"] !== undefined) {
    const rawName = body["sourceName"];
    const sourceName =
      typeof rawName === "string"
        ? rawName.trim()
        : rawName === null
          ? ""
          : String(rawName ?? "").trim();
    if (!sourceName) {
      fieldErrors.sourceName = "Name cannot be empty";
    } else if (sourceName.length > NAME_MAX) {
      fieldErrors.sourceName = `Name must be at most ${NAME_MAX} characters`;
    } else {
      out.sourceName = sourceName;
    }
  }

  if (body["category"] !== undefined) {
    const catStr =
      typeof body["category"] === "string" ? body["category"].trim() : String(body["category"] ?? "").trim();
    if (!catStr) {
      fieldErrors.category = "Category cannot be empty";
    } else if (!PRODUCT_CATEGORIES.includes(catStr as ProductCategory)) {
      fieldErrors.category = `Must be one of: ${PRODUCT_CATEGORIES.join(", ")}`;
    } else {
      out.category = catStr as ProductCategory;
    }
  }

  if (body["unit"] !== undefined) {
    const unitStr = typeof body["unit"] === "string" ? body["unit"].trim() : String(body["unit"] ?? "").trim();
    if (!unitStr) {
      fieldErrors.unit = "Unit cannot be empty";
    } else if (!QUANTITY_UNITS.includes(unitStr as QuantityUnit)) {
      fieldErrors.unit = `Must be one of: ${QUANTITY_UNITS.join(", ")}`;
    } else {
      out.unit = unitStr as QuantityUnit;
    }
  }

  if (body["co2ePerUnit"] !== undefined) {
    const n = parseNonNegativeFinite(body["co2ePerUnit"], "co2ePerUnit", fieldErrors);
    if (n != null) out.co2ePerUnit = n;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  if (
    out.sourceName === undefined &&
    out.category === undefined &&
    out.unit === undefined &&
    out.co2ePerUnit === undefined
  ) {
    return failure({ _body: "No changes provided" }, "Provide at least one field to update");
  }

  return out;
}
