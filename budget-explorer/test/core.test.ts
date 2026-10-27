import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { adminUnlockAllowed, constantTimeEqual, csrfOk, newSession, rateDecision, readSession, signSession, throttleDecision } from "../src/auth";
import { historyStatuses, rowCountsMatch } from "../src/db";
import { adminPasswordSet } from "../src/env";
import { csvAmount, csvCell, fiscalPosition, pace, pct } from "../src/format";
import { uploadAllowed } from "../src/limits";
import { MAX_REPORT_LINE, MIN_PAYROLL_BATCH_LINES, dedupePayments, foldPayrollBatches, looksLikePersonName, parseReport, parseVendorRest, storedText, type ParsedPayrollBatch } from "../src/parser";
import { safeNext } from "../src/safe-next";
import { renderLogin, renderUnlock } from "../src/view";
import { XLSX_MAX_COMPRESSED_BYTES, unzipChecked, uncompressedWithinLimits, xlsxToRows, zipEntryAllowed } from "../src/xlsx";

const REPORT = `Walton County
YEAR-TO-DATE BUDGET REPORT
Report generated: 09/15/2026 13:23

ACCOUNTS FOR: 001 GENERAL FUND

00101000 SAMPLE DEPARTMENT

00101000 546000                    REPAIR SERVICES
                    1,000.00                    0.00           1,000.00            400.00              0.00           600.00           40.0%

  2026/02/000100 11/03/2025 API                     250.00 VND 000111 IN INV-1        ACME SUPPLY CO       PARTS             500000111
  2026/02/000101 11/04/2025 API                     150.00 VND 000111 IN INV-2        ACME SUPPLY CO       FILTER            500000111
  2026/12/000200 09/20/2026 API                      50.00 VND 000222 IN INV-3        LATE VENDOR CO       LATE PART         500000222

00101000 512000                    REGULAR SALARIES & WAGES
                      500.00                    0.00             500.00            200.00              0.00           300.00           40.0%

  2026/01/000441 10/10/2025 PRJ                      200.00 REF 251010 WARRANT=251010      RUN=1 REGULAR JANE Q PUBLIC

00101000 552000                    OPERATING SUPPLIES
                      100.00                    0.00             100.00             80.00              0.00            20.00           80.0%

  2026/03/000300 12/01/2025 API                      30.00 VND 000333 IN INV-9        OTHER SUPPLY CO      PAPER             500000333

00102000 552000 00004     SUPPLIES D4
                25.00           0.00          25.00        -5.00               0.00          30.00          -20.0%

  2026/01/000010 10/05/2025 API                      -5.00 VND 000009 IN R1         CREDIT VENDOR CO     RETURN            500000009

00103000 534000                    CONTRACTUAL SERVICES

Report generated: 09/15/2026 13:23
User:             nobody
Program ID:       glytdbud
ACCOUNTS FOR: 001 GENERAL FUND
          ORIGINAL APPROP      TRANS/ADJSMTS             REVISED BUDGET      YTD EXPENDED     ENCUMBRANCES   AVAILABLE BUDGET      % USED

                    10.00                    0.00             10.00             10.00              0.00             0.00          100.0%

  2026/01/000001 10/02/2025 API                      10.00 VND 000001 IN A1         BETA OFFICE CO       PENS              500000001

                           GRAND TOTAL
                    1,635.00                    0.00           1,635.00            685.00              0.00           950.00           41.9%
`;

