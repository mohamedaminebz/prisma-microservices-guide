# Migration playbook

Everything here assumes the shared schema package owns `schema.prisma` and
`migrations/`, and that **only its CI runs `prisma migrate deploy`**. The
golden rule behind every recipe:

> Deploy the **expand** (additive, backward-compatible) part first, let every
> service roll out, then deploy the **contract** (removal) part later.

The repo's CI safety gate enforces this for the dangerous cases: it fails a
build that drops or renames without a written plan.

---

## 1. Add a new table (safe)

Adding a table nothing reads yet is always backward-compatible.

```prisma
// schema.prisma
model Category {
  id   String @id @default(uuid())
  name String @unique
  @@map("categories")
}
```

```bash
cd schema-package
npm run migrate:dev -- --name add_category   # generates the migration locally
```

```sql
-- migrations/20240103000000_add_category/migration.sql
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
```

Commit and push. The package CI applies it and publishes `1.5.0`. Services opt
in by bumping their dependency — **not** by running anything themselves.

---

## 2. Add a column (safe if it has a default or is nullable)

Adding `NOT NULL` **without** a `DEFAULT` to a table that already has rows
fails outright (Postgres errors with "column contains null values"), and the
backfill-then-`SET NOT NULL` workaround still takes an exclusive lock while
Postgres validates every row. Add the column nullable or with a default instead.

```prisma
// Good: a default means old rows and old services keep working.
quantity  Int @default(0)
// Good: nullable, then backfill, then set NOT NULL in a later migration.
sku       String?
```

```sql
-- migrations/20240104000000_add_sku/migration.sql
ALTER TABLE "items" ADD COLUMN "sku" TEXT NOT NULL DEFAULT '';
```

The safety gate **warns** (and with `--strict`, fails) on
`ADD COLUMN ... NOT NULL` without a default — the pattern that breaks on
populated tables.

---

## 3. Rename a column (expand → contract)

A rename is `DROP old` + `ADD new` in disguise: old services keep querying the
old name and will crash the instant it disappears. Do it in three deploys.

**Deploy 1 — expand (additive).** Add the new column, keep the old one.

```prisma
name  String   // old
title String?  // new, nullable for now
```

```sql
-- migrations/20240105000000_add_title/migration.sql
ALTER TABLE "items" ADD COLUMN "title" TEXT;
```

**Deploy 2 — backfill + dual-write (still additive).** Backfill and switch
writers to write both columns, then backfill again for stragglers.

```sql
-- migrations/20240106000000_backfill_title/migration.sql
UPDATE "items" SET "title" = "name" WHERE "title" IS NULL;
```

Application code writes to both `name` and `title` during this window.

**Deploy 3 — contract (destructive, needs a plan).** After every service reads
`title`, drop the old column — with the required approval comment:

```sql
-- migrations/20240120000000_drop_name/migration.sql
-- safety-check: approved
-- plan: "title" shipped 2024-01-05, backfilled 2024-01-06, dual-write in
--       place since, all services read "title" as of 2024-01-15.
-- rollback: re-add "name", backfill from "title", re-point readers.
ALTER TABLE "items" DROP COLUMN "name";
```

The safety gate **requires** that `-- safety-check: approved` plus a
`-- plan:` / `-- rollback:` comment (or a `plan.md` in the migration folder).
This is the friction that keeps "rename" from being a one-step disaster.

---

## 4. Drop a column or table (expand → contract)

Same shape as renaming: first make sure nothing reads it, then drop it with a
plan.

```sql
-- migrations/20240121000000_drop_legacy/migration.sql
-- safety-check: approved
-- plan: "legacy" table unwritten since 2024-01-01; last reader (service-c)
--       stopped on 2024-01-10.
-- rollback: restore from PITR backup taken before this migration.
DROP TABLE "legacy";
```

---

## 5. Change a column type (expand → contract)

`ALTER COLUMN ... TYPE` rewrites the column and locks the table. Prefer the
same expand-contract dance: add `name_new` with the new type, dual-write,
backfill, then drop `name`. The safety gate warns (and fails under `--strict`)
on `ALTER COLUMN ... TYPE`.

---

## Local workflow (schema owner)

```bash
# 1. Edit schema.prisma
# 2. Generate a migration against a local dev database
cd schema-package
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app npm run migrate:dev -- --name my_change
# 3. Review the generated SQL. Is it backward-compatible?
# 4. Run the safety gate (and its self-test) before committing.
npm run check:safety:strict
npm run test:safety
# 5. Commit, push. CI runs `prisma migrate deploy` on prod and publishes.
```

## Local workflow (service owner)

```bash
cd service-a
# Bump the dependency version, then just build (generate + build, no migrate):
npm run prod
```

Services never run `prisma migrate deploy`. Ever.
