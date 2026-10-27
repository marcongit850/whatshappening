import { Hono, type Context } from "hono";
import type { SessionPayload } from "./auth";
import {
  FORM_COOKIE,
  LOGIN_WINDOW_SEC,
  QA_MAX_CHARS,
  clearSessionCookie,
  clientIp,
  csrfOk,
  dayBucket,
  formCookie,
  hourBucket,
  newSession,
  passwordsMatch,
  rateDecision,
  readCookie,
  readSession,
  sessionCookie,
  sha256Hex,
  signSession,
  throttleDecision,
} from "./auth";
import { chartFromCsv, chartFromRows } from "./csv";
import {
  accountsForDept,
  bumpQa,
  departmentRollups,
  fundNameMap,
  getImport,
  latestPublished,
  listImports,
  loadNames,
  loginAttempts as attemptsFor,
  monthlyCents,
  oneAccount,
  overlapCount,
  paymentPage,
  platHistory,
  publishImport,
  qaHits,
  reconAccounts,
  recordLoginAttempt as storeAttempt,
  saveChart,
  saveImport,
  searchPayments,
  unmatchedCodes,
  type SearchFilters,
} from "./db";
import { adminPasswordSet, publicBase, type AppEnv } from "./env";
import { fiscalPosition, fyMonthIndex, isoDate } from "./format";
import { parseReport } from "./parser";
import { AI_MODEL, QA_SYSTEM, modelText, retrieveContext } from "./qa";
import { CLIENT_JS, CSS } from "./style";
import { xlsxToRows } from "./xlsx";
import {
  renderAbout,
  renderAccount,
  renderAdminHome,
  renderAsk,
  renderDepartment,
  renderDepartments,
  renderEmpty,
  renderLogin,
  renderMessage,
  renderOverview,
  renderPlat,
  renderPreview,
  renderSearch,
  renderSheriff,
  renderUnlock,
  FAVICON,
} from "./view";

const app = new Hono<{ Bindings: AppEnv; Variables: { session: SessionPayload } }>();

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "style-src-attr 'unsafe-inline'",
].join("; ");

app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", CSP);
  c.header("Cache-Control", "private, no-store");
});

app.get("/robots.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body("User-agent: *\nDisallow: /\n");
});

app.get("/assets/app.css", (c) => {
  c.header("Content-Type", "text/css; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(CSS);
});

app.get("/assets/app.js", (c) => {
  c.header("Content-Type", "text/javascript; charset=utf-8");
  return c.body(CLIENT_JS);
});

app.get("/favicon.svg", (c) => {
  c.header("Content-Type", "image/svg+xml");
  return c.body(FAVICON);
});

app.get("/login", async (c) => {
  const token = crypto.randomUUID().replace(/-/g, "");
  c.header("Set-Cookie", formCookie(token));
  return c.html(renderLogin("", safeNext(c.req.query("next") || "/"), token));
});

app.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const token = readCookie(c.req.header("cookie"), FORM_COOKIE);
  const provided = String(form.csrf || "");
  const formToken = String(form.form_token || "");
  if (!(await csrfOk(token, formToken || provided))) {
    const fresh = crypto.randomUUID().replace(/-/g, "");
    c.header("Set-Cookie", formCookie(fresh));
    return c.html(renderLogin("The sign-in form expired. Try again.", "/", fresh), 400);
  }
  if (!c.env.SITE_PASSWORD || !c.env.SESSION_SECRET) {
    return c.html(renderLogin("The site password is not configured.", "/"), 500);
  }
  const ipHash = await sha256Hex(`${c.env.SESSION_SECRET}:${clientIp(c.req.raw)}`);
  const windowStart = Math.floor(Date.now() / 1000 / LOGIN_WINDOW_SEC) * LOGIN_WINDOW_SEC;
  const prior = await attemptsFor(c.env.DB, ipHash, windowStart);
  if (!throttleDecision(prior).allowed) {
    return c.html(renderLogin("Too many sign-in attempts. Wait a few minutes and try again.", "/"), 429);
  }
  const password = String(form.password || "");
  const ok = await passwordsMatch(password, c.env.SITE_PASSWORD);
  if (!ok) {
    await storeAttempt(c.env.DB, ipHash, windowStart);
    const fresh = crypto.randomUUID().replace(/-/g, "");
    c.header("Set-Cookie", formCookie(fresh));
    return c.html(renderLogin("That password does not match.", "/", fresh), 401);
  }
  let admin = !adminPasswordSet(c.env);
  if (adminPasswordSet(c.env)) {
    admin = await passwordsMatch(String(form.admin_password || ""), c.env.ADMIN_PASSWORD);
  }
  const session = newSession(admin);
  c.header("Set-Cookie", sessionCookie(await signSession(c.env.SESSION_SECRET, session)));
  return c.redirect(safeNext(String(form.next || "/")), 303);
});