describe("parser", () => {
  const result = parseReport(REPORT);

  it("reads accounts, a vendor line, and the printed total", () => {
    expect(result.funds).toHaveLength(1);
    expect(result.accounts).toHaveLength(5);
    expect(result.dataAsOf).toBe("2026-09-15");
    expect(result.printed?.origCents).toBe(163500);
    const repair = result.payments.find((row) => row.invoice === "INV-1");
    expect(repair?.vendorName).toBe("ACME SUPPLY CO");
    expect(repair?.checkNumber).toBe("500000111");
    expect(repair?.description).toContain("PARTS");
    expect(repair?.amountCents).toBe(25000);
  });

  it("stores payroll names and amounts and flags a one-line folded batch", () => {
    expect(result.payments.some((row) => row.objectCode === "512000")).toBe(false);
    expect(result.payrollLines).toHaveLength(1);
    expect(result.payrollLines[0].employeeName).toBe("JANE Q PUBLIC");
    expect(result.payrollLines[0].amountCents).toBe(20000);
    expect(result.payrollBatches).toHaveLength(1);
    expect(result.payrollBatches[0].batchKey).toBe("combined");
    expect(result.payrollBatches[0].amountCents).toBe(20000);
    expect(result.payrollBatches[0].belowMinimum).toBe(true);
    expect(result.foldedPayrollBatches).toBe(1);
    expect(storedText(result)).toContain("JANE Q PUBLIC");
    expect(storedText(result)).not.toContain("251010");
    expect(storedText(result)).not.toContain("WARRANT");
  });

  it("flags lines after the report date", () => {
    const late = result.payments.find((row) => row.invoice === "INV-3");
    expect(late?.afterCutoff).toBe(true);
    expect(result.afterCutoffCount).toBe(1);
    expect(result.payments.filter((row) => !row.afterCutoff).every((row) => row.payDate <= "2026-09-15")).toBe(true);
  });

  it("shows a reconciliation difference instead of hiding it", () => {
    const supplies = result.accounts.find((row) => row.objectCode === "552000" && row.project === "");
    expect(supplies?.ytdCents).toBe(8000);
    expect(supplies?.paymentSumCents).toBe(3000);
    expect(supplies?.reconDiffCents).toBe(-5000);
    expect(result.reconMismatches.map((row) => row.objectCode)).toContain("552000");
  });

  it("keeps a negative percent account and a page break amount", () => {
    const negative = result.accounts.find((row) => row.project === "00004");
    expect(negative?.ytdCents).toBe(-500);
    const contract = result.accounts.find((row) => row.objectCode === "534000");
    expect(contract?.ytdCents).toBe(1000);
    expect(contract?.paymentSumCents).toBe(1000);
  });
});

describe("dedupe", () => {
  it("collapses the same fund, account, check, and amount across imports", () => {
    const first = parseReport(REPORT).payments.filter((row) => row.checkNumber === "500000111");
    const second = first.map((row) => ({ ...row }));
    const merged = dedupePayments([...first, ...second]);
    expect(first.length).toBe(2);
    expect(merged).toHaveLength(2);
    const same = dedupePayments([first[0], { ...first[0] }]);
    expect(same).toHaveLength(1);
  });
});

describe("burn rate", () => {
  const elapsed = fiscalPosition("2026-09-15");

  it("uses 350 of 365 days for 15 September 2026", () => {
    expect(elapsed.elapsedDays).toBe(350);
    expect(elapsed.totalDays).toBe(365);
    expect(elapsed.elapsedPct).toBeCloseTo(95.8904, 2);
  });

  it("classifies pace from money spent, not from money promised but unpaid", () => {
    expect(pace(1000, 900, 200, elapsed.elapsedPct)).toBe("under");
    expect(pace(1000, 960, 0, elapsed.elapsedPct)).toBe("green");
    expect(pace(1000, 980, 0, elapsed.elapsedPct)).toBe("yellow");
    expect(pace(1000, 1100, 0, elapsed.elapsedPct)).toBe("red");
    expect(pace(1000, 0, 50, elapsed.elapsedPct)).toBe("none");
    expect(pace(0, 0, 0, elapsed.elapsedPct)).toBe("none");
    expect(pace(0, 10, 0, elapsed.elapsedPct)).toBe("red");
    expect(pct(10, 0)).toBe("n/a");
    expect(pct(0, 1000)).toBe("0.0%");
  });
});

