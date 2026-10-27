import { Hono, type Context } from "hono";
import {
  accountLines,
  buildQuestionContext,
  finalizeAnswer,
  personNamesUpdatedAt,
  platLines,
  qaSystem,
  searchLines,
  setShowPersonNames,
  showPersonNames,
  showPersonNamesFromForm,
} from "./access";
import { directAnswer, publicFactText } from "./answers";
import { loadBudgetFacts, loadCapitalAccounts, loadCategorySpend, loadFundRollups, loadLargestPayments, loadOfficePaymentCents, loadTopAccounts, loadTopVendors, loadVendorNames } from "./budget";
import { buildVendorIndex, withDisplayNames } from "./vendors";
import type { SessionPayload } from "./auth";
import {
  FORM_COOKIE,
  LOGIN_WINDOW_SEC,
  QA_MAX_CHARS,
  adminUnlockAllowed,
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
  constitutionalTransferCents,
  departmentRollups,
  fundNameMap,
  fundRollups,
  getImport,
  landSpendByDept,
  landSpendByMonth,
  latestPublished,
  listImports,
  loadNames,
  loginAttempts as attemptsFor,
  monthlyParts,
  oneAccount,
  organizationVendors,
  overlapCount,
  platHistory,
  publishImport,
  qaHits,
  reconAccounts,
  recordLoginAttempt as storeAttempt,
  saveChart,
  saveImport,
  unmatchedCodes,
  type SearchFilters,
} from "./db";
import { adminPasswordSet, publicBase, type AppEnv } from "./env";
import { csvAmount, csvCell, displayDate, isoDate } from "./format";
import { uploadAllowed } from "./limits";
import { parseReport } from "./parser";
import { safeNext } from "./safe-next";
import { loadPublishedLedger } from "./published-db";
import { AI_MODEL, modelText } from "./qa";
import { CLIENT_JS, CSS } from "./style";
import { xlsxToRows } from "./xlsx";
import {
  renderAbout,
  renderAccount,
  renderAdminDisabled,
  renderAdminHome,
  renderAsk,
  renderDepartment,
  renderDepartments,
  renderEmpty,
  renderFund,
  renderFunds,
  renderLogin,
  renderMessage,
  renderOverview,
  renderPlat,
  renderPreview,
  renderReserves,
  renderRevenue,
  renderSearch,
  renderSheriff,
  renderUnlock,
  FAVICON,
} from "./view";

const app = new Hono<{ Bindings: AppEnv; Variables: { session: SessionPayload; showNames: boolean } }>();

const CSP = [
  "default-src 'none'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
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
  const names = await showPersonNames(c.env.DB);
  return c.html(renderLogin("", safeNext(c.req.query("next") || "/", new URL(c.req.url).origin), token, names));
});

app.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const token = readCookie(c.req.header("cookie"), FORM_COOKIE);
  const provided = String(form.csrf || "");
  const formToken = String(form.form_token || "");
  const names = await showPersonNames(c.env.DB);
  if (!(await csrfOk(token, formToken || provided))) {
    const fresh = crypto.randomUUID().replace(/-/g, "");
    c.header("Set-Cookie", formCookie(fresh));
    return c.html(renderLogin("The sign-in form expired. Try again.", "/", fresh, names), 400);
  }
  if (!c.env.SITE_PASSWORD || !c.env.SESSION_SECRET) {
    return c.html(renderLogin("The site password is not configured.", "/", "", names), 500);
  }
  const ipHash = await sha256Hex(`${c.env.SESSION_SECRET}:${clientIp(c.req.raw)}`);
  const windowStart = Math.floor(Date.now() / 1000 / LOGIN_WINDOW_SEC) * LOGIN_WINDOW_SEC;
  const prior = await attemptsFor(c.env.DB, ipHash, windowStart);
  if (!throttleDecision(prior).allowed) {
    return c.html(renderLogin("Too many sign-in attempts. Wait a few minutes and try again.", "/", "", names), 429);
  }
  const password = String(form.password || "");
  const ok = await passwordsMatch(password, c.env.SITE_PASSWORD);
  if (!ok) {
    await storeAttempt(c.env.DB, ipHash, windowStart);
    const fresh = crypto.randomUUID().replace(/-/g, "");
    c.header("Set-Cookie", formCookie(fresh));
    return c.html(renderLogin("That password does not match.", "/", fresh, names), 401);
  }
  const session = newSession(false);
  c.header("Set-Cookie", sessionCookie(await signSession(c.env.SESSION_SECRET, session)));
  return c.redirect(safeNext(String(form.next || "/"), new URL(c.req.url).origin), 303);
});

