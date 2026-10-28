import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_HIDDEN_PAYROLL_CENTS,
  MIN_HIDDEN_PAYROLL_LINES,
  OTHER_PAYROLL_LABEL,
  PAYROLL_BATCH_LABEL,
  SHOW_PERSON_NAMES_DEFAULT,
  filterAnswer,
  payrollReadSql,
  scrubLastFirstPersons,
  searchLines,
  setShowPersonNames,
  showPersonNames,
  showPersonNamesFromForm,
} from "../src/access";
import { commaPersonSql, isCommaPersonName, looksLikePersonName, sqlIsPersonName } from "../src/parser";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { publishImport, saveImport } from "../src/db";
import { parseReport } from "../src/parser";

const REPORT = `Walton County
YEAR-TO-DATE BUDGET REPORT
Report generated: 09/15/2026 13:23

ACCOUNTS FOR: 001 GENERAL FUND

00101000 SAMPLE DEPARTMENT

00101000 512000                    REGULAR SALARIES & WAGES
                      500.00                    0.00             500.00            150.00              0.00           350.00           30.0%

  2026/01/000441 10/10/2025 PRJ                      100.00 REF 251010 WARRANT=251010      RUN=1 REGULAR JANE Q PUBLIC
  2026/01/000442 10/10/2025 PRJ                       50.00 REF 251010 WARRANT=251010      RUN=1 REGULAR JOHN Q SMITH
  2026/12/000999 09/20/2026 PRJ                       75.00 REF 999 WARRANT=999      RUN=1 REGULAR LATE Q PERSON

00101000 531000                    CONTRACTUAL SERVICES
                       20.00                    0.00              20.00             20.00              0.00             0.00          100.0%

  2026/04/000401 12/03/2025 API                       20.00 VND 000777 IN INV-P        JANE Q PUBLIC        NOTE              500000777
`;

