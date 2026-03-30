# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: express-session + connect-pg-simple + bcryptjs
- **Frontend**: React + Vite + Tailwind CSS + TanStack Query

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (full Finni backend)
│   └── finni/              # React + Vite frontend SaaS app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # DB seed script (tenants, users, emission factors)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Finni — Finnish Construction CO2 SaaS

### Development rules
- Build fast — no over-engineering
- No refactoring, no architecture optimization
- Focus on UI + flow

### Seed credentials (dev only)
- Admin: `admin@finni.fi` / `admin123`
- Reviewer: `reviewer@finni.fi` / `reviewer123`
- Editor: `editor@finni.fi` / `editor123`

To re-seed: `pnpm --filter @workspace/scripts run seed`

### DB schema tables
- tenants, users, projects, buildings, spaces, versions, products, emission_factors, reports, audit_logs, session (auto-created)

### API routes (all under /api)
- `/auth/*` — login, logout, me
- `/users/*` — user management (admin only)
- `/projects/*` — project CRUD + dashboard summary
- `/projects/:id/building` — building + spaces CRUD
- `/projects/:id/versions` — version list + clone
- `/versions/:id` — get, lock
- `/versions/:id/products` — product CRUD per version
- `/products/:id` — update, delete, duplicate
- `/emission-factors` — seed library with filters
- `/versions/:id/validation` — real-time validation checks
- `/versions/:id/calculations` — CO2 module breakdown
- `/versions/:id/reports/pdf` — generate PDF
- `/versions/:id/reports/xlsx` — generate XLSX
- `/reports/:id/download` — download file
- `/projects/:id/audit` — audit log

### Roles
- `admin`: full access + user management
- `editor`: create/edit projects, products, buildings
- `reviewer`: lock versions
- `viewer`: read-only

### CO2 Formula
- `product_total = quantityValue × co2ePerUnitSnapshot`
- `module_total = product_total × moduleShare`
- Module shares (A1-A3, A4, A5, B, C) must sum to 1.0

### TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

### Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

### Packages

#### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts session, CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts all sub-routers
- Auth middleware: `src/middlewares/requireAuth.ts`
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server

#### `artifacts/finni` (`@workspace/finni`)

React + Vite frontend SaaS app. All pages in `src/pages/`, shared layout in `src/components/`.
Uses `@workspace/api-client-react` for TanStack Query hooks.

#### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.
Run `pnpm --filter @workspace/db run push` after schema changes.

#### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec + Orval codegen. Run `pnpm --filter @workspace/api-spec run codegen` after spec changes.