app.use("*", async (c, next) => {
  if (!c.env.SESSION_SECRET) return c.html(renderLogin("The site password is not configured.", "/"), 500);
  const token = readCookie(c.req.header("cookie"), "be_session");
  const session = await readSession(c.env.SESSION_SECRET, token);
  if (!session) {
    const nextUrl = safeNext(c.req.path || "/");
    return c.redirect(`/login?next=${encodeURIComponent(nextUrl)}`, 303);
  }
  c.set("session", session);
  await next();
});

app.post("/logout", async (c) => {
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  c.header("Set-Cookie", clearSessionCookie());
  return c.redirect("/login", 303);
});

app.get("/", async (c) => {
  const current = await latestPublished(c.env.DB);
  const session = c.get("session");
  if (!current) return c.html(renderEmpty(session.csrf, session.admin || !adminPasswordSet(c.env)));
  const [departments, names, funds, months] = await Promise.all([
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
    fundNameMap(c.env.DB, current.id),
    monthlyCents(c.env.DB, current.id),
  ]);
  return c.html(
    renderOverview({
      row: current,
      departments,
      fundReports: funds,
      names,
      months: foldMonths(months, current.data_as_of),
      csrf: session.csrf,
      isAdmin: isAdmin(c),
    }),
  );
});

app.get("/departments", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const session = c.get("session");
  const [departments, names, funds] = await Promise.all([
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
    fundNameMap(c.env.DB, current.id),
  ]);
  return c.html(renderDepartments({ row: current, departments, fundReports: funds, names, csrf: session.csrf, isAdmin: isAdmin(c) }));
});

app.get("/departments/:dept", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const dept = c.req.param("dept");
  if (!/^\d{8}$/.test(dept)) return c.text("Not found", 404);
  const departments = await departmentRollups(c.env.DB, current.id);
  const found = departments.find((item) => item.code === dept);
  if (!found) return c.text("Department not found", 404);
  const [accounts, names, funds] = await Promise.all([
    accountsForDept(c.env.DB, current.id, dept),
    loadNames(c.env.DB),
    fundNameMap(c.env.DB, current.id),
  ]);
  return c.html(
    renderDepartment({
      row: current,
      dept: found,
      accounts,
      fundReport: funds.get(found.fund_code) || "",
      names,
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
    }),
  );
});

app.get("/departments/:dept/:object/:project", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const dept = c.req.param("dept");
  const objectCode = c.req.param("object");
  const project = c.req.param("project") === "_" ? "" : c.req.param("project");
  if (!/^\d{8}$/.test(dept) || !/^\d{6}$/.test(objectCode) || !/^[A-Za-z0-9]{0,12}$/.test(project)) return c.text("Not found", 404);
  const account = await oneAccount(c.env.DB, current.id, dept, objectCode, project);
  if (!account) return c.text("Account not found", 404);
  const pageIndex = pageNumber(c.req.query("page"));
  const pageSize = 25;
  const [payments, names] = await Promise.all([
    account.is_payroll ? Promise.resolve({ rows: [], total: 0 }) : paymentPage(c.env.DB, current.id, dept, objectCode, project, pageIndex, pageSize),
    loadNames(c.env.DB),
  ]);
  const departments = await departmentRollups(c.env.DB, current.id);
  const deptRow = departments.find((item) => item.code === dept);
  return c.html(
    renderAccount({
      row: current,
      account,
      payments: payments.rows,
      total: payments.total,
      pageIndex,
      pageSize,
      names,
      deptReport: deptRow?.report_name || "",
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
    }),
  );
});

