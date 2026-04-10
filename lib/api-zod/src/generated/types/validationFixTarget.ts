export type ValidationFixTargetKind =
  | "building"
  | "products"
  | "calculation"
  | "product";

export interface ValidationFixTarget {
  kind: ValidationFixTargetKind;
  productId?: string;
}
