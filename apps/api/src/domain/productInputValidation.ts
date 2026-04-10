import type { Product } from "@workspace/db";

export const PRODUCT_VALIDATION_FAILED_CODE = "PRODUCT_VALIDATION_FAILED" as const;

/** Aligned with app UI / validationChecks category checks. */
export const PRODUCT_CATEGORIES = [
  "concrete",
  "steel",
  "wood",
  "insulation",
  "glass",
  "gypsum",
  "HVAC",
  "electrical",
  "site",
  "other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Declared quantity units (DB + emission factor matching). */
export const QUANTITY_UNITS = ["kg", "m2", "m3"] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

const MODULE_KEYS = [
  "moduleA1A3Share",
  "moduleA4Share",
  "moduleA5Share",
  "moduleBShare",
  "moduleCShare",
] as const;

const SHARE_EPS = 1e-3;
const NAME_MAX = 2000;

export type FieldErrors = Record<string, string>;

export type ProductValidationFailure = {
  error: string;
  code: typeof PRODUCT_VALIDATION_FAILED_CODE;
  fieldErrors: FieldErrors;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function parseNonNegativeNumber(value: unknown, field: string, fieldErrors: FieldErrors): number | null {
  if (value === null || value === undefined || value === "") {
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

function parseShare(value: unknown, field: string, fieldErrors: FieldErrors): number | null {
  if (value === undefined) return null;
  if (value === null) {
    fieldErrors[field] = "Cannot be empty";
    return null;
  }
  const n = parseNonNegativeNumber(value, field, fieldErrors);
  if (n === null) {
    if (!fieldErrors[field]) fieldErrors[field] = "Must be a valid number";
    return null;
  }
  if (n > 1) {
    fieldErrors[field] = "Must be between 0 and 1";
    return null;
  }
  return n;
}

function moduleShareForCreate(
  body: Record<string, unknown>,
  key: (typeof MODULE_KEYS)[number],
  defaultVal: number,
  fieldErrors: FieldErrors,
): number {
  if (body[key] === undefined) return defaultVal;
  return parseShare(body[key], key, fieldErrors) ?? defaultVal;
}

function validateModuleShares(shares: {
  moduleA1A3Share: number;
  moduleA4Share: number;
  moduleA5Share: number;
  moduleBShare: number;
  moduleCShare: number;
}): string | null {
  const sum =
    shares.moduleA1A3Share +
    shares.moduleA4Share +
    shares.moduleA5Share +
    shares.moduleBShare +
    shares.moduleCShare;
  if (Math.abs(sum - 1) > SHARE_EPS) {
    return `Module shares must sum to 1.0 (currently ${sum.toFixed(3)})`;
  }
  return null;
}

function failure(fieldErrors: FieldErrors, message = "Invalid product data"): ProductValidationFailure {
  return { error: message, code: PRODUCT_VALIDATION_FAILED_CODE, fieldErrors };
}

export type ValidatedProductCreate = {
  name: string;
  category: string;
  quantityValue: number | null;
  quantityUnit: string | null;
  moduleA1A3Share: number;
  moduleA4Share: number;
  moduleA5Share: number;
  moduleBShare: number;
  moduleCShare: number;
};

/** Validate and normalize POST /products body. */
export function parseProductCreateBody(body: unknown): ValidatedProductCreate | ProductValidationFailure {
  if (!isRecord(body)) {
    return failure({ _body: "Request body must be a JSON object" });
  }

  const fieldErrors: FieldErrors = {};

  const rawName = body["name"];
  const name =
    typeof rawName === "string"
      ? rawName.trim()
      : rawName === undefined
        ? "New Product"
        : String(rawName ?? "").trim();
  if (!name) {
    fieldErrors.name = "Name is required";
  } else if (name.length > NAME_MAX) {
    fieldErrors.name = `Name must be at most ${NAME_MAX} characters`;
  }

  const rawCat = body["category"];
  const category =
    typeof rawCat === "string" && rawCat.trim()
      ? rawCat.trim()
      : rawCat === undefined
        ? "other"
        : String(rawCat ?? "").trim();
  if (!category) {
    fieldErrors.category = "Category is required";
  } else if (!PRODUCT_CATEGORIES.includes(category as ProductCategory)) {
    fieldErrors.category = `Must be one of: ${PRODUCT_CATEGORIES.join(", ")}`;
  }

  const qv = parseNonNegativeNumber(body["quantityValue"], "quantityValue", fieldErrors);

  const quRaw = body["quantityUnit"];
  const quantityUnit =
    quRaw === null || quRaw === undefined || quRaw === ""
      ? null
      : typeof quRaw === "string"
        ? quRaw.trim()
        : String(quRaw);
  if (quantityUnit != null && quantityUnit !== "" && !QUANTITY_UNITS.includes(quantityUnit as QuantityUnit)) {
    fieldErrors.quantityUnit = `Must be one of: ${QUANTITY_UNITS.join(", ")}`;
  }

  const shares = {
    moduleA1A3Share: moduleShareForCreate(body, "moduleA1A3Share", 1, fieldErrors),
    moduleA4Share: moduleShareForCreate(body, "moduleA4Share", 0, fieldErrors),
    moduleA5Share: moduleShareForCreate(body, "moduleA5Share", 0, fieldErrors),
    moduleBShare: moduleShareForCreate(body, "moduleBShare", 0, fieldErrors),
    moduleCShare: moduleShareForCreate(body, "moduleCShare", 0, fieldErrors),
  };

  const shareMsg = validateModuleShares(shares);
  if (shareMsg) {
    fieldErrors.moduleShares = shareMsg;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  return {
    name,
    category,
    quantityValue: qv,
    quantityUnit: quantityUnit && quantityUnit !== "" ? quantityUnit : null,
    ...shares,
  };
}

/** Validate PATCH fields (excluding emissionFactorId — applied in route). Returns DB updates for validated fields. */
export function parseProductPatchBody(
  existing: Product,
  body: unknown,
): { updates: Record<string, unknown> } | ProductValidationFailure {
  if (!isRecord(body)) {
    return failure({ _body: "Request body must be a JSON object" });
  }

  const fieldErrors: FieldErrors = {};
  const updates: Record<string, unknown> = {};

  if (body["name"] !== undefined) {
    const raw = body["name"];
    const name = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (!name) {
      fieldErrors.name = "Name is required";
    } else if (name.length > NAME_MAX) {
      fieldErrors.name = `Name must be at most ${NAME_MAX} characters`;
    } else {
      updates.name = name;
    }
  }

  if (body["category"] !== undefined) {
    const raw = body["category"];
    const category = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (!category) {
      fieldErrors.category = "Category is required";
    } else if (!PRODUCT_CATEGORIES.includes(category as ProductCategory)) {
      fieldErrors.category = `Must be one of: ${PRODUCT_CATEGORIES.join(", ")}`;
    } else {
      updates.category = category;
    }
  }

  if (body["quantityValue"] !== undefined) {
    const qv = parseNonNegativeNumber(body["quantityValue"], "quantityValue", fieldErrors);
    if (!fieldErrors.quantityValue) {
      updates.quantityValue = qv;
    }
  }

  if (body["quantityUnit"] !== undefined) {
    const quRaw = body["quantityUnit"];
    const quantityUnit =
      quRaw === null || quRaw === "" ? null : typeof quRaw === "string" ? quRaw.trim() : String(quRaw);
    if (quantityUnit != null && quantityUnit !== "" && !QUANTITY_UNITS.includes(quantityUnit as QuantityUnit)) {
      fieldErrors.quantityUnit = `Must be one of: ${QUANTITY_UNITS.join(", ")}`;
    } else {
      updates.quantityUnit = quantityUnit;
    }
  }

  for (const key of MODULE_KEYS) {
    if (body[key] !== undefined) {
      const fe: FieldErrors = {};
      const v = parseShare(body[key], key, fe);
      Object.assign(fieldErrors, fe);
      if (v !== null && !fe[key]) {
        updates[key] = v;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return failure(fieldErrors);
  }

  const mergedShares = {
    moduleA1A3Share:
      updates.moduleA1A3Share !== undefined ? (updates.moduleA1A3Share as number) : existing.moduleA1A3Share,
    moduleA4Share: updates.moduleA4Share !== undefined ? (updates.moduleA4Share as number) : existing.moduleA4Share,
    moduleA5Share: updates.moduleA5Share !== undefined ? (updates.moduleA5Share as number) : existing.moduleA5Share,
    moduleBShare: updates.moduleBShare !== undefined ? (updates.moduleBShare as number) : existing.moduleBShare,
    moduleCShare: updates.moduleCShare !== undefined ? (updates.moduleCShare as number) : existing.moduleCShare,
  };

  const shareMsg = validateModuleShares(mergedShares);
  if (shareMsg) {
    return failure({ moduleShares: shareMsg });
  }

  return { updates };
}