app.get("/search", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const filters = readFilters(c);
  const pageIndex = pageNumber(c.req.query("page"));
  const [result, departments, names] = await Promise.all([
    searchPayments(c.env.DB, current.id, filters, pageIndex, 25),
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
  ]);
  return c.html(
    renderSearch({
      row: current,
      filters,
      departments,
      names,
      payments: result.rows,
      total: result.total,
      totalCents: result.totalCents,
      pageIndex,
      pageSize: 25,
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
    }),
  );
});

app.get("/search.csv", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const filters = readFilters(c);
  const result = await searchPayments(c.env.DB, current.id, filters, 0, 2000);
  const lines = ["date,vendor,invoice,description,department,check,amount"];
  for (const row of result.rows) {
    lines.push(
      [row.pay_date, row.vendor_name, row.invoice, row.description, row.dept_code, row.check_number, (row.amount_cents / 100).toFixed(2)]
        .map(csvCell)
        .join(","),
    );
  }
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", "attachment; filename=payments.csv");
  return c.body(lines.join("\n"));
});

app.get("/ask", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  return c.html(renderAsk({ row: current, csrf: c.get("session").csrf, question: "", answer: "", records: [], error: "", isAdmin: isAdmin(c) }));
});

app.post("/ask", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || c.req.header("x-csrf-token") || "")))) return c.text("Invalid form token", 403);
  const question = String(form.question || "").trim();
  if (!question || question.length > QA_MAX_CHARS) {
    return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer: "", records: [], error: "Enter a question of 500 characters or fewer.", isAdmin: isAdmin(c) }), 400);
  }
  const hour = hourBucket();
  const day = dayBucket();
  const [hourHits, dayHits] = await Promise.all([qaHits(c.env.DB, session.sid, hour), qaHits(c.env.DB, session.sid, day)]);
  const decision = rateDecision(hourHits, dayHits);
  if (!decision.allowed) {
    const error = decision.reason === "hour" ? "This signed-in visitor has reached the hourly question limit." : "This signed-in visitor has reached the daily question limit.";
    return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer: "", records: [], error, isAdmin: isAdmin(c) }), 429);
  }
  await bumpQa(c.env.DB, session.sid, hour);
  await bumpQa(c.env.DB, session.sid, day);
  const pack = await retrieveContext(c.env.DB, current.id, question);
  if (!pack.records.length) {
    return c.html(
      renderAsk({
        row: current,
        csrf: session.csrf,
        question,
        answer: "The imported data does not contain an answer to that question.",
        records: [],
        error: "",
        isAdmin: isAdmin(c),
      }),
    );
  }
  let answer = "";
  try {
    const ai = c.env.AI as { run: (model: string, input: unknown) => Promise<unknown> };
    const result = await ai.run(AI_MODEL, {
      messages: [
        { role: "system", content: QA_SYSTEM },
        { role: "user", content: pack.prompt },
      ],
      max_tokens: 700,
    });
    answer = modelText(result).trim();
  } catch {
    answer = "";
  }
  if (!answer) answer = "The question could not be answered just now. The records below are what the import contains for this question.";
  return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer, records: pack.records, error: "", isAdmin: isAdmin(c) }));
});

app.get("/about", async (c) => {
  const current = await latestPublished(c.env.DB);
  return c.html(renderAbout(current, c.get("session").csrf, isAdmin(c), publicBase(c.env)));
});

app.get("/sheriff", async (c) => {
  const current = await latestPublished(c.env.DB);
  return c.html(renderSheriff(current, c.get("session").csrf, isAdmin(c)));
});