describe("auth and limits", () => {
  it("signs a session and rejects tampering or expiry", async () => {
    const secret = "test-session-secret";
    const payload = newSession(false);
    const token = await signSession(secret, payload);
    expect((await readSession(secret, token))?.sid).toBe(payload.sid);
    expect(await readSession("other-secret", token)).toBeNull();
    expect(await readSession(secret, `${token}x`)).toBeNull();
    const expired = await signSession(secret, { ...payload, exp: 10 });
    expect(await readSession(secret, expired)).toBeNull();
  });

  it("compares secrets without a matching shortcut and checks form tokens", async () => {
    expect(await constantTimeEqual("correct horse", "correct horse")).toBe(true);
    expect(await constantTimeEqual("correct horse", "wrong horse")).toBe(false);
    expect(await constantTimeEqual("short", "much-longer-value")).toBe(false);
    expect(await csrfOk("abc", "abc")).toBe(true);
    expect(await csrfOk("abc", "abd")).toBe(false);
    expect(await csrfOk("", "abc")).toBe(false);
  });

  it("throttles login attempts and question rate", () => {
    expect(throttleDecision(7).allowed).toBe(true);
    expect(throttleDecision(8).allowed).toBe(false);
    expect(rateDecision(11, 10).allowed).toBe(true);
    expect(rateDecision(12, 10)).toEqual({ allowed: false, reason: "hour" });
    expect(rateDecision(1, 40)).toEqual({ allowed: false, reason: "day" });
  });
});

