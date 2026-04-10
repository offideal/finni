import type { ValidationCheckSeverity } from "./validationCheckSeverity";
import type { ValidationFixTarget } from "./validationFixTarget";

export type ValidationGroup =
  | "project"
  | "building"
  | "products"
  | "calculation"
  | "data_quality";

export interface ValidationCheck {
  id: string;
  passed: boolean;
  message: string;
  severity: ValidationCheckSeverity;
  group: ValidationGroup;
  fixTarget?: ValidationFixTarget | null;
}
