# Approaches: how to share a Prisma schema across services

There are three common ways to give several services access to one database
schema with Prisma. This repo demonstrates **option 2**. This page compares the
three honestly, because none of them is universally right.

| | 1. Monorepo shared package | 2. Separate repos + npm package (this repo) | 3. Each service owns its tables |
|---|---|---|---|
| **Where the schema lives** | One repo, one `schema.prisma` | A dedicated `schema-package` repo | A `schema.prisma` per service |
| **Single source of truth** | ✅ yes | ✅ yes | ❌ no — split by table |
| **Migration authority** | One pipeline | One pipeline (the package) | Every service migrates its own tables |
| **Deploy coupling** | Often coupled | Independent | Independent |
| **Setup cost** | Low once in a monorepo | Medium (publishing/versioning) | Low, but risky |
| **Best for** | One team, one repo already | Several teams, separate repos, shared DB | Services with truly disjoint data |

---

## Option 1 — Monorepo, shared package

All services and the schema live in one repository. A shared package owns
`schema.prisma` and the migrations, and every service imports it.

**Strengths**

- One place to read the whole truth; atomic cross-service changes are easy.
- No publishing step; changes are visible to everyone immediately.
- Tooling (TypeScript project references, Turborepo/Nx, etc.) can wire it up.

**Weaknesses**

- Forces every team into one repo and one release cadence.
- "Shared everything" invites tight coupling: a schema change can force a
  coordinated redeploy of every service.
- Large monorepos need real investment in CI caching and build tooling.

**Pick it when** you are already a monorepo, or the services and schema are
owned by one team that ships together.

---

## Option 2 — Separate repos, published schema package ✅ (this repo)

The schema lives in its own repo and is published as a private npm package
(e.g. `@myorg/db-schema`). Each service installs it as a normal dependency.

**Strengths**

- A true single source of truth with **no monorepo tooling**.
- Each service stays a small, independent repo with its own release cadence.
- Versioning makes the schema contract explicit: `service-a` can be on
  `@myorg/db-schema@1.3.0` while `service-b` is still on `1.2.0`.
- The migration authority is unambiguous: only the package's CI runs
  `prisma migrate deploy`.

**Weaknesses**

- You must publish and version the package, and bump each service (a small
  but real operational cost — soften it with Renovate/Dependabot).
- The "expand" phase still needs care: old service versions keep running
  against the new schema, so migrations must be backward-compatible.
- There is a coordination cost for *contract* migrations (dropping/renaming).

**Pick it when** you have genuinely separate repos that share a database —
exactly the pain this repo is built to solve.

---

## Option 3 — Each service owns its own tables (schema-per-service)

Each service keeps a `schema.prisma` describing **only** the tables it owns,
and runs its own migrations.

**Strengths**

- Maximum autonomy: a team changes its tables without talking to anyone.
- No cross-service coordination for simple additive changes.

**Weaknesses**

- There is no shared truth; a table's owner is often unclear in practice.
- Cross-service joins become impossible (or happen in application code).
- Foreign keys between services' tables become a coordination nightmare.
- Drift is almost guaranteed over time, and "who ran which migration?" returns.

**Pick it when** your services genuinely own disjoint data (different domains,
different databases, or a hard "no shared tables" boundary). It is a *data
architecture* choice, not a convenience.

---

## Why option 2 is usually the right answer for "separate repos + shared DB"

If the services already live in separate repos and already share one database,
option 2 gives you the single source of truth **without** forcing a monorepo
migration. The two things that make it actually work in production are the two
things this repo highlights:

1. **One migration authority** — only the schema package's CI runs
   `prisma migrate deploy`. A migration can never be applied twice, or by the
   wrong service, or in the wrong order.
2. **Backward compatibility by default** — expand-contract migrations plus a
   CI gate that refuses destructive changes without a plan.

Without those two, option 2 degenerates back into the drift problem it was
meant to solve.
