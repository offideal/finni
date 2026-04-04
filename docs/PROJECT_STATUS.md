# Finni — projektin tila

Päivitä tätä tiedostoa merkittävien refaktorien tai julkaisujen yhteydessä.

## Sijainti repossa

| Osio | Polku | Paketti (npm) |
|------|--------|-----------------|
| Web (React + Vite) | `apps/web` | `@workspace/finni` |
| API (Express) | `apps/api` | `@workspace/api-server` |
| DB + Drizzle-skeemat | `lib/db` | `@workspace/db` |
| OpenAPI-kuvaus | `lib/api-spec` | `@workspace/api-spec` |
| Generoitu React Query -client | `lib/api-client-react` | `@workspace/api-client-react` |
| Zod-tyypit (generoitu) | `lib/api-zod` | `@workspace/api-zod` |
| Skriptit (seed ym.) | `scripts` | — |

Muut `artifacts/*`-hakemistot (esim. mockup-sandbox) voivat olla työkaluja; pääsovellus on `apps/`- alla.

## Toteutettu (korkealla tasolla)

- **Autentikointi**: session-pohjainen kirjautuminen (`/api/auth`).
- **Tenant-scope**: projektit ja versiot sidottu session `tenantId`:hen; keskitetty pääsynhallinta (`apps/api/src/access/tenantResources.ts`).
- **Roolit**: `requireTenantEditor` datan muutoksille (admin + editor); lukitus admin/reviewer; viewer read-heavy.
- **Domain**: laskenta ja validointisäännöt erillään reiteistä (`apps/api/src/domain/calculation.ts`, `validationChecks.ts`).
- **Services (data layer)**: projektien DB-orchestraatio `apps/api/src/services/projectService.ts`; reitit (`routes/projects.ts`) ovat ohuita.
- **Auth-roolit**: `apps/api/src/auth/roles.ts` (editor vs. version lock).
- **Web**: jaettu lataus/virhe -UI `apps/web/src/components/feedback/AsyncView.tsx` keskeisillä sivuilla.
- **Projektit**: listaus paginointina (`limit` / `offset`, oletus 50, max 100).
- **Päästökertoimet**: skeemassa `tenant_id` (null = alustan katalogi); API suodattaa globaalit + tenantin omat rivit.
- **Raportit**: PDF/XLSX; lataus tenant-tarkistuksella (ei pelkkää report-id:tä).
- **Observability**: Pino, `X-Request-ID` / `genReqId`, `userId` / `tenantId` lokeissa; valinnainen `TRUST_PROXY` / `BEHIND_PROXY`.

## Väliaikaista / MVP-kompromisseja

- **README:n vanhat kehityssäännöt** ("no refactoring") ovat historiallisia; stabilointi ja kerrokset ovat sallittuja — katso [SYSTEM_SPEC.md](./SYSTEM_SPEC.md).
- **Päästökirjasto**: MVP:ssä seed-data; ei täyttä EPD-hallintaa.
- **Laskentatulos**: ei erillistä `calculation_results`-taulua; moduulit ja summat **lasketaan** API:ssa tuoterivien snapshot-kentistä (deterministinen, mutta ei erillistä materialisoitua riviä per lukitus).
- **OpenAPI vs. koodi**: clientti generoidaan speksistä; jos API muuttuu, päivitä `lib/api-spec/openapi.yaml` ja aja `pnpm --filter @workspace/api-spec run codegen`.

## Mikä toimii / tunnetut rajat

**Toimii (pääpolku):** kirjautuminen → projektit → rakennus → versiot → tuotteet → laskenta → validointi → lukitus → raporttivienti (README:n reittikuvauksen mukaan).

**Ei toteutettu / ei MVP:** IFC-tuonti, ulkoiset API:t, automaattinen kertoimen valinta, monen maan säännöt, täysi tenant-kohtainen EPD-kirjasto UI:lla.

**Huomio infrastruktuurista:** usean instanssin API vaatii jaetun session storen tai sticky sessionin; session-taulu PostgreSQLissa (`connect-pg-simple`) on jaettu store -lähtökohta.

## Workspace ja typecheck

Juuren `pnpm-workspace.yaml` sisältää `apps/*`, jotta `apps/web` ja `apps/api` ovat osa workspacea. Juuren `package.json` `typecheck`-skripti sisältää `./apps/**` (ja tarvittaessa `artifacts/**`), jotta typecheck kattaa pääsovellukset.