app.use("*", async (c, next) => {
  if (!c.env.SESSION_SECRET) return c.html(renderLogin("The site password is not configured.", "/", "", await showPersonNames(c.env.DB)), 500);
  const token = readCookie(c.req.header("cookie"), "be_session");
  const session = await readSession(c.env.SESSION_SECRET, token);
  if (!session) {
    const nextUrl = safeNext(c.req.path || "/", new URL(c.req.url).origin);
    return c.redirect(`/login?next=${encodeURIComponent(nextUrl)}`, 303);
  }
  c.set("session", session);
  c.set("showNames", await showPersonNames(c.env.DB));
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
  if (!current) return c.html(renderEmpty(session.csrf, isAdmin(c), c.get("showNames")));
  const showNames = c.get("showNames");
  const asOf = current.data_as_of || "";
  const [departments, names, funds, rollups, months, vendors, officeCents, landMonths, landDepts, platMonths, facts, vendorNames, ledger] = await Promise.all([
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
    fundNameMap(c.env.DB, current.id),
    fundRollups(c.env.DB, current.id),
    monthlyParts(c.env.DB, current.id, asOf),
    organizationVendors(c.env.DB, current.id, asOf, 40),
    constitutionalTransferCents(c.env.DB, current.id, asOf),
    landSpendByMonth(c.env.DB, current.id, asOf),
    landSpendByDept(c.env.DB, current.id, asOf),
    monthlyParts(c.env.DB, current.id, asOf, "114"),
    loadBudgetFacts(c.env.DB, current.id),
    loadVendorNames(c.env.DB, current.id),
    loadPublishedLedger(c.env.DB),
  ]);
  return c.html(
    renderOverview({
      row: current,
      departments,
      funds: rollups,
      fundReports: funds,
      names,
      months,
      vendors,
      officeCents,
      landByMonth: landMonths,
      landByDept: landDepts,
      platMonths,
      facts,
      displayName: buildVendorIndex(vendorNames),
      csrf: session.csrf,
      isAdmin: isAdmin(c),
      showNames,
      income: ledger ? { items: ledger.income, totalCents: ledger.incomeTotalCents } : null,
    }),
  );
});

app.get("/revenue", async (c) => {
  const current = await latestPublished(c.env.DB);
  const [ledger, funds] = await Promise.all([
    loadPublishedLedger(c.env.DB),
    current ? fundRollups(c.env.DB, current.id) : Promise.resolve([]),
  ]);
  return c.html(
    renderRevenue({
      ledger,
      fundCodes: funds.map((fund) => fund.code),
      dataAsOf: current?.data_as_of,
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames: c.get("showNames"),
    }),
  );
});

app.get("/reserves", async (c) => {
  const current = await latestPublished(c.env.DB);
  const [ledger, funds] = await Promise.all([
    loadPublishedLedger(c.env.DB),
    current ? fundRollups(c.env.DB, current.id) : Promise.resolve([]),
  ]);
  return c.html(
    renderReserves({
      ledger,
      fundCodes: funds.map((fund) => fund.code),
      dataAsOf: current?.data_as_of,
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames: c.get("showNames"),
    }),
  );
});

app.get("/funds", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const [funds, names] = await Promise.all([fundRollups(c.env.DB, current.id), loadNames(c.env.DB)]);
  return c.html(
    renderFunds({
      row: current,
      funds,
      names,
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames: c.get("showNames"),
    }),
  );
});