function openDb(): { raw: DatabaseSync; db: D1Database } {
  const raw = new DatabaseSync(":memory:");
  const root = join(import.meta.dirname, "..", "migrations");
  raw.exec(readFileSync(join(root, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(root, "0002_settings.sql"), "utf8"));
  raw.exec(readFileSync(join(root, "0003_revenue_reserves.sql"), "utf8"));
  const db = {
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      let bound: unknown[] = [];
      const api = {
        bind(...args: unknown[]) {
          bound = args;
          return api;
        },
        async first<T>(): Promise<T | null> {
          return (stmt.get(...(bound as never[])) as T | undefined) ?? null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: stmt.all(...(bound as never[])) as T[] };
        },
        async run() {
          const info = stmt.run(...(bound as never[]));
          return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
        },
      };
      return api;
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return { raw, db: db as unknown as D1Database };
}

function envFor(db: D1Database) {
  return {
    DB: db,
    AI: {
      async run() {
        return { response: "JANE Q PUBLIC was paid $100.00 and JOHN Q SMITH was paid $50.00." };
      },
    },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

async function cookie(admin: boolean, secret = "session-secret"): Promise<{ header: string; csrf: string }> {
  const session = newSession(admin);
  const token = await signSession(secret, session);
  return { header: `be_session=${token}`, csrf: session.csrf };
}

describe("person names switch", () => {
  it("defaults to shown from one constant when settings has no row", async () => {
    expect(SHOW_PERSON_NAMES_DEFAULT).toBe(true);
    const { db } = openDb();
    expect(await showPersonNames(db)).toBe(SHOW_PERSON_NAMES_DEFAULT);
    expect(payrollReadSql(false).includes("employee_name")).toBe(false);
    expect(payrollReadSql(true).includes("employee_name")).toBe(true);
    expect(showPersonNamesFromForm(["0", "1"])).toBe(true);
    expect(showPersonNamesFromForm("0")).toBe(false);
    expect(filterAnswer("JANE Q PUBLIC was paid $100.00", ["JANE Q PUBLIC"], ["$100.00", "100.00"])).not.toContain("JANE");
    expect(filterAnswer("JANE Q PUBLIC was paid $100.00", ["JANE Q PUBLIC"], ["$100.00", "100.00"])).not.toContain("100.00");
    const kept = filterAnswer("batch $150.00 and line $50.00.", [], ["$50.00", "50.00"]);
    expect(kept).toContain("$150.00");
    expect(kept).not.toContain("$50.00");
  });

  it("requires an unlocked admin and CSRF, and hidden mode strips names and individual pay", async () => {
    const { raw, db } = openDb();
    const parsed = parseReport(REPORT);
    expect(parsed.payrollLines.map((line) => line.employeeName)).toEqual(["JANE Q PUBLIC", "JOHN Q SMITH", "LATE Q PERSON"]);
    const id = await saveImport(db, parsed, "sample.txt");
    await publishImport(db, id);
    const storedNames = raw.prepare("SELECT employee_name FROM payroll_lines ORDER BY id").all() as { employee_name: string }[];
    expect(storedNames.map((row) => row.employee_name)).toContain("JANE Q PUBLIC");

    const env = envFor(db);
    const reader = await cookie(false);
    const admin = await cookie(true);
    const headers = (cookieHeader: string) => ({ cookie: cookieHeader });

    const shownSearch = await app.request("http://localhost/search?q=JANE", { headers: headers(reader.header) }, env);
    const shownHtml = await shownSearch.text();
    expect(shownHtml).toContain("JANE Q PUBLIC");
    expect(shownHtml).toContain("$100.00");

    const shownDrill = await app.request("http://localhost/departments/00101000/512000/_", { headers: headers(reader.header) }, env);
    const shownDrillHtml = await shownDrill.text();
    expect(shownDrillHtml).toContain("name from county report");
    expect(shownDrillHtml).toContain("JANE Q PUBLIC");
    expect(shownDrillHtml).toContain("JOHN Q SMITH");
    expect(shownDrillHtml).toContain("$100.00");
    expect(shownDrillHtml).toContain("$50.00");
    expect(shownDrillHtml).not.toContain("LATE Q PERSON");

    const shownCsv = await app.request("http://localhost/search.csv?q=JANE", { headers: headers(reader.header) }, env);
    const shownCsvText = await shownCsv.text();
    expect(shownCsvText).toContain("JANE Q PUBLIC");
    expect(shownCsvText).toContain("100.00");
    expect(shownCsvText).not.toContain("'-100.00");

    const shownAsk = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: reader.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: reader.csrf, question: "JANE Q PUBLIC payroll" }),
    }, env);
    const shownAnswer = await shownAsk.text();
    expect(shownAnswer).toContain("JANE Q PUBLIC");
    expect(shownAnswer).toContain("$100.00");

    const stranger = await cookie(false);
    const denied = await app.request("http://localhost/admin/settings", {
      method: "POST",
      headers: { cookie: stranger.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: stranger.csrf, show_person_names: "0" }),
    }, env);
    expect(denied.status).not.toBe(303);
    expect(await showPersonNames(db)).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM settings_log").get()).toEqual({ n: 0 });

    const badCsrf = await app.request("http://localhost/admin/settings", {
      method: "POST",
      headers: { cookie: admin.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: "not-the-token", show_person_names: "0" }),
    }, env);
    expect(badCsrf.status).toBe(403);
    expect(await showPersonNames(db)).toBe(true);

    const adminPage = await app.request("http://localhost/admin", { headers: headers(admin.header) }, env);
    const adminHtml = await adminPage.text();
    expect(adminHtml).toContain("Show person names and individual pay");
    expect(adminHtml).toContain("Current state: on");

    const saved = await app.request("http://localhost/admin/settings", {
      method: "POST",
      headers: { cookie: admin.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: admin.csrf, show_person_names: "0" }),
    }, env);
    expect(saved.status).toBe(303);
    expect(await showPersonNames(db)).toBe(false);
    const log = raw.prepare("SELECT value, changed_at FROM settings_log").get() as { value: string; changed_at: string };
    expect(log.value).toBe("0");
    expect(log.changed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const after = await app.request("http://localhost/admin", { headers: headers(admin.header) }, env);
    expect(await after.text()).toContain("Current state: off");
    expect((raw.prepare("SELECT employee_name FROM payroll_lines WHERE employee_name = 'JANE Q PUBLIC'").get() as { employee_name: string }).employee_name).toBe("JANE Q PUBLIC");

    const hiddenSearch = await app.request("http://localhost/search?q=JANE", { headers: headers(reader.header) }, env);
    const hiddenSearchHtml = await hiddenSearch.text();
    expect(hiddenSearchHtml).toContain("0 payments found");
    expect(hiddenSearchHtml).not.toContain("JANE Q PUBLIC");
    expect(hiddenSearchHtml).not.toContain("JOHN");
    expect(hiddenSearchHtml).not.toContain("$100.00");
    expect(hiddenSearchHtml).not.toContain("$50.00");

    const hiddenDrill = await app.request("http://localhost/departments/00101000/512000/_", { headers: headers(reader.header) }, env);
    const hiddenDrillHtml = await hiddenDrill.text();
    expect(hiddenDrillHtml).toContain("$150.00");
    expect(hiddenDrillHtml).not.toContain('class="name">Payroll (batch total)');
    expect(hiddenDrillHtml).not.toContain('class="name">Other payroll');
    expect(hiddenDrillHtml).not.toContain("JANE");
    expect(hiddenDrillHtml).not.toContain("JOHN");
    expect(hiddenDrillHtml).not.toContain("LATE");
    expect(hiddenDrillHtml).not.toContain("$100.00");
    expect(hiddenDrillHtml).not.toContain("$50.00");
    expect(hiddenDrillHtml).not.toContain("$75.00");

    const hiddenCsv = await app.request("http://localhost/search.csv", { headers: headers(reader.header) }, env);
    const hiddenCsvText = await hiddenCsv.text();
    expect(hiddenCsvText).not.toContain("Payroll (batch total)");
    expect(hiddenCsvText).not.toContain("150.00");
    expect(hiddenCsvText).not.toContain("JANE");
    expect(hiddenCsvText).not.toContain("JOHN");
    expect(hiddenCsvText).not.toMatch(/(^|,)100\.00(?:,|\r|\n|$)/);
    expect(hiddenCsvText).not.toMatch(/(^|,)50\.00(?:,|\r|\n|$)/);
    expect(hiddenCsvText).not.toMatch(/(^|,)75\.00(?:,|\r|\n|$)/);
    expect(hiddenCsvText).toContain("Name withheld");

    const asker = await cookie(false);
    const hiddenAsk = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: asker.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: asker.csrf, question: "What payroll wages were paid" }),
    }, env);
    const hiddenAnswer = await hiddenAsk.text();
    expect(hiddenAnswer).not.toContain("JANE");
    expect(hiddenAnswer).not.toContain("JOHN");
    expect(hiddenAnswer).not.toContain("$100.00");
    expect(hiddenAnswer).not.toContain("$50.00");
    expect(hiddenAnswer).not.toContain("Payroll (batch total)");
    expect(hiddenAnswer).not.toContain("LATE");
  });
});

