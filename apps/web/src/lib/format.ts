/** Display CO₂e and similar quantities (no business rules — API is source of truth). */
export function formatCo2e(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1, ...options });
}
