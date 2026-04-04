/**
 * Authorization boundaries (tenant-scoped). Session role is the source of truth.
 * @see docs/SYSTEM_SPEC.md
 */

/** Create/edit projects, buildings, products, clone versions */
export const TENANT_EDITOR_ROLES = ["admin", "editor"] as const;

/** Lock versions (validate & approve path) */
export const VERSION_LOCK_ROLES = ["admin", "reviewer"] as const;

export type TenantEditorRole = (typeof TENANT_EDITOR_ROLES)[number];
export type VersionLockRole = (typeof VERSION_LOCK_ROLES)[number];