const PERSON_SAMPLES: [string, boolean][] = [
  ["Jane Q Public", true],
  ["Jane Q. Public", true],
  ["Mary Anne Jane Public", true],
  ["Jane Q Public Jr", true],
  ["Jane Public Sr", true],
  ["John Public II", true],
  ["John Smith III", true],
  ["Jane & John Smith", true],
  ["Jane Q Public 2", true],
  ["Holmes, Casey S.", true],
  ["ACME SUPPLY CO", false],
  ["Florida Power & Light Inc", false],
  ["SAMPLE COUNTY HOUSING AUTHORITY", false],
  ["INV-2024998877", false],
  ["PO 123456", false],
];

describe("person check at read time", () => {
  it("treats a vendor as a person unless it is clearly an organization", () => {
    for (const [name, person] of PERSON_SAMPLES) {
      expect(looksLikePersonName(name), name).toBe(person);
    }
    expect(MIN_HIDDEN_PAYROLL_LINES).toBe(3);
    expect(MIN_HIDDEN_PAYROLL_CENTS).toBeGreaterThanOrEqual(50_000);
    const commaSamples: [string, boolean][] = [
      ["PUBLIC, JANE Q", true],
      ["Holmes, Casey S.", true],
      ["WASTE MANAGEMENT", false],
      ["ZEHNDER COMMUNICATIO", false],
      ["JM PHELPS CONSTRUCTI", false],
      ["ADKINSON LAW FIRM", false],
      ["SMITH, JOHN LLC", false],
      ["LOWE'S HOME CENTERS,", false],
      ["ACME, INC", false],
      ["Jane Q Public", false],
      ["FLORIDA DEPARTMENT O", false],
      ["C.W. ROBERTS CONTRAC", false],
    ];
    const { raw } = openDb();
    raw.exec("CREATE TABLE comma_party (name TEXT)");
    const read = raw.prepare(`SELECT ${commaPersonSql("name")} AS person FROM comma_party`);
    const insert = raw.prepare("INSERT INTO comma_party (name) VALUES (?)");
    for (const [name, person] of commaSamples) {
      expect(isCommaPersonName(name), name).toBe(person);
      insert.run(name);
      const row = read.get() as { person: number };
      expect(Boolean(row.person), name).toBe(person);
      raw.exec("DELETE FROM comma_party");
    }
  });

  it("uses the same person rule in SQL, including rows stored with the flag at 0", async () => {
    const { raw, db } = openDb();
    raw.exec("CREATE TABLE party (name TEXT, is_person_name INTEGER)");
    const read = raw.prepare(`SELECT ${sqlIsPersonName("name")} AS person FROM party`);
    const insert = raw.prepare("INSERT INTO party (name, is_person_name) VALUES (?, 0)");
    for (const [name, person] of PERSON_SAMPLES) {
      insert.run(name);
      expect(read.get(), name).toEqual({ person: person ? 1 : 0 });
      raw.exec("DELETE FROM party");
    }

    const id = await saveImport(db, parseReport(REPORT), "sample.txt");
    await publishImport(db, id);
    raw.exec(`UPDATE payments SET is_person_name = 0`);
    const addPayment = raw.prepare(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, pay_date, source, amount_cents,
      vendor_name, description, after_cutoff, dedupe_key, is_person_name
    ) VALUES (?, '001', '00101000', '531000', '', '2026-04-04', 'API', 2100, ?, '', 0, ?, 0)`);
    addPayment.run(id, "Mary Anne Jane Public", "four-word");
    addPayment.run(id, "John Smith III", "suffix-iii");
    addPayment.run(id, "Jane Public Sr", "suffix-sr");
    addPayment.run(id, "John Public II", "suffix-ii");
    addPayment.run(id, "Jane & John Smith", "ampersand");
    addPayment.run(id, "Jane Q Public 2", "digits");
    addPayment.run(id, "ACME SUPPLY CO", "org");
    const env = envFor(db);
    const reader = await cookie(false);
    const headers = { cookie: reader.header };
    await setShowPersonNames(db, false);
    const org = await app.request("http://localhost/search?q=ACME", { headers }, env);
    expect(await org.text()).toContain("Acme Supply Co");
    for (const query of ["Jane", "Mary", "Smith", "John"]) {
      const page = await app.request(`http://localhost/search?q=${query}`, { headers }, env);
      const html = await page.text();
      expect(html, query).toContain("0 payments found");
      expect(html, query).not.toContain("Mary Anne Jane Public");
      expect(html, query).not.toContain("John Smith III");
      expect(html, query).not.toContain("Jane &amp; John Smith");
      expect(html, query).not.toContain("Jane Q Public 2");
    }
  });
});

