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

/** View tenant audit history (project / version scoped). All standard tenant roles. */
export const AUDIT_VIEW_ROLES = ["admin", "editor", "reviewer", "viewer"] as const;
export type AuditViewerRole = (typeof AUDIT_VIEW_ROLES)[number];

/** Create/update/archive tenant-owned EPD / emission factor records (not platform catalog). */
export const TENANT_EPD_MANAGER_ROLES = ["admin", "editor"] as const;
export type TenantEpdManagerRole = (typeof TENANT_EPD_MANAGER_ROLES)[number];