app.get("/funds/:code", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const code = c.req.param("code");
  if (!/^\d{3}$/.test(code)) return c.text("Not found", 404);
  const showNames = c.get("showNames");
  const [funds, departments, names, categories, accounts, vendors, vendorNames, payments, officeCents, capitalByDept, ledger] = await Promise.all([
    fundRollups(c.env.DB, current.id),
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
    loadCategorySpend(c.env.DB, current.id, { fund: code }),
    loadTopAccounts(c.env.DB, current.id, { fund: code }),
    loadTopVendors(c.env.DB, current.id, { showNames, fund: code }),
    loadVendorNames(c.env.DB, current.id),
    loadLargestPayments(c.env.DB, current.id, { showNames, fund: code }),
    loadOfficePaymentCents(c.env.DB, current.id, { fund: code }),
    loadCapitalAccounts(c.env.DB, current.id, code),
    loadPublishedLedger(c.env.DB),
  ]);
  const fund = funds.find((item) => item.code === code);
  if (!fund) return c.text("Fund not found", 404);
  return c.html(
    renderFund({
      row: current,
      fund,
      departments: departments.filter((item) => item.fund_code === code),
      categories,
      accounts,
      vendors,
      payments,
      officeCents,
      names,
      capitalByDept,
      reserve: ledger?.reserves.funds.find((item) => item.fundCode === code) || null,
      reserveAsOf: ledger?.reserves.asOf,
      displayName: buildVendorIndex(vendorNames),
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames,
    }),
  );
});

app.get("/departments", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const session = c.get("session");
  const sort = c.req.query("sort") || "";
  const [departments, names, funds] = await Promise.all([
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
    fundNameMap(c.env.DB, current.id),
  ]);
  if (sort === "spent") departments.sort((a, b) => b.ytd_cents - a.ytd_cents);
  else if (sort === "enc") departments.sort((a, b) => b.enc_cents - a.enc_cents);
  else if (sort === "avail") departments.sort((a, b) => b.avail_cents - a.avail_cents);
  return c.html(renderDepartments({ row: current, departments, fundReports: funds, names, csrf: session.csrf, isAdmin: isAdmin(c), showNames: c.get("showNames"), sort }));
});

app.get("/departments/:dept", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const dept = c.req.param("dept");
  if (!/^\d{8}$/.test(dept)) return c.text("Not found", 404);
  const departments = await departmentRollups(c.env.DB, current.id);
  const found = departments.find((item) => item.code === dept);
  if (!found) return c.text("Department not found", 404);
  const showNames = c.get("showNames");
  const [accounts, names, funds, categories, vendors, vendorNames, payments, officeCents] = await Promise.all([
    accountsForDept(c.env.DB, current.id, dept),
    loadNames(c.env.DB),
    fundNameMap(c.env.DB, current.id),
    loadCategorySpend(c.env.DB, current.id, { dept }),
    loadTopVendors(c.env.DB, current.id, { showNames, dept }),
    loadVendorNames(c.env.DB, current.id),
    loadLargestPayments(c.env.DB, current.id, { showNames, dept }),
    loadOfficePaymentCents(c.env.DB, current.id, { dept }),
  ]);
  return c.html(
    renderDepartment({
      row: current,
      dept: found,
      accounts,
      fundReport: funds.get(found.fund_code) || "",
      names,
      categories,
      vendors,
      payments,
      officeCents,
      displayName: buildVendorIndex(vendorNames),
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames,
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
  const [payments, names, vendorNames] = await Promise.all([
    accountLines(c.env.DB, current.id, dept, objectCode, project, pageIndex, pageSize, c.get("showNames")),
    loadNames(c.env.DB),
    loadVendorNames(c.env.DB, current.id),
  ]);
  const departments = await departmentRollups(c.env.DB, current.id);
  const deptRow = departments.find((item) => item.code === dept);
  return c.html(
    renderAccount({
      row: current,
      account,
      payments: withDisplayNames(payments.rows, buildVendorIndex(vendorNames)),
      total: payments.total,
      pageIndex,
      pageSize,
      names,
      deptReport: deptRow?.report_name || "",
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames: c.get("showNames"),
    }),
  );
});

app.get("/search", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const filters = readFilters(c);
  const pageIndex = pageNumber(c.req.query("page"));
  const [result, departments, names, vendorNames, funds] = await Promise.all([
    searchLines(c.env.DB, current.id, filters, pageIndex, 25, c.get("showNames")),
    departmentRollups(c.env.DB, current.id),
    loadNames(c.env.DB),
    loadVendorNames(c.env.DB, current.id),
    fundNameMap(c.env.DB, current.id),
  ]);
  return c.html(
    renderSearch({
      row: current,
      filters,
      departments,
      fundReports: funds,
      names,
      payments: withDisplayNames(result.rows, buildVendorIndex(vendorNames)),
      total: result.total,
      totalCents: result.totalCents,
      pageIndex,
      pageSize: 25,
      csrf: c.get("session").csrf,
      isAdmin: isAdmin(c),
      showNames: c.get("showNames"),
    }),
  );
});

app.get("/search.csv", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const filters = readFilters(c);
  const [result, vendorNames] = await Promise.all([
    searchLines(c.env.DB, current.id, filters, 0, 2000, c.get("showNames")),
    loadVendorNames(c.env.DB, current.id),
  ]);
  const named = withDisplayNames(result.rows, buildVendorIndex(vendorNames));
  const lines = ["date,vendor,invoice,description,department,check,amount"];
  for (const row of named) {
    lines.push(
      [csvCell(row.pay_date), csvCell(row.vendor_name), csvCell(row.invoice), csvCell(row.description), csvCell(row.dept_code), csvCell(row.check_number), csvAmount(row.amount_cents)].join(","),
    );
  }
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", "attachment; filename=payments.csv");
  return c.body(lines.join("\n"));
});

