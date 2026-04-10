/** Keep in sync with apps/api/src/domain/productInputValidation.ts */
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

export const QUANTITY_UNITS = ["kg", "m2", "m3"] as const;

export const QUANTITY_UNIT_LABELS: Record<(typeof QUANTITY_UNITS)[number], string> = {
  kg: "kg",
  m2: "m²",
  m3: "m³",
};