describe("security fixes", () => {
  const origin = "https://budget.example";

  it("keeps seed files out of a root placeholder deploy", () => {
    const repo = join(import.meta.dirname, "..", "..");
    const assets = readFileSync(join(repo, ".assetsignore"), "utf8");
    const git = readFileSync(join(repo, ".gitignore"), "utf8");
    const seed = readFileSync(join(import.meta.dirname, "..", "scripts", "seed-local.ts"), "utf8");
    expect(assets).toMatch(/^budget-explorer$/m);
    expect(assets).toMatch(/seed\.sql/);
    expect(git).toMatch(/budget-explorer\/data\//);
    expect(git).toMatch(/seed\.sql/);
    expect(seed).toContain("tmpdir");
    expect(seed.includes('data", "seed"')).toBe(false);
  });

  it("requires an admin password and throttles unlock failures per IP and globally", () => {
    expect(adminPasswordSet({ ADMIN_PASSWORD: "  " })).toBe(false);
    expect(adminPasswordSet({ ADMIN_PASSWORD: "secret" })).toBe(true);
    expect(renderLogin("", "/", "token")).not.toContain("admin_password");
    expect(renderUnlock("token", "")).toContain('name="admin_password"');
    expect(adminUnlockAllowed(7, 0)).toBe(true);
    expect(adminUnlockAllowed(8, 0)).toBe(false);
    expect(adminUnlockAllowed(0, 8)).toBe(false);
  });

  it("stores coded payment fields, folds tiny payroll batches, and flags person-like vendors", () => {
    const narrative = parseReport(`Report generated: 09/15/2026
ACCOUNTS FOR: 001 GENERAL FUND
00101000 SAMPLE DEPARTMENT
00101000 546000                    OTHER
                    10.00                    0.00             10.00             10.00              0.00             0.00          100.0%
  2026/04/000400 12/02/2025 GEN                      10.00 NARRATIVE ABOUT JANE DOE PRIVATE
00101000 531000                    CONTRACT
                    20.00                    0.00             20.00             20.00              0.00             0.00          100.0%
  2026/04/000401 12/03/2025 API                      20.00 VND 000777 IN INV-P        JANE Q PUBLIC        NOTE              500000777
00101000 512000                    REGULAR SALARIES & WAGES
                    30.00                    0.00             30.00             30.00              0.00             0.00          100.0%
  2026/01/000441 10/10/2025 PRJ                      10.00 REF 251010 WARRANT=251010      RUN=1 REGULAR
  2026/01/000442 10/10/2025 PRJ                      10.00 REF 251010 WARRANT=251010      RUN=1 REGULAR
  2026/01/000443 10/10/2025 PRJ                      10.00 REF 251010 WARRANT=251010      RUN=1 REGULAR
  2026/01/000444 10/11/2025 PRJ                      10.00 REF 999 WARRANT=999      RUN=1 REGULAR ALONE
`);
    const memo = narrative.payments.find((row) => row.source === "GEN");
    expect(memo?.description).toBe("");
    expect(storedText(narrative)).not.toContain("NARRATIVE");
    expect(storedText(narrative)).not.toContain("JANE DOE");
    const person = narrative.payments.find((row) => row.invoice === "INV-P");
    expect(person?.vendorName).toBe("JANE Q PUBLIC");
    expect(looksLikePersonName(person?.vendorName || "")).toBe(true);
    expect(looksLikePersonName("ACME SUPPLY CO")).toBe(false);
    const kept = narrative.payrollBatches.find((row) => row.batchKey === "251010");
    expect(kept?.lineCount).toBe(3);
    expect(kept?.belowMinimum).toBe(false);
    expect(narrative.payrollBatches.some((row) => row.batchKey === "999")).toBe(false);
    expect(narrative.foldedPayrollBatches).toBe(1);
    const alone = narrative.payrollLines.find((row) => row.employeeName === "ALONE");
    expect(alone?.amountCents).toBe(1000);
    expect(narrative.payrollBatches.some((row) => row.belowMinimum)).toBe(true);
    expect(storedText(narrative)).toContain("ALONE");
    expect(storedText(narrative)).not.toContain("RUN=1");
    const slow = `VND 1 IN ${"A ".repeat(3000)}`;
    expect(parseVendorRest(slow)).toBeNull();
    const huge = `${"Z".repeat(MAX_REPORT_LINE + 50)} MARKERNAME`;
    expect(storedText(parseReport(`${huge}\n`))).not.toContain("MARKERNAME");
  });

  it("shows draft plat history only to an unlocked admin", () => {
    expect(historyStatuses(false)).toEqual(["published"]);
    expect(historyStatuses(true)).toEqual(["published", "draft"]);
    expect(historyStatuses(true)).not.toContain("failed");
  });

  it("rejects open redirects", () => {
    expect(safeNext("/departments", origin)).toBe("/departments");
    expect(safeNext("//evil.com", origin)).toBe("/");
    expect(safeNext("/\\evil.com", origin)).toBe("/");
    expect(safeNext("///evil.com", origin)).toBe("/");
    expect(safeNext("/%2f%2fevil.com", origin)).toBe("/");
    expect(safeNext("/%5Cevil.com", origin)).toBe("/");
    expect(safeNext("%252f%252fevil.com", origin)).toBe("/");
    expect(safeNext("https://evil.com", origin)).toBe("/");
    expect(safeNext("/%0d%0aSet-Cookie:x", origin)).toBe("/");
    expect(safeNext("javascript:alert(1)", origin)).toBe("/");
    expect(safeNext("https://budget.example/search?q=1", origin)).toBe("/search?q=1");
  });

  it("caps uploads, spreadsheet expansion, line length, and publish counts", () => {
    expect(uploadAllowed(undefined)).toBe(false);
    expect(uploadAllowed("20000001")).toBe(false);
    expect(uploadAllowed("20")).toBe(true);
    expect(zipEntryAllowed({ size: 5, originalSize: 5 }, 0, { entry: 10, total: 20 }).ok).toBe(true);
    expect(zipEntryAllowed({ size: 4, originalSize: 50 }, 0, { entry: 10, total: 100 }).ok).toBe(false);
    expect(zipEntryAllowed({ size: 5, originalSize: 5 }, 18, { entry: 10, total: 20 }).ok).toBe(false);
    const packed = zipSync({ "xl/worksheets/sheet1.xml": strToU8("x".repeat(80)) });
    expect(() => xlsxToRows(packed, { entry: 10, total: 100 })).toThrow(/too large/i);
    expect(MAX_REPORT_LINE).toBeGreaterThan(1000);
    expect(rowCountsMatch(
      { funds: 1, departments: 1, accounts: 1, payments: 2, payrollBatches: 0 },
      { funds: 1, departments: 1, accounts: 1, payments: 2, payrollBatches: 0 },
    )).toBe(true);
    expect(rowCountsMatch(
      { funds: 1, departments: 1, accounts: 1, payments: 2, payrollBatches: 0 },
      { funds: 1, departments: 1, accounts: 1, payments: 1, payrollBatches: 0 },
    )).toBe(false);
  });

  it("neutralizes spreadsheet formulas in CSV cells", () => {
    expect(csvCell("=cmd")).toBe("'=cmd");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("\tname")).toBe("'\tname");
    expect(csvCell("\rname")).toBe("\"'\rname\"");
    expect(csvCell("office")).toBe("office");
    expect(csvCell("=JANE")).toBe("'=JANE");
    expect(csvCell("+JANE")).toBe("'+JANE");
    expect(csvCell("-JANE")).toBe("'-JANE");
    expect(csvCell("@JANE")).toBe("'@JANE");
    expect(csvCell("\tJANE")).toBe("'\tJANE");
    expect(csvCell("\rJANE")).toBe("\"'\rJANE\"");
    expect(csvCell("JANE Q PUBLIC")).toBe("JANE Q PUBLIC");
  });

  it("keeps negative amounts numeric in the CSV amount column", () => {
    expect(csvAmount(-500)).toBe("-5.00");
    expect(csvAmount(25000)).toBe("250.00");
    expect(csvAmount(0)).toBe("0.00");
    expect(csvCell("-5.00")).toBe("'-5.00");
  });
});