describe("hidden payroll groups", () => {
  it("hides 1 and 2 line groups and keeps a group that clears the minimum", async () => {
    const { raw, db } = openDb();
    const id = await saveImport(db, parseReport(REPORT), "sample.txt");
    await publishImport(db, id);
    raw.exec(`INSERT INTO accounts (
      import_id, fund_code, dept_code, object_code, project_code, title, is_payroll, line_count
    ) VALUES
      (${id}, '001', '00101000', '513000', '', 'CREW PAY', 0, 13),
      (${id}, '001', '00101000', '514000', '', 'SOLO PAY', 0, 1),
      (${id}, '001', '00101000', '515000', '', 'PAIR PAY', 0, 2)`);
    const insert = raw.prepare(`INSERT INTO payroll_lines (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, employee_name, batch_key, description, after_cutoff, dedupe_key
    ) VALUES (?, '001', '00101000', ?, '', ?, ?, 'PRJ', ?, ?, ?, '', 0, ?)`);
    const add = (objectCode: string, batch: string, date: string, cents: number, name: string) => {
      insert.run(id, objectCode, `J-${batch}-${name}`, date, cents, name, batch, `${objectCode}-${batch}-${name}`);
    };
    add("514000", "solo", "2026-01-05", 250_000, "Solo Person");
    add("515000", "pair", "2026-02-05", 80_000, "Pair One");
    add("515000", "pair", "2026-02-05", 90_000, "Pair Two");
    add("513000", "crew", "2026-04-05", 50_000, "Crew One");
    add("513000", "crew", "2026-04-05", 50_000, "Crew Two");
    add("513000", "crew", "2026-04-05", 50_000, "Crew Three");
    add("513000", "tiny", "2026-03-05", 1_000, "Tiny One");
    add("513000", "tiny", "2026-03-05", 1_000, "Tiny Two");
    add("513000", "tiny", "2026-03-05", 1_000, "Tiny Three");
    for (const key of ["s1", "s2", "s3", "s4"]) add("513000", key, "2026-05-05", 40_000, `Single ${key}`);

    const env = envFor(db);
    const reader = await cookie(false);
    const headers = { cookie: reader.header };
    const shownSolo = await app.request("http://localhost/departments/00101000/514000/_", { headers }, env);
    const shownSoloHtml = await shownSolo.text();
    expect(shownSoloHtml).toContain("Solo Person");
    expect(shownSoloHtml).toContain("$2,500.00");

    await setShowPersonNames(db, false);
    const solo = await app.request("http://localhost/departments/00101000/514000/_", { headers }, env);
    const soloHtml = await solo.text();
    expect(soloHtml).not.toContain("Solo Person");
    expect(soloHtml).not.toContain("$2,500.00");
    expect(soloHtml).not.toContain(PAYROLL_BATCH_LABEL);
    expect(soloHtml).not.toContain(OTHER_PAYROLL_LABEL);

    const pair = await app.request("http://localhost/departments/00101000/515000/_", { headers }, env);
    const pairHtml = await pair.text();
    expect(pairHtml).not.toContain("Pair One");
    expect(pairHtml).not.toContain("Pair Two");
    expect(pairHtml).not.toContain("$800.00");
    expect(pairHtml).not.toContain("$900.00");
    expect(pairHtml).not.toContain("$1,700.00");
    expect(pairHtml).not.toContain('class="name">Payroll (batch total)');
    expect(pairHtml).not.toContain('class="name">Other payroll');

    const crew = await app.request("http://localhost/departments/00101000/513000/_", { headers }, env);
    const crewHtml = await crew.text();
    expect(crewHtml).toContain('class="name">Payroll (batch total)');
    expect(crewHtml).toContain("$1,500.00");
    expect(crewHtml).toContain('class="name">Other payroll');
    expect(crewHtml).toContain("$1,630.00");
    expect(crewHtml).not.toContain("Crew One");
    expect(crewHtml).not.toContain("Single s1");
    expect(crewHtml).not.toContain("$500.00");
    expect(crewHtml).not.toContain("$400.00");
    expect(crewHtml).not.toContain("$10.00");
    expect(crewHtml).not.toContain("$30.00");
  });
});

