import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLedger, ledgerToSql, parseBudgetCsv, ReconciliationError, rollupBudget } from "../src/published.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${name} needs a value.`);
    process.exit(1);
  }
  return value;
}

function repeated(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== name) continue;
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      console.error(`${name} needs a value.`);
      process.exit(1);
    }
    values.push(value);
  }
  return values;
}

const apply = args.includes("--apply");
const revenuePath = flag("--revenue") || join(root, "sources", "revenue.json");
const reservesPath = flag("--reserves") || join(root, "sources", "reserves.json");
const beachPath = flag("--beach") || join(root, "sources", "beach-vending.json");
const csvPath = flag("--budget-csv");
const adoptedRaw = flag("--adopted-total");

try {
  const revenue = JSON.parse(readFileSync(revenuePath, "utf8")) as unknown;
  const reserves = JSON.parse(readFileSync(reservesPath, "utf8")) as unknown;
  const beach = JSON.parse(readFileSync(beachPath, "utf8")) as unknown;
  const ledger = buildLedger(revenue, reserves, beach);
  const incomeCents = ledger.income.reduce((sum, item) => sum + item.cents, 0);
  const incomePct = ledger.income.reduce((sum, item) => sum + item.pct, 0);
  if (incomeCents !== ledger.incomeTotalCents) {
    throw new ReconciliationError(`Income rows add to ${incomeCents} cents, not ${ledger.incomeTotalCents}.`);
  }
  if (Math.round(incomePct * 10) !== 1000) {
    throw new ReconciliationError(`Income percents add to ${incomePct.toFixed(1)}, not 100.`);
  }
  const reserveCents = ledger.reserves.classes.reduce((sum, item) => sum + item.cents, 0);
  if (reserveCents !== ledger.reserves.totalCents) {
    throw new ReconciliationError(`Reserve classes add to ${reserveCents} cents, not ${ledger.reserves.totalCents}.`);
  }
  console.log(`income_cents ${ledger.incomeTotalCents}`);
  console.log(`income_pct ${incomePct.toFixed(1)}`);
  console.log(`reserve_cents ${ledger.reserves.totalCents}`);
  console.log(`beach_lines ${ledger.beach.length}`);
  for (const year of ledger.budgets) {
    console.log(`budget_fy${year.fiscalYear}_adopted_cents ${year.adoptedCents}`);
  }

  if (csvPath) {
    const adoptedCents = adoptedRaw == null ? null : Math.round(Number(adoptedRaw) * 100);
    if (adoptedRaw != null && !Number.isFinite(adoptedCents)) {
      throw new ReconciliationError("--adopted-total must be a dollar amount.");
    }
    const lines = parseBudgetCsv(readFileSync(csvPath, "utf8"));
    const rollup = rollupBudget(lines, {
      excludeFunds: repeated("--exclude-fund"),
      adoptedTotalCents: adoptedCents,
    });
    console.log(`budget_csv_income_lines ${rollup.income.length}`);
    console.log(`budget_csv_kept_cents ${rollup.keptCents}`);
    console.log(`budget_csv_transfer_cents ${rollup.transferCents}`);
    console.log(`budget_csv_excluded_cents ${rollup.excludedCents}`);
    for (const row of rollup.income) console.log(`budget_csv ${row.label} ${row.cents}`);
  }

  const outDir = join(tmpdir(), "budget-explorer-seed");
  mkdirSync(outDir, { recursive: true });
  const sqlPath = join(outDir, "published.sql");
  writeFileSync(sqlPath, ledgerToSql(ledger));
  console.log(`wrote ${sqlPath}`);

  if (apply) {
    const dbFile = findLocalDb(root);
    execFileSync("sqlite3", [dbFile, `.read ${sqlPath}`], { stdio: "inherit" });
    const check = execFileSync(
      "sqlite3",
      [dbFile, "SELECT printf('%d', SUM(amount_cents)) FROM published_amounts WHERE section = 'income';"],
      { encoding: "utf8" },
    );
    console.log(`local_income_cents ${check.trim()}`);
  }
} catch (error) {
  if (error instanceof ReconciliationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

function findLocalDb(projectRoot: string): string {
  const dir = join(projectRoot, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  if (files.length !== 1) {
    throw new Error("Expected one local D1 database. Run scripts/seed-local.sh so wrangler can create it, then run this script with --apply.");
  }
  return join(dir, files[0]);
}
