// ─────────────────────────────────────────────────────────────────────────────
// Migration safety gate for the shared schema package.
//
// WHY THIS EXISTS
// ---------------
// Microservices share one database but deploy independently. A migration that
// drops or renames a column/table breaks every still-running service that
// references the old name. The fix is expand-contract: ship the new shape
// first (expand), migrate every reader/writer, then remove the old shape in a
// later migration (contract). This script is the enforcement point: it fails
// the build if a destructive migration ships without an explicit, human
// plan.
//
// RULES
// -----
// 1. DROP TABLE/COLUMN/CONSTRAINT/INDEX/...   -> error unless approved
// 2. RENAME COLUMN/TABLE/...                  -> error unless approved
// 3. ADD COLUMN ... NOT NULL (no DEFAULT)     -> warning (error with --strict)
// 4. ALTER COLUMN ... TYPE                    -> warning (error with --strict)
//
// APPROVAL
// --------
// A destructive migration is approved only when it carries, in a SQL comment:
//
//     -- safety-check: approved
//     -- plan: shipped "name_new" on 2024-01-10, all services migrated
//     -- rollback: re-add "name" and backfill from "name_new"
//
// or when its migration folder contains a `plan.md` describing the expand step
// that already shipped. This is deliberately tedious: it forces the contract
// phase to be a conscious, documented decision rather than an accident.
//
// USAGE
// -----
//   npx tsx scripts/check-migration-safety.ts [--dir ./migrations] [--strict] [--json]
//
// Exits 0 when safe, 1 when a destructive migration lacks a plan (or on any
// violation under --strict).
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Severity = 'error' | 'warning';

interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  file: string;
  line: number;
  sql: string;
}

interface Statement {
  text: string;
  line: number;
}

// A statement that removes something that still-running services depend on.
const DESTRUCTIVE_RE =
  /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|VIEW|SCHEMA|TYPE|FUNCTION|TRIGGER|SEQUENCE|DATABASE|MATERIALIZED\s+VIEW)\b/i;

// A rename breaks old code the same way a drop does (old name disappears).
const RENAME_RE =
  /\bRENAME\s+(?:COLUMN|TABLE|CONSTRAINT|INDEX)\b|\bRENAME\s+TO\b/i;

const ADD_COLUMN_RE = /\bADD\s+COLUMN\b/i;
const NOT_NULL_RE = /\bNOT\s+NULL\b/i;
const DEFAULT_RE = /\bDEFAULT\b/i;
const CREATE_TABLE_RE = /\bCREATE\s+TABLE\b/i;
const TYPE_CHANGE_RE =
  /\bALTER\s+COLUMN\b[^;]*?\b(?:TYPE|SET\s+DATA\s+TYPE)\b/i;

// The approval marker and a non-empty reason/plan must both be present.
const SAFE_MARKER_RE =
  /--\s*(?:migrate:safe|safety-check\s*:\s*(?:approved|ok|allowed)|expand-contract\s*:\s*contract)\b/i;
const REASON_RE =
  /--\s*(?:reason|plan|why|rollback|contract)\s*:\s*\S/i;

const MIN_PLAN_LENGTH = 40;

/**
 * Strip SQL line comments (`-- ...`) and block comments (`/ * ... * /`), and
 * split the remaining code into `;`-terminated statements while remembering
 * the original line number where each statement started.
 */
function stripComments(sql: string): Statement[] {
  const statements: Statement[] = [];
  let current = '';
  let currentLine = 0;
  let inBlock = false;

  const lines = sql.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];

    let code = '';
    let j = 0;
    while (j < raw.length) {
      if (inBlock) {
        const end = raw.indexOf('*/', j);
        if (end === -1) {
          j = raw.length; // still inside the block comment
        } else {
          inBlock = false;
          j = end + 2;
        }
        continue;
      }
      if (raw[j] === '-' && raw[j + 1] === '-') {
        break; // line comment: rest of the line is ignored
      }
      if (raw[j] === '/' && raw[j + 1] === '*') {
        inBlock = true;
        j += 2;
        continue;
      }
      code += raw[j];
      j += 1;
    }

    // Accumulate the statement text across lines, tracking the start line.
    for (let k = 0; k < code.length; k++) {
      const ch = code[k];
      if (ch === ';') {
        if (current.trim() !== '') {
          statements.push({ text: current.trim(), line: currentLine });
        }
        current = '';
        currentLine = 0;
      } else {
        if (currentLine === 0 && /\S/.test(ch)) {
          currentLine = lineNo;
        }
        current += ch;
      }
    }

    if (current !== '') {
      current += ' '; // keep tokens separated across lines
    }
  }

  if (current.trim() !== '') {
    statements.push({ text: current.trim(), line: currentLine });
  }
  return statements;
}