app.get("/ask", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  return c.html(renderAsk({ row: current, csrf: c.get("session").csrf, question: "", answer: "", records: [], error: "", isAdmin: isAdmin(c), showNames: c.get("showNames") }));
});

app.post("/ask", async (c) => {
  const current = await requirePublished(c);
  if (current instanceof Response) return current;
  const session = c.get("session");
  const shown = c.get("showNames");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || c.req.header("x-csrf-token") || "")))) return c.text("Invalid form token", 403);
  const question = String(form.question || "").trim();
  if (!question || question.length > QA_MAX_CHARS) {
    return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer: "", records: [], error: "Enter a question of 500 characters or fewer.", isAdmin: isAdmin(c), showNames: shown }), 400);
  }
  const hour = hourBucket();
  const day = dayBucket();
  const [hourHits, dayHits] = await Promise.all([qaHits(c.env.DB, session.sid, hour), qaHits(c.env.DB, session.sid, day)]);
  const decision = rateDecision(hourHits, dayHits);
  if (!decision.allowed) {
    const error = decision.reason === "hour" ? "This signed-in visitor has reached the hourly question limit." : "This signed-in visitor has reached the daily question limit.";
    return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer: "", records: [], error, isAdmin: isAdmin(c), showNames: shown }), 429);
  }
  await bumpQa(c.env.DB, session.sid, hour);
  await bumpQa(c.env.DB, session.sid, day);
  const asOfLabel = displayDate(current.data_as_of) || "the report date";
  const [facts, fundRows] = await Promise.all([loadBudgetFacts(c.env.DB, current.id), loadFundRollups(c.env.DB, current.id)]);
  const direct = await directAnswer(c.env.DB, current.id, question, facts, fundRows, shown, asOfLabel);
  if (direct) {
    const finalAnswer = await finalizeAnswer(c.env.DB, current.id, direct.answer, direct.records, shown);
    return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer: finalAnswer.answer, records: finalAnswer.records, error: "", isAdmin: isAdmin(c), showNames: shown }));
  }
  const pack = await buildQuestionContext(c.env.DB, current.id, question, shown, publicFactText(facts, asOfLabel));
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
        showNames: shown,
      }),
    );
  }
  let answer = "";
  try {
    const ai = c.env.AI as { run: (model: string, input: unknown) => Promise<unknown> };
    const result = await ai.run(AI_MODEL, {
      messages: [
        { role: "system", content: qaSystem(shown) },
        { role: "user", content: pack.prompt },
      ],
      max_tokens: 400,
    });
    answer = modelText(result).trim();
  } catch {
    answer = "";
  }
  if (!answer) answer = "The question could not be answered just now. The records below are what the import contains for this question.";
  const finalAnswer = await finalizeAnswer(c.env.DB, current.id, answer, pack.records, shown);
  return c.html(renderAsk({ row: current, csrf: session.csrf, question, answer: finalAnswer.answer, records: finalAnswer.records, error: "", isAdmin: isAdmin(c), showNames: shown }));
});

app.get("/about", async (c) => {
  const current = await latestPublished(c.env.DB);
  return c.html(renderAbout(current, c.get("session").csrf, isAdmin(c), publicBase(c.env), c.get("showNames")));
});

app.get("/sheriff", async (c) => {
  const current = await latestPublished(c.env.DB);
  return c.html(renderSheriff(current, c.get("session").csrf, isAdmin(c), c.get("showNames")));
});

