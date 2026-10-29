import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildQuestionContext, qaSystem } from "../src/access";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { moneyExact } from "../src/format";
import { buildLedger, ledgerToSql } from "../src/published";
import { alignAnswer, questionMoneyIntent, type QaRecord } from "../src/qa";

const root = join(import.meta.dirname, "..");
const WRONG =
  "The county earned interest that resulted in $366,416.69 being spent, as shown in account 300-30047000-572000-, which is 1 account.";
const EARNED = "how much interest did county earn";
const SPENT = "how much interest did the county spend";
const BUDGETED = "how much interest is budgeted";

function openDb(): { raw: DatabaseSync; db: D1Database } {
  const raw = new DatabaseSync(":memory:");
  const migrations = join(root, "migrations");
  raw.exec(readFileSync(join(migrations, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(migrations, "0002_settings.sql"), "utf8"));
  raw.exec(readFileSync(join(migrations, "0003_revenue_reserves.sql"), "utf8"));
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

function seedSpending(raw: DatabaseSync): void {
  raw.exec(`INSERT INTO imports (
    id, created_at, status, published_at, data_as_of, filename,
    fund_count, department_count, account_count, payment_count, payroll_line_count,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents, after_cutoff_count
  ) VALUES (
    1, '2026-09-16T00:00:00Z', 'published', '2026-09-16T00:00:00Z', '2026-09-15', 'sample.txt',
    1, 1, 1, 1, 0,
    40000000, 0, 40000000, 36641669, 0, 3358331, 0
  )`);
  raw.exec(`INSERT INTO accounts (
    import_id, fund_code, dept_code, object_code, project_code, title,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents
  ) VALUES (
    1, '300', '30047000', '572000', '', 'INTEREST',
    40000000, 0, 40000000, 36641669, 0, 3358331
  )`);
  raw.exec(`INSERT INTO payments (
    import_id, fund_code, dept_code, object_code, project_code, pay_date, source,
    amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key, is_person_name
  ) VALUES (
    1, '001', '00133000', '534000', '', '2026-01-20', 'API',
    250000, '0402', 'WASTE MANAGEMENT', 'W1', '100', '', 0, 'w1', 1
  )`);
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(root, "sources", name), "utf8")) as unknown;
}

function answerText(html: string): string {
  const match = /<h2>Answer<\/h2><p>([\s\S]*?)<\/p>/.exec(html);
  return match?.[1] || "";
}

async function signed(): Promise<{ header: string; csrf: string }> {
  const session = newSession(false);
  const token = await signSession("session-secret", session);
  return { header: `be_session=${token}`, csrf: session.csrf };
}

