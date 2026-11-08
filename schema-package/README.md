# @myorg/db-schema

Single source of truth for the shared database schema. This package owns
`schema.prisma`, every migration file, and exports a ready-to-use PrismaClient
singleton.

See the repository's main README for the full guide and rationale.

## Usage

```ts
import { prisma } from '@myorg/db-schema';

const items = await prisma.item.findMany({ include: { tags: true } });
```

`PrismaClient`, the generated types (`Item`, `Tag`, …), and the `Prisma`
namespace are all re-exported, so services never need to depend on
`@prisma/client` directly.

## The rules this package enforces

- **Only this package's CI** runs `prisma migrate deploy` against the shared
  database.
- Services import the client and **never** run migrations.
- Destructive migrations (drops, renames) must carry a written
  expand-contract plan, enforced by `scripts/check-migration-safety.ts`.

## Scripts

| Script | What it does |
|---|---|
| `npm run generate` | `prisma generate` from the schema |
| `npm run build` | generate + `tsc` |
| `npm run migrate:dev` | create/apply migrations locally |
| `npm run migrate:deploy` | apply migrations (CI only) |
| `npm run check:safety` / `check:safety:strict` | migration safety gate |
| `npm run test:safety` | self-test for the safety gate |