describe("payroll fold", () => {
  const batch = (patch: Partial<ParsedPayrollBatch>): ParsedPayrollBatch => ({
    fund: "001",
    dept: "00101000",
    objectCode: "512000",
    project: "",
    batchKey: "a",
    payDate: "2026-01-02",
    amountCents: 100,
    lineCount: 1,
    belowMinimum: false,
    ...patch,
  });

  it("flags folded batches that stay under the minimum and keeps their dollars", () => {
    const folded = foldPayrollBatches([
      batch({ batchKey: "a", payDate: "2026-01-02", lineCount: 1, amountCents: 100 }),
      batch({ batchKey: "b", payDate: "2026-02-02", lineCount: 1, amountCents: 250 }),
      batch({ batchKey: "big", payDate: "2026-01-02", lineCount: MIN_PAYROLL_BATCH_LINES, amountCents: 900 }),
    ]);
    expect(folded.batches.reduce((sum, row) => sum + row.amountCents, 0)).toBe(1250);
    expect(folded.batches.find((row) => row.batchKey === "big")?.belowMinimum).toBe(false);
    expect(folded.batches.filter((row) => row.belowMinimum).reduce((sum, row) => sum + row.amountCents, 0)).toBe(350);
    for (const row of folded.batches) expect(row.lineCount >= MIN_PAYROLL_BATCH_LINES || row.belowMinimum).toBe(true);
    const sameMonth = foldPayrollBatches([
      batch({ batchKey: "a", lineCount: 2, amountCents: 10 }),
      batch({ batchKey: "b", lineCount: 2, amountCents: 15 }),
    ]);
    expect(sameMonth.batches).toHaveLength(1);
    expect(sameMonth.batches[0].lineCount).toBe(4);
    expect(sameMonth.batches[0].belowMinimum).toBe(false);
    expect(sameMonth.batches[0].amountCents).toBe(25);
  });
});