function envFor(db: D1Database, prompts: { system: string; user: string }[]) {
  return {
    DB: db,
    AI: {
      async run(_model: string, input: { messages: { role: string; content: string }[] }) {
        prompts.push({
          system: input.messages[0]?.content || "",
          user: input.messages[1]?.content || "",
        });
        return { response: WRONG };
      },
    },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

describe("question intent", () => {
  it("separates earned, spent, and budgeted", () => {
    expect(questionMoneyIntent(EARNED)).toBe("earned");
    expect(questionMoneyIntent("how much interest did the county earn")).toBe("earned");
    expect(questionMoneyIntent("how much did the county earn in property taxes")).toBe("earned");
    expect(questionMoneyIntent("how much property tax was collected")).toBe("earned");
    expect(questionMoneyIntent("investment earnings")).toBe("earned");
    expect(questionMoneyIntent(SPENT)).toBe("spent");
    expect(questionMoneyIntent("how much interest was paid")).toBe("spent");
    expect(questionMoneyIntent("how much did Waste Management get paid")).toBe("spent");
    expect(questionMoneyIntent("What has the county spent on Recreation Plat Fees?")).toBe("spent");
    expect(questionMoneyIntent(BUDGETED)).toBe("budgeted");
    expect(questionMoneyIntent("what was budgeted for interest")).toBe("budgeted");
    expect(questionMoneyIntent("Which departments are over their revised budget?")).toBe("other");
  });

  it("replaces an answer that calls interest paid earned", () => {
    const earned: QaRecord[] = [
      {
        kind: "total",
        text: "FACT: In FY2025 the county earned $14,605,792.00 in interest and investment earnings, according to Audited actual, https://example.test/acfr. The FY2027 adopted budget for interest and investment earnings is $5,456,564.00, according to Budget, https://example.test/budget. This is a budget, not money already earned.",
      },
    ];
    const fixed = alignAnswer(EARNED, WRONG, earned);
    expect(fixed.startsWith("In FY2025 the county earned $14,605,792.00")).toBe(true);
    expect(fixed).toContain("https://example.test/acfr");
    expect(fixed).not.toContain("$366,416.69");
    expect(fixed).not.toContain("being spent");

    const paid: QaRecord[] = [
      {
        kind: "total",
        text: "FACT: Interest paid (debt service), not interest earned. Accounts whose title matches INTEREST spent $366,416.69. Revised budget $400,000.00. Encumbered $0.00. Available $33,583.31. Account count 1. Account keys: 300-30047000-572000-. These accounts are interest the county paid. They do not answer how much interest was earned.",
      },
    ];
    const missed = alignAnswer(EARNED, WRONG, paid);
    expect(missed).toContain("interest paid");
    expect(missed).toContain("$366,416.69");
    expect(missed).toContain("300-30047000-572000-");
    expect(missed).toContain("do not show how much interest the county earned");
    expect(missed).not.toContain("The county earned interest");

    const spent = alignAnswer(SPENT, WRONG, paid);
    expect(spent.startsWith("The county paid $366,416.69 of interest")).toBe(true);
    expect(spent).toContain("interest paid, not interest earned");
    expect(spent).not.toContain("The county earned interest");
  });
});

describe("ask interest earned", () => {
  it("answers from published revenue and rejects the interest expense account", async () => {
    const { raw, db } = openDb();
    seedSpending(raw);
    const ledger = buildLedger(readJson("revenue.json"), readJson("reserves.json"), readJson("beach-vending.json"));
    raw.exec(ledgerToSql(ledger));
    const prompts: { system: string; user: string }[] = [];
    const env = envFor(db, prompts);
    const session = await signed();
    const ask = async (question: string) => {
      const response = await app.request(
        "http://localhost/ask",
        {
          method: "POST",
          headers: { cookie: session.header, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ csrf: session.csrf, question }),
        },
        env,
      );
      expect(response.status).toBe(200);
      return response.text();
    };

    const earnedHtml = await ask(EARNED);
    const earned = answerText(earnedHtml);
    const earnedPrompt = prompts.find((item) => item.user.includes(EARNED));
    expect(earnedPrompt?.system).toContain("Do not add, subtract");
    expect(earnedPrompt?.system).toContain("Do not invent");
    expect(earnedPrompt?.system).toContain("interest paid");
    expect(earnedPrompt?.system).toContain("do not match the question");
    expect(earnedPrompt?.system).toContain("one sentence");
    expect(qaSystem(true)).toContain("Employee names and individual pay in the records may be stated");
    expect(qaSystem(false)).toContain("Person names and individual pay are omitted");
    expect(earnedPrompt?.user).toContain("$14,605,792.00");
    expect(earnedPrompt?.user).toContain("$5,456,564.00");
    expect(earnedPrompt?.user).toContain("interest earned by fund");
    expect(earnedPrompt?.user).toContain("FY2025");
    expect(earnedPrompt?.user).toContain("FY2027");
    expect(earnedPrompt?.user).not.toContain("300-30047000-572000");
    expect(earned.startsWith("In FY2025 the county earned $14,605,792.00 in interest and investment earnings")).toBe(true);
    expect(earned).toContain("$5,456,564.00");
    expect(earned).toContain("not money already earned");
    expect(earned).toContain("flauditor.gov");
    expect(earned).not.toContain("$366,416.69");
    expect(earned).not.toContain("being spent");
    expect(earnedHtml).toContain("12 questions an hour");
    expect(earnedHtml).toContain("40 a day");

    const spent = answerText(await ask(SPENT));
    expect(spent.startsWith("The county paid $366,416.69 of interest")).toBe(true);
    expect(spent).toContain("debt service");
    expect(spent).toContain("interest paid, not interest earned");
    expect(spent).toContain("300-30047000-572000-");
    expect(spent).not.toContain("$14,605,792.00");
    expect(spent).not.toContain("The county earned interest");

    const budgeted = answerText(await ask(BUDGETED));
    expect(budgeted.startsWith("The FY2027 adopted budget for interest and investment earnings is $5,456,564.00")).toBe(true);
    expect(budgeted).toContain("This is a budget, not money already earned");
    expect(budgeted).not.toContain("$366,416.69");

    const property = ledger.income.find((item) => item.key === "property-taxes");
    expect(property).toBeTruthy();
    const propertyAnswer = answerText(await ask("how much did the county earn in property taxes"));
    expect(propertyAnswer.startsWith(`In FY2025 the county earned ${moneyExact(property!.cents)} in property taxes`)).toBe(true);
    expect(propertyAnswer).toContain("flauditor.gov");
    expect(propertyAnswer).not.toContain("$366,416.69");
    expect(propertyAnswer).not.toContain("$14,605,792.00");

    const sales = ledger.income.find((item) => item.key === "sales-taxes");
    const salesAnswer = answerText(await ask("how much sales tax was collected"));
    expect(salesAnswer).toContain(moneyExact(sales!.cents));
    expect(salesAnswer).toContain("sales taxes");
    expect(salesAnswer).not.toContain("$366,416.69");

    const total = answerText(await ask("how much did the county earn"));
    expect(total).toContain(moneyExact(ledger.incomeTotalCents));
    expect(total).toContain("audited income");
    expect(total).not.toContain("$366,416.69");

    const waste = answerText(await ask("how much did Waste Management get paid"));
    expect(waste).toContain("Waste Management");
    expect(waste).toContain("$2,500.00");
    expect(waste).not.toContain(WRONG);

    const pack = await buildQuestionContext(db, 1, EARNED, true);
    expect(pack.records.some((record) => record.text.includes("$14,605,792.00"))).toBe(true);
    expect(pack.records.some((record) => record.text.includes("interest earned by fund"))).toBe(true);
    expect(pack.prompt).not.toContain("300-30047000-572000");
  });

  it("says what it found when only an interest expense account matches", async () => {
    const { raw, db } = openDb();
    seedSpending(raw);
    const prompts: { system: string; user: string }[] = [];
    const env = envFor(db, prompts);
    const session = await signed();
    const response = await app.request(
      "http://localhost/ask",
      {
        method: "POST",
        headers: { cookie: session.header, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrf: session.csrf, question: EARNED }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    const answer = answerText(html);
    expect(prompts[0].user).toContain("do not match");
    expect(prompts[0].user).toContain("Interest paid (debt service)");
    expect(prompts[0].user).toContain("300-30047000-572000-");
    expect(answer).toContain("$366,416.69");
    expect(answer).toContain("interest paid");
    expect(answer).toContain("do not show how much interest the county earned");
    expect(answer).not.toContain("The county earned interest that resulted");
    expect(html).toContain("12 questions an hour");
  });
});