app.get("/plat", async (c) => {
  const session = c.get("session");
  const history = await platHistory(c.env.DB, "114", "11444000");
  const current = await latestPublished(c.env.DB);
  const requested = Number(c.req.query("import") || 0);
  const selected = history.find((item) => item.id === requested) || [...history].reverse().find((item) => item.status === "published") || history[history.length - 1];
  let payments: Awaited<ReturnType<typeof paymentPage>>["rows"] = [];
  if (selected) {
    const pageResult = await c.env.DB
      .prepare(
        `SELECT * FROM payments WHERE import_id = ? AND fund_code = ? AND dept_code = ? AND after_cutoff = 0
         ORDER BY pay_date DESC, id DESC LIMIT 50`,
      )
      .bind(selected.id, "114", "11444000")
      .all<Awaited<ReturnType<typeof paymentPage>>["rows"][number]>();
    payments = pageResult.results || [];
  }
  const names = await loadNames(c.env.DB);
  return c.html(renderPlat({ row: current, history, payments, selected: selected?.id ?? null, names, csrf: session.csrf, isAdmin: isAdmin(c) }));
});

app.get("/admin", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const imports = await listImports(c.env.DB);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM chart_names").first<{ n: number }>();
  return c.html(renderAdminHome(imports, c.get("session").csrf, Number(count?.n || 0)));
});

app.get("/admin/history", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  return c.redirect("/admin", 303);
});

app.get("/admin/unlock", async (c) => {
  if (!adminPasswordSet(c.env) || c.get("session").admin) return c.redirect("/admin", 303);
  return c.html(renderUnlock(c.get("session").csrf, ""));
});

app.post("/admin/unlock", async (c) => {
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  if (!adminPasswordSet(c.env)) return c.redirect("/admin", 303);
  const ok = await passwordsMatch(String(form.admin_password || ""), c.env.ADMIN_PASSWORD);
  if (!ok) return c.html(renderUnlock(session.csrf, "That admin password does not match."), 401);
  const upgraded = { ...session, admin: true };
  c.header("Set-Cookie", sessionCookie(await signSession(c.env.SESSION_SECRET || "", upgraded)));
  return c.redirect("/admin", 303);
});

app.post("/admin/import", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  const file = form.file;
  if (!(file instanceof File)) return c.html(renderMessage("Import", "Choose a file to import.", session.csrf), 400);
  if (file.size > 20_000_000) return c.html(renderMessage("Import", "That file is larger than 20 MB.", session.csrf), 400);
  try {
    const loaded = await interpretFile(file);
    if (loaded.kind === "pdf") {
      return c.html(renderMessage("PDF files", "PDF text extraction is not available in this Worker. Export the year to date report as a text file and upload the .txt file. CSV and Excel files are accepted for a chart of accounts.", session.csrf), 400);
    }
    if (loaded.kind === "chart" && loaded.chart) {
      const count = await saveChart(c.env.DB, loaded.chart);
      return c.html(renderMessage("Chart updated", `Saved ${count} chart names. Department and object labels will use them on the next page view.`, session.csrf));
    }
    if (loaded.kind === "report" && loaded.text) {
      const parsed = parseReport(loaded.text);
      const id = await saveImport(c.env.DB, parsed, file.name || "upload.txt");
      return c.redirect(`/admin/import/${id}`, 303);
    }
    return c.html(renderMessage("Unrecognized file", "Upload the year to date budget report as text, or a chart CSV with fund, department, or object columns.", session.csrf), 400);
  } catch {
    return c.html(renderMessage("Import failed", "The file could not be saved. If this is the full year report, use scripts/seed-local.sh, which loads it in smaller database batches.", session.csrf), 500);
  }
});

app.post("/admin/chart", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  const file = form.file;
  if (!(file instanceof File)) return c.html(renderMessage("Chart", "Choose a CSV or Excel file.", session.csrf), 400);
  const loaded = await interpretFile(file);
  if (loaded.kind !== "chart" || !loaded.chart) {
    return c.html(renderMessage("Chart", "That file does not look like a chart of accounts. Expected columns include fund, department, or object codes and names.", session.csrf), 400);
  }
  const count = await saveChart(c.env.DB, loaded.chart);
  return c.html(renderMessage("Chart updated", `Saved ${count} chart names.`, session.csrf));
});