describe("description person names", () => {
  it("scrubs Last, First description names only when names are hidden", async () => {
    expect(scrubLastFirstPersons("Doe, Jamie")).toBe("");
    expect(scrubLastFirstPersons("Miller, Rowan K.")).toBe("");
    expect(scrubLastFirstPersons("Nguyen, Quinn Jr")).toBe("");
    expect(scrubLastFirstPersons("Holmes, Casey S.")).toBe("");
    expect(scrubLastFirstPersons("Services, supplies")).toBe("Services, supplies");
    expect(scrubLastFirstPersons("Rent help for Doe, Jamie unit 4")).toBe("Rent help for unit 4");

    const { raw, db } = openDb();
    const id = await saveImport(db, parseReport(REPORT), "sample.txt");
    await publishImport(db, id);
    raw.exec(`INSERT INTO accounts (
      import_id, fund_code, dept_code, object_code, project_code, title, is_payroll
    ) VALUES (${id}, '001', '00101000', '534000', '', 'HOUSING ASSISTANCE', 0)`);
    const insert = raw.prepare(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key, is_person_name
    ) VALUES (?, '001', '00101000', '534000', '', ?, '2026-04-04', 'API', ?, '9', ?, ?, '600000111', ?, 0, ?, 0)`);
    insert.run(id, "J-1", 4200, "SAMPLE COUNTY HOUSING AUTHORITY", "INV-H1", "Doe, Jamie", "h1");
    insert.run(id, "J-2", 4300, "SAMPLE COUNTY HOUSING AUTHORITY", "INV-H2", "Miller, Rowan K.", "h2");
    insert.run(id, "J-3", 4400, "SAMPLE COUNTY HOUSING AUTHORITY", "INV-H3", "Nguyen, Quinn Jr", "h3");
    insert.run(id, "J-4", 4500, "SAMPLE COUNTY HOUSING AUTHORITY", "INV-H4", "Services, supplies", "h4");
    insert.run(id, "J-5", 4600, "Mary Anne Jane Public", "INV-H5", "Jane & John Smith", "h5");
    insert.run(id, "J-6", 4700, "ACME SUPPLY CO", "INV-H6", "monthly pest control", "h6");

    const env = envFor(db);
    env.AI = {
      async run() {
        return { response: "Posted for Doe, Jamie and Miller, Rowan K. and Nguyen, Quinn Jr." };
      },
    };
    const reader = await cookie(false);
    const headers = { cookie: reader.header };

    const shown = await app.request("http://localhost/search?q=housing", { headers }, env);
    const shownHtml = await shown.text();
    expect(shownHtml).toContain("Doe, Jamie");
    expect(shownHtml).toContain("Miller, Rowan K.");
    expect(shownHtml).toContain("Nguyen, Quinn Jr");
    expect(shownHtml).toContain("Services, supplies");
    expect(shownHtml).toContain("Sample County Housing Authority");
    const shownPerson = await app.request("http://localhost/search?q=Mary", { headers }, env);
    expect(await shownPerson.text()).toContain("Mary Anne Jane Public");
    const shownOrg = await app.request("http://localhost/search?q=ACME", { headers }, env);
    expect(await shownOrg.text()).toContain("Acme Supply Co");

    await setShowPersonNames(db, false);
    const hidden = await app.request("http://localhost/search?q=housing", { headers }, env);
    const hiddenHtml = await hidden.text();
    expect(hiddenHtml).toContain("Sample County Housing Authority");
    expect(hiddenHtml).toContain("Services, supplies");
    expect(hiddenHtml).not.toContain("Doe, Jamie");
    expect(hiddenHtml).not.toContain("Jamie");
    expect(hiddenHtml).not.toContain("Miller, Rowan");
    expect(hiddenHtml).not.toContain("Nguyen, Quinn");
    const hiddenOrg = await app.request("http://localhost/search?q=ACME", { headers }, env);
    expect(await hiddenOrg.text()).toContain("Acme Supply Co");
    const hiddenPerson = await app.request("http://localhost/search?q=Mary", { headers }, env);
    const hiddenPersonHtml = await hiddenPerson.text();
    expect(hiddenPersonHtml).toContain("0 payments found");
    expect(hiddenPersonHtml).not.toContain("Mary Anne");

    const drill = await app.request("http://localhost/departments/00101000/534000/_", { headers }, env);
    const drillHtml = await drill.text();
    expect(drillHtml).not.toContain("Doe, Jamie");
    expect(drillHtml).not.toContain("Miller, Rowan");
    expect(drillHtml).not.toContain("Nguyen, Quinn");
    expect(drillHtml).not.toContain("Mary Anne");
    expect(drillHtml).not.toContain("Jane &amp; John");
    expect(drillHtml).toContain("Services, supplies");
    expect(drillHtml).toContain("Sample County Housing Authority");
    expect(drillHtml).toContain("Name withheld");
    expect(drillHtml).toContain("Acme Supply Co");

    const csv = await app.request("http://localhost/search.csv?q=housing", { headers }, env);
    const csvText = await csv.text();
    expect(csvText).not.toContain("Doe, Jamie");
    expect(csvText).not.toContain("Miller, Rowan");
    expect(csvText).not.toContain("Nguyen, Quinn");
    expect(csvText).not.toContain("Mary Anne");
    expect(csvText).toContain("Services, supplies");
    expect(csvText).toContain("Sample County Housing Authority");
    expect(csvText).not.toContain("Doe, Jamie");

    const asker = await cookie(false);
    const asked = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: asker.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: asker.csrf, question: "housing authority assistance" }),
    }, env);
    const answer = await asked.text();
    expect(answer).not.toContain("Doe, Jamie");
    expect(answer).not.toContain("Miller, Rowan");
    expect(answer).not.toContain("Nguyen, Quinn");
    expect(answer).toContain("SAMPLE COUNTY HOUSING AUTHORITY");
  });
});

describe("hidden name scrub speed", () => {
  it("scrubs two thousand rows with one cached matcher", async () => {
    const { raw, db } = openDb();
    raw.exec(`INSERT INTO imports (id, created_at, status, published_at, data_as_of, filename, payment_count, payroll_line_count)
      VALUES (1, '2026-01-01T00:00:00Z', 'published', '2026-01-01T00:00:00Z', '2026-09-15', 'speed.txt', 2000, 2000)`);
    const pay = raw.prepare(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, pay_date, source, amount_cents,
      vendor_name, description, after_cutoff, dedupe_key, is_person_name
    ) VALUES (1, '001', '00101000', '531000', '', '2026-01-02', 'API', 100, 'ACME SUPPLY CO', ?, 0, ?, 0)`);
    const line = raw.prepare(`INSERT INTO payroll_lines (
      import_id, fund_code, dept_code, object_code, project_code, pay_date, source, amount_cents,
      employee_name, batch_key, after_cutoff, dedupe_key
    ) VALUES (1, '001', '00101000', '512000', '', '2026-01-02', 'PRJ', 100, ?, ?, 0, ?)`);
    raw.exec("BEGIN");
    for (let i = 0; i < 2000; i += 1) {
      const description = i === 7 ? "paid Example Person 0007 today" : "PAPER AND TONER";
      pay.run(description, `p-${i}`);
      const name = `Example Person ${String(i).padStart(4, "0")}`;
      line.run(name, `b-${i}`, `l-${i}`);
    }
    raw.exec("COMMIT");

    const filters = { q: "", vendor: "", dept: "", minCents: 0, from: "", to: "" };
    const started = performance.now();
    const found = await searchLines(db, 1, filters, 0, 2500, false);
    const elapsed = performance.now() - started;
    expect(found.rows.length).toBeGreaterThan(100);
    expect(found.rows.some((row) => (row.description || "").includes("Example Person"))).toBe(false);
    expect(found.rows.some((row) => row.description === "paid today")).toBe(true);
    expect(elapsed).toBeLessThan(1500);

    const again = performance.now();
    await searchLines(db, 1, filters, 0, 50, false);
    expect(performance.now() - again).toBeLessThan(1500);
  });
});