describe("xlsx limits", () => {
  it("rejects an oversized compressed workbook before unzipping", () => {
    const huge = new Uint8Array(XLSX_MAX_COMPRESSED_BYTES + 1);
    huge[0] = 0x50;
    huge[1] = 0x4b;
    expect(() => xlsxToRows(huge)).toThrow(/too large/i);
  });

  it("aborts when uncompressed bytes exceed the declared size", () => {
    expect(uncompressedWithinLimits(5, 5, 5, { entry: 10, total: 20 })).toBe(true);
    expect(uncompressedWithinLimits(6, 5, 6, { entry: 10, total: 20 })).toBe(false);
    expect(uncompressedWithinLimits(5, 9, 21, { entry: 10, total: 20 })).toBe(false);
    const payload = "x".repeat(80);
    const packed = zipSync({ "xl/worksheets/sheet1.xml": strToU8(payload) });
    const forged = forgeUncompressedSize(packed, 80, 10);
    expect(() => xlsxToRows(forged, { entry: 100, total: 100 })).toThrow(/larger than declared/i);
  });

  it("stops a forged uncompressed size before the whole entry is inflated", () => {
    const uncompressed = 32 * 1024 * 1024;
    const raw = new Uint8Array(uncompressed);
    const packed = zipSync({ "xl/worksheets/sheet1.xml": raw });
    const forged = forgeHeaderUncompressedSize(packed, 128);
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    expect(() => unzipChecked(forged, { entry: 2_000_000, total: 2_000_000 })).toThrow(/larger than declared|too large/i);
    const elapsed = performance.now() - started;
    const delta = process.memoryUsage().heapUsed - before;
    expect(elapsed).toBeLessThan(1500);
    expect(delta).toBeLessThan(24 * 1024 * 1024);
  });

  it("reads a small worksheet", () => {
    const sheet = `<?xml version="1.0"?><worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>HELLO</t></is></c></row></sheetData></worksheet>`;
    const packed = zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet) });
    const rows = xlsxToRows(packed);
    expect(rows[0][0]).toBe("HELLO");
  });
});

function forgeUncompressedSize(packed: Uint8Array, from: number, to: number): Uint8Array {
  const copy = new Uint8Array(packed);
  const fromBytes = uint32(from);
  const toBytes = uint32(to);
  let patched = 0;
  for (let i = 0; i <= copy.length - 4; i += 1) {
    if (copy[i] === fromBytes[0] && copy[i + 1] === fromBytes[1] && copy[i + 2] === fromBytes[2] && copy[i + 3] === fromBytes[3]) {
      copy.set(toBytes, i);
      patched += 1;
    }
  }
  if (patched < 2) throw new Error("Could not forge the zip size fields");
  return copy;
}

function forgeHeaderUncompressedSize(packed: Uint8Array, to: number): Uint8Array {
  const copy = packed.slice();
  const toBytes = uint32(to);
  let patched = 0;
  for (let i = 0; i <= copy.length - 30; i += 1) {
    const local = copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x03 && copy[i + 3] === 0x04;
    const central = copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x01 && copy[i + 3] === 0x02;
    if (local) {
      copy.set(toBytes, i + 22);
      patched += 1;
    } else if (central) {
      copy.set(toBytes, i + 24);
      patched += 1;
    }
  }
  if (patched < 2) throw new Error("Could not forge the zip size fields");
  return copy;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 255;
  bytes[1] = (value >> 8) & 255;
  bytes[2] = (value >> 16) & 255;
  bytes[3] = (value >> 24) & 255;
  return bytes;
}

describe("source text", () => {
  it("does not use em or en dashes", () => {
    const root = join(import.meta.dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "data" || entry === ".wrangler") continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|json|jsonc|md|sql|sh|css|js|example)$/.test(entry)) files.push(path);
      }
    };
    walk(root);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (text.includes("\u2013") || text.includes("\u2014")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