app.get("/admin/import/:id", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const id = Number(c.req.param("id"));
  const row = await getImport(c.env.DB, id);
  if (!row) return c.text("Import not found", 404);
  const [mismatches, unmatched, prior] = await Promise.all([
    reconAccounts(c.env.DB, id),
    unmatchedCodes(c.env.DB, id),
    latestPublished(c.env.DB),
  ]);
  const overlap = prior && prior.id !== id ? await overlapCount(c.env.DB, id, prior.id) : null;
  return c.html(
    renderPreview({
      row,
      mismatches,
      unmatchedDepts: unmatched.departments,
      unmatchedObjects: unmatched.objects,
      overlap,
      csrf: c.get("session").csrf,
      error: "",
    }),
  );
});

app.post("/admin/import/:id/publish", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  const id = Number(c.req.param("id"));
  const row = await getImport(c.env.DB, id);
  if (!row || row.status === "failed") return c.html(renderMessage("Publish", "That import cannot be published.", session.csrf), 400);
  await publishImport(c.env.DB, id);
  return c.redirect("/", 303);
});

app.notFound((c) => c.text("Not found", 404));

export default app;

type AppContext = Context<{ Bindings: AppEnv; Variables: { session: SessionPayload } }>;

function isAdmin(c: AppContext): boolean {
  return c.get("session").admin || !adminPasswordSet(c.env);
}

async function guardAdmin(c: AppContext): Promise<Response | null> {
  if (isAdmin(c)) return null;
  return c.html(renderUnlock(c.get("session").csrf, ""));
}

async function requirePublished(c: AppContext): Promise<Response | import("./db").ImportRow> {
  const current = await latestPublished(c.env.DB);
  if (!current) return c.html(renderEmpty(c.get("session").csrf, isAdmin(c)));
  return current;
}

function safeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "/";
  return value.slice(0, 200);
}

function pageNumber(value: string | undefined): number {
  const parsed = Number(value || "1");
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(10_000, Math.floor(parsed) - 1);
}

function readFilters(c: { req: { query: (name: string) => string | undefined } }): SearchFilters {
  const minRaw = c.req.query("min") || "";
  const minNumber = Number(minRaw.replace(/[$,\s]/g, ""));
  return {
    q: (c.req.query("q") || "").slice(0, 80),
    vendor: (c.req.query("vendor") || "").slice(0, 80),
    dept: /^\d{8}$/.test(c.req.query("dept") || "") ? c.req.query("dept") || "" : "",
    minCents: Number.isFinite(minNumber) && minNumber > 0 ? Math.round(minNumber * 100) : 0,
    from: isoDate(c.req.query("from") || ""),
    to: isoDate(c.req.query("to") || ""),
  };
}

function foldMonths(rows: { ym: string; cents: number }[], asOf: string | null): number[] {
  const fiscal = fiscalPosition(asOf);
  const startYear = Number(fiscal.fyStart.slice(0, 4));
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const row of rows) {
    const index = fyMonthIndex(`${row.ym}-01`, startYear);
    if (index != null) buckets[index] += row.cents;
  }
  return buckets;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function interpretFile(file: File): Promise<{ kind: "pdf" | "chart" | "report" | "reject"; text?: string; chart?: ReturnType<typeof chartFromRows> }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return { kind: "pdf" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const rows = xlsxToRows(bytes);
    const chart = chartFromRows(rows);
    if (chart && (chart.funds.length || chart.departments.length || chart.objects.length)) return { kind: "chart", chart };
    const text = rows.map((row) => row.join("  ")).join("\n");
    if (text.includes("ACCOUNTS FOR:")) return { kind: "report", text };
    return { kind: "reject" };
  }
  const text = new TextDecoder().decode(bytes);
  if (name.endsWith(".csv") || text.split(/\n/, 1)[0].includes(",")) {
    const chart = chartFromCsv(text);
    if (chart && (chart.funds.length || chart.departments.length || chart.objects.length)) return { kind: "chart", chart };
  }
  if (text.includes("ACCOUNTS FOR:") || text.includes("YEAR-TO-DATE BUDGET REPORT")) return { kind: "report", text };
  return { kind: "reject" };
}
