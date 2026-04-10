import type { ValidationCheck } from "./validationCheck";
import type { ValidationSummary } from "./validationSummary";

export interface ValidationResult {
  versionId: string;
  projectId: string;
  passed: boolean;
  summary: ValidationSummary;
  checks: ValidationCheck[];
}