function isApproved(sql: string, migrationDir: string): boolean {
  if (SAFE_MARKER_RE.test(sql) && REASON_RE.test(sql)) {
    return true;
  }

  // A human-written plan file in the migration folder is an equivalent record.
  for (const name of ['plan.md', 'PLAN.md']) {
    const planPath = join(migrationDir, name);
    if (!existsSync(planPath)) {
      continue;
    }
    const plan = readFileSync(planPath, 'utf8').trim();
    if (plan.length >= MIN_PLAN_LENGTH) {
      return true;
    }
  }
  return false;
}

/**
 * Scan a migrations directory (a folder of timestamped migration folders,
 * each with a `migration.sql`). Returns every violation found.
 */
export function checkMigrations(
  migrationsDir: string,
  opts: { strict?: boolean } = {},
): { findings: Finding[]; migrations: number } {
  const findings: Finding[] = [];
  const root = resolve(migrationsDir);
  let migrationCount = 0;

  if (!existsSync(root)) {
    throw new Error(`Migrations directory not found: ${root}`);
  }

  const entries = readdirSync(root).filter((name) => {
    const full = join(root, name);
    return statSync(full).isDirectory();
  });

  for (const name of entries) {
    const dir = join(root, name);
    const sqlPath = join(dir, 'migration.sql');
    if (!existsSync(sqlPath)) {
      continue; // not a Prisma migration folder
    }
    migrationCount += 1;

    const sql = readFileSync(sqlPath, 'utf8');
    const file = `${name}/migration.sql`;
    const approved = isApproved(sql, dir);

    for (const stmt of stripComments(sql)) {
      if (DESTRUCTIVE_RE.test(stmt.text)) {
        if (!approved) {
          findings.push({
            severity: 'error',
            rule: 'destructive-migration',
            message:
              'Destructive statement with no expand-contract plan. Add `-- safety-check: approved` plus `-- plan:` / `-- rollback:` comments (or a plan.md) explaining the expand step that already shipped.',
            file,
            line: stmt.line,
            sql: stmt.text,
          });
          continue;
        }
      }

      if (RENAME_RE.test(stmt.text)) {
        if (!approved) {
          findings.push({
            severity: 'error',
            rule: 'rename-without-plan',
            message:
              'RENAME breaks old code. Expand-contract: add the new name, dual-write, then drop the old one in a later migration.',
            file,
            line: stmt.line,
            sql: stmt.text,
          });
        }
      }

      if (
        ADD_COLUMN_RE.test(stmt.text) &&
        NOT_NULL_RE.test(stmt.text) &&
        !DEFAULT_RE.test(stmt.text) &&
        !CREATE_TABLE_RE.test(stmt.text)
      ) {
        findings.push({
          severity: opts.strict ? 'error' : 'warning',
          rule: 'add-not-null-without-default',
          message:
            'ADD COLUMN ... NOT NULL with no DEFAULT fails on a non-empty table, and the backfill-then-`SET NOT NULL` fix takes an exclusive lock. Prefer: add nullable (or with a default), backfill, then `SET NOT NULL`.',
          file,
          line: stmt.line,
          sql: stmt.text,
        });
      }

      if (TYPE_CHANGE_RE.test(stmt.text)) {
        findings.push({
          severity: opts.strict ? 'error' : 'warning',
          rule: 'alter-column-type',
          message:
            'ALTER COLUMN ... TYPE rewrites the column and can lock the table. Prefer: add a new column, dual-write, then drop the old one.',
          file,
          line: stmt.line,
          sql: stmt.text,
        });
      }
    }
  }

  return { findings, migrations: migrationCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { dir: string; strict: boolean; json: boolean } {
  let dir = './migrations';
  let strict = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) {
      dir = argv[++i];
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--json') {
      json = true;
    }
  }
  return { dir, strict, json };
}

function main(): void {
  const { dir, strict, json } = parseArgs(process.argv.slice(2));
  const { findings, migrations } = checkMigrations(dir, { strict });

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  if (json) {
    process.stdout.write(
      JSON.stringify({ migrations, errors: errors.length, warnings: warnings.length, findings }, null, 2) + '\n',
    );
  } else {
    console.log(`\nMigration safety check — ${migrations} migration(s) in ${resolve(dir)}`);
    for (const f of findings) {
      const tag = f.severity === 'error' ? 'ERROR' : 'WARN ';
      console.log(`  [${tag}] ${f.rule} — ${f.file}:${f.line}`);
      console.log(`          ${f.sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
      console.log(`          ${f.message}\n`);
    }
    console.log(
      errors.length
        ? `FAIL — ${errors.length} error(s), ${warnings.length} warning(s).`
        : `PASS — no blocking violations${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`,
    );
  }

  process.exitCode = errors.length > 0 ? 1 : 0;
}

// Only run the CLI when this file is executed directly (not when imported by
// the self-test, which also imports `checkMigrations`).
const invokedPath = process.argv[1] ?? '';
const isMain =
  invokedPath.endsWith('check-migration-safety.ts') ||
  invokedPath.endsWith('check-migration-safety.js');

if (isMain) {
  main();
}
