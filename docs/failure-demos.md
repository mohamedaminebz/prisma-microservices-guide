# Failure demos: what goes wrong without this flow

These are the concrete failures the shared-schema-package pattern prevents.
Each one is reproducible in minutes, so you can see the pain — and then see the
fix.

---

## Demo 1 — Copying the schema causes drift

**The anti-pattern.** Every service keeps its own copy of `schema.prisma` and
its own migration files.

**What happens.**

1. `service-a` adds a `sku` column to its copy and migrates the database.
2. `service-b`'s copy still has no `sku`, so `prisma generate` produces a
   client without it.
3. A developer "fixes" `service-b` by copying the schema over… but forgets the
   migration, or copies a stale version, or copies a newer one that references
   a table `service-b` hasn't migrated yet.

**Symptoms.** Three services, three subtly different schemas. `prisma migrate
status` reports different histories in each repo. One service crashes on a
column that another service created. The database has tables nobody can
explain, and "which repo owns that migration?" has no answer.

**The fix.** Delete every service-level `schema.prisma` and `migrations/`.
Install `@myorg/db-schema` and import `{ prisma }` from it. Now there is one
schema, one migration history, one authority.

---

## Demo 2 — Dropping a column while old services run

**The anti-pattern.** A schema change drops or renames a column in a single
migration, and every service is assumed to redeploy instantly.

**What happens.**

1. `service-a` still runs the old code: `SELECT name FROM items`.
2. The schema package's CI runs `ALTER TABLE items DROP COLUMN name` (or
   `RENAME COLUMN name TO title`).
3. The *next* query from the old `service-a` returns
   `column items.name does not exist` — a production outage that lasts until
   that service redeploys, which it wasn't scheduled to do.

**Symptoms.** Errors begin **immediately** after the migration, not after a
deploy — which makes them easy to misdiagnose as "database down".

**The fix.** Expand-contract: ship `title` first (additive, safe), dual-write,
backfill, let every service move to `title`, and only then drop `name`. The
repo's safety gate refuses the drop in the first place unless the migration
carries the written plan that proves the expand step already happened.

---

## Demo 3 — Two services "migrate" the same database

**The anti-pattern.** Each service runs `prisma migrate deploy` in its own
startup or CI.

**What happens.**

1. `service-a` deploys first and applies migration `003`.
2. `service-b` deploys against a database where `003` is already applied — or
   worse, two services deploy simultaneously and both try to apply `003`.
3. Prisma's migration lock and `_prisma_migrations` table usually prevent a
   *second* application, but now you have two pipelines racing, partial
   application, and a deploy that fails because the "other" service won the
   race.

**Symptoms.** Flaky deploys, "already applied" errors, and no single place to
ask "is the database at the schema version my code expects?"

**The fix.** Exactly one pipeline — the schema package's — runs
`prisma migrate deploy`. Services only run `prisma generate` + build, and a CI
guard in `service-ci.yml` fails any service that tries to add a `migrate`
script.

---

## Demo 4 — Adding `NOT NULL` without a default breaks the migration

**The anti-pattern.** `ALTER TABLE items ADD COLUMN sku TEXT NOT NULL;` on a
table that already has rows.

**What happens.** The migration fails immediately — Postgres errors with
"column contains null values" — so the deploy breaks on any real table. The
"safe" version (add nullable, backfill, then `SET NOT NULL`) still takes an
`ACCESS EXCLUSIVE` lock while Postgres validates every row, so on a large table
that final step can block writes.

**The fix.** Add it nullable or with a default, backfill, then
`SET NOT NULL` in a later migration. The safety gate warns on this pattern
(and fails it under `--strict`).

---

## Try the failure demos against the safety gate

The safety gate ships with fixtures that encode these exact mistakes:

```bash
cd schema-package

# These fail (destructive, no plan):
npx tsx scripts/check-migration-safety.ts --dir scripts/fixtures/destructive-drop
npx tsx scripts/check-migration-safety.ts --dir scripts/fixtures/destructive-rename

# This passes (destructive, WITH a plan):
npx tsx scripts/check-migration-safety.ts --dir scripts/fixtures/approved-drop --strict

# This passes with a warning, and fails under --strict (blocking add):
npx tsx scripts/check-migration-safety.ts --dir scripts/fixtures/blocking-add
npx tsx scripts/check-migration-safety.ts --dir scripts/fixtures/blocking-add --strict

# Run all cases as an automated self-test:
npm run test:safety
```
