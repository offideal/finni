# Finni — Finnish Construction CO₂ SaaS MVP

Multi-user SaaS tool for Finnish building projects: CO₂ lifecycle calculation and reporting.

## Development rules

- **Build fast** — ship working features end to end, no waiting
- **No refactoring** — write it and move on, clean-up comes later
- **No architecture optimization** — simple is fine, do not over-engineer
- **Focus only on UI + flow** — get the user experience working first

## What this app does

Users create building projects, enter product and material data, attach emission factors, calculate lifecycle CO₂ by module (A1–A3, A4, A5, B, C), validate results, lock a version, and export a PDF or XLSX report. Results are deterministic and auditable.

## Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Session-based email/password
- **Export**: Server-side PDF and XLSX generation
- **Monorepo**: pnpm workspaces

## Pages

| Route | Purpose |
|---|---|
| `/login` | Email/password sign in |
| `/projects` | Project list for the tenant |
| `/projects/new` | Create a new project |
| `/projects/:id` | Project dashboard |
| `/projects/:id/building` | Building editor (area, spaces) |
| `/projects/:id/versions/:vId/products` | Product table with inline editing |
| `/projects/:id/versions/:vId/calculation` | Module CO₂ breakdown |
| `/projects/:id/versions/:vId/validation` | Validation checklist |
| `/projects/:id/versions` | Version history and locking |
| `/projects/:id/versions/:vId/reports` | PDF and XLSX export |

## Roles

- `admin` — full access, manage users
- `editor` — create and edit projects and products
- `reviewer` — validate and lock versions
- `viewer` — read only

## Core rules

1. All queries scoped by `tenantId` — no data leaks across tenants
2. Locked versions are fully immutable
3. Emission factor unit must match product unit
4. CO₂ formula: `quantity × co2ePerUnitSnapshot × moduleShare`
5. Module shares per product must sum to 1.0
6. Version can only be locked if all validations pass

## Seed data

The emission factor library is hardcoded seed data covering concrete, steel, wood, insulation, glass, gypsum, HVAC, electrical, site, and other categories.