app.get("/plat", async (c) => {
  const session = c.get("session");
  const history = await platHistory(c.env.DB, "114", "11444000", session.admin && adminPasswordSet(c.env));
  const current = await latestPublished(c.env.DB);
  const requested = Number(c.req.query("import") || 0);
  const selected = history.find((item) => item.id === requested) || [...history].reverse().find((item) => item.status === "published") || history[history.length - 1];
  const payments = selected ? await platLines(c.env.DB, selected.id, "114", "11444000", c.get("showNames")) : [];
  const [names, vendorNames] = await Promise.all([
    loadNames(c.env.DB),
    selected ? loadVendorNames(c.env.DB, selected.id) : Promise.resolve([]),
  ]);
  const displayName = buildVendorIndex(vendorNames);
  return c.html(renderPlat({ row: current, history, payments: withDisplayNames(payments, displayName), selected: selected?.id ?? null, names, csrf: session.csrf, isAdmin: isAdmin(c), showNames: c.get("showNames") }));
});

app.get("/admin", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const imports = await listImports(c.env.DB);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM chart_names").first<{ n: number }>();
  const updatedAt = await personNamesUpdatedAt(c.env.DB);
  return c.html(renderAdminHome(imports, c.get("session").csrf, Number(count?.n || 0), { shown: c.get("showNames"), updatedAt }));
});

app.post("/admin/settings", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const session = c.get("session");
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  await setShowPersonNames(c.env.DB, showPersonNamesFromForm(form.show_person_names));
  return c.redirect("/admin", 303);
});

app.get("/admin/history", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  return c.redirect("/admin", 303);
});

app.get("/admin/unlock", async (c) => {
  if (!adminPasswordSet(c.env)) return c.html(renderAdminDisabled(c.get("session").csrf, c.get("showNames")), 404);
  if (c.get("session").admin) return c.redirect("/admin", 303);
  return c.html(renderUnlock(c.get("session").csrf, "", c.get("showNames")));
});

app.post("/admin/unlock", async (c) => {
  const session = c.get("session");
  if (!adminPasswordSet(c.env)) return c.html(renderAdminDisabled(session.csrf, c.get("showNames")), 404);
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  const ipHash = await sha256Hex(`${c.env.SESSION_SECRET}:admin:${clientIp(c.req.raw)}`);
  const windowStart = Math.floor(Date.now() / 1000 / LOGIN_WINDOW_SEC) * LOGIN_WINDOW_SEC;
  const [priorIp, priorGlobal] = await Promise.all([
    attemptsFor(c.env.DB, ipHash, windowStart),
    attemptsFor(c.env.DB, "admin-global", windowStart),
  ]);
  if (!adminUnlockAllowed(priorIp, priorGlobal)) {
    return c.html(renderUnlock(session.csrf, "Too many admin attempts. Wait a few minutes and try again.", c.get("showNames")), 429);
  }
  const ok = await passwordsMatch(String(form.admin_password || ""), c.env.ADMIN_PASSWORD);
  if (!ok) {
    await storeAttempt(c.env.DB, ipHash, windowStart);
    await storeAttempt(c.env.DB, "admin-global", windowStart);
    return c.html(renderUnlock(session.csrf, "That admin password does not match.", c.get("showNames")), 401);
  }
  const upgraded = { ...session, admin: true };
  c.header("Set-Cookie", sessionCookie(await signSession(c.env.SESSION_SECRET || "", upgraded)));
  return c.redirect("/admin", 303);
});

