// ─────────────────────────────────────────────────────────────────────────────
// Self-test for the migration safety gate.
//
// Runs the checker against small fixture "migrations" folders and asserts the
// expected outcome. This is what makes the safety check *provably* functional
// rather than pseudocode, and it doubles as the demo:
//
//   npx tsx scripts/verify-safety-check.ts
//   npx tsx scripts/check-migration-safety.ts --dir scripts/fixtures/destructive-drop
//
// Exits 0 only when every expectation holds.
// ─────────────────────────────────────────────────────────────────────────────

import { resolve } from 'node:path';
import { checkMigrations } from './check-migration-safety';

interface Case {
  name: string;
  dir: string;
  strict: boolean;
  expectErrors: number;
  expectWarnings: number;
}

function fixtureDir(name: string): string {
  return resolve(__dirname, 'fixtures', name);
}

const cases: Case[] = [
  {
    name: 'additive migrations pass cleanly',
    dir: fixtureDir('safe'),
    strict: true,
    expectErrors: 0,
    expectWarnings: 0,
  },
  {
    name: 'DROP COLUMN without a plan is rejected',
    dir: fixtureDir('destructive-drop'),
    strict: false,
    expectErrors: 1,
    expectWarnings: 0,
  },
  {
    name: 'RENAME COLUMN without a plan is rejected',
    dir: fixtureDir('destructive-rename'),
    strict: false,
    expectErrors: 1,
    expectWarnings: 0,
  },
  {
    name: 'DROP TABLE with an approval plan passes',
    dir: fixtureDir('approved-drop'),
    strict: true,
    expectErrors: 0,
    expectWarnings: 0,
  },
  {
    name: 'ADD COLUMN NOT NULL without DEFAULT is a warning, not an error',
    dir: fixtureDir('blocking-add'),
    strict: false,
    expectErrors: 0,
    expectWarnings: 1,
  },
  {
    name: 'ADD COLUMN NOT NULL without DEFAULT fails under --strict',
    dir: fixtureDir('blocking-add'),
    strict: true,
    expectErrors: 1,
    expectWarnings: 0,
  },
];

let failed = 0;
for (const c of cases) {
  const { findings } = checkMigrations(c.dir, { strict: c.strict });
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  const ok = errors === c.expectErrors && warnings === c.expectWarnings;
  const marker = ok ? 'PASS' : 'FAIL';
  console.log(
    `[${marker}] ${c.name} (strict=${c.strict}) -> errors=${errors} warnings=${warnings}`,
  );
  if (!ok) {
    failed += 1;
    for (const f of findings) {
      console.log(`        ${f.severity} ${f.rule} @ ${f.file}:${f.line}`);
    }
    console.log(
      `        expected errors=${c.expectErrors} warnings=${c.expectWarnings}`,
    );
  }
}

console.log(
  failed === 0
    ? `\nAll ${cases.length} safety-check cases passed.`
    : `\n${failed}/${cases.length} safety-check cases FAILED.`,
);
process.exitCode = failed === 0 ? 0 : 1;