app.post("/admin/import", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const session = c.get("session");
  if (!uploadAllowed(c.req.header("content-length"))) {
    return c.html(renderMessage("Import", "That upload is missing a size or is larger than 20 MB.", session.csrf, undefined, c.get("showNames")), 413);
  }
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  const file = form.file;
  if (!(file instanceof File)) return c.html(renderMessage("Import", "Choose a file to import.", session.csrf, undefined, c.get("showNames")), 400);
  if (file.size > 20_000_000) return c.html(renderMessage("Import", "That file is larger than 20 MB.", session.csrf, undefined, c.get("showNames")), 400);
  try {
    const loaded = await interpretFile(file);
    if (loaded.kind === "pdf") {
      return c.html(renderMessage("PDF files", "PDF text extraction is not available in this Worker. Export the year to date report as a text file and upload the .txt file. CSV and Excel files are accepted for a chart of accounts.", session.csrf, undefined, c.get("showNames")), 400);
    }
    if (loaded.kind === "chart" && loaded.chart) {
      const count = await saveChart(c.env.DB, loaded.chart);
      return c.html(renderMessage("Chart updated", `Saved ${count} chart names. Department and object labels will use them on the next page view.`, session.csrf, undefined, c.get("showNames")));
    }
    if (loaded.kind === "report" && loaded.text) {
      const parsed = parseReport(loaded.text);
      const id = await saveImport(c.env.DB, parsed, file.name || "upload.txt");
      return c.redirect(`/admin/import/${id}`, 303);
    }
    return c.html(renderMessage("Unrecognized file", "Upload the year to date budget report as text, or a chart CSV with fund, department, or object columns.", session.csrf, undefined, c.get("showNames")), 400);
  } catch {
    return c.html(renderMessage("Import failed", "The file could not be saved. If this is the full year report, use scripts/seed-local.sh, which loads it in smaller database batches.", session.csrf, undefined, c.get("showNames")), 500);
  }
});

app.post("/admin/chart", async (c) => {
  const blocked = await guardAdmin(c);
  if (blocked) return blocked;
  const session = c.get("session");
  if (!uploadAllowed(c.req.header("content-length"))) {
    return c.html(renderMessage("Chart", "That upload is missing a size or is larger than 20 MB.", session.csrf, undefined, c.get("showNames")), 413);
  }
  const form = await c.req.parseBody();
  if (!(await csrfOk(session.csrf, String(form.csrf || "")))) return c.text("Invalid form token", 403);
  const file = form.file;
  if (!(file instanceof File)) return c.html(renderMessage("Chart", "Choose a CSV or Excel file.", session.csrf, undefined, c.get("showNames")), 400);
  if (file.size > 20_000_000) return c.html(renderMessage("Chart", "That file is larger than 20 MB.", session.csrf, undefined, c.get("showNames")), 400);
  try {
    const loaded = await interpretFile(file);
    if (loaded.kind !== "chart" || !loaded.chart) {
      return c.html(renderMessage("Chart", "That file does not look like a chart of accounts. Expected columns include fund, department, or object codes and names.", session.csrf, undefined, c.get("showNames")), 400);
    }
    const count = await saveChart(c.env.DB, loaded.chart);
    return c.html(renderMessage("Chart updated", `Saved ${count} chart names.`, session.csrf, undefined, c.get("showNames")));
  } catch {
    return c.html(renderMessage("Chart", "That spreadsheet could not be read. Use a small CSV or Excel file.", session.csrf, undefined, c.get("showNames")), 400);
  }
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
      showNames: c.get("showNames"),
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
  if (!row || row.status === "failed") return c.html(renderMessage("Publish", "That import cannot be published.", session.csrf, undefined, c.get("showNames")), 400);
  try {
    await publishImport(c.env.DB, id);
  } catch {
    return c.html(renderMessage("Publish", "That import cannot be published because its stored rows do not match the parsed file.", session.csrf, undefined, c.get("showNames")), 400);
  }
  return c.redirect("/", 303);
});

app.notFound((c) => c.text("Not found", 404));

export default app;

type AppContext = Context<{ Bindings: AppEnv; Variables: { session: SessionPayload; showNames: boolean } }>;

function isAdmin(c: AppContext): boolean {
  return adminPasswordSet(c.env) && c.get("session").admin;
}

async function guardAdmin(c: AppContext): Promise<Response | null> {
  if (!adminPasswordSet(c.env)) return c.html(renderAdminDisabled(c.get("session").csrf, c.get("showNames")), 404);
  if (isAdmin(c)) return null;
  return c.html(renderUnlock(c.get("session").csrf, "", c.get("showNames")));
}

async function requirePublished(c: AppContext): Promise<Response | import("./db").ImportRow> {
  const current = await latestPublished(c.env.DB);
  if (!current) return c.html(renderEmpty(c.get("session").csrf, isAdmin(c), c.get("showNames")));
  return current;
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
    fund: /^\d{3}$/.test(c.req.query("fund") || "") ? c.req.query("fund") || "" : "",
    minCents: Number.isFinite(minNumber) && minNumber > 0 ? Math.round(minNumber * 100) : 0,
    from: isoDate(c.req.query("from") || ""),
    to: isoDate(c.req.query("to") || ""),
    excludeTransfer: c.req.query("transfers") !== "1",
  };
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
