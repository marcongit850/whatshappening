import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  csrfOk,
  newSession,
  rateDecision,
  readSession,
  signSession,
  throttleDecision,
} from "../src/auth";
import { fiscalPosition, pace } from "../src/format";
import { dedupePayments, parseReport, storedText } from "../src/parser";

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

  it("keeps payroll only as batches and drops names", () => {
    expect(result.payments.some((row) => row.objectCode === "512000")).toBe(false);
    expect(result.payrollBatches).toHaveLength(1);
    expect(result.payrollBatches[0].batchKey).toBe("251010");
    expect(result.payrollBatches[0].amountCents).toBe(20000);
    expect(storedText(result)).not.toContain("JANE");
    expect(storedText(result)).not.toContain("PUBLIC");
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

  it("classifies pace from spent plus encumbered", () => {
    expect(pace(1000, 900, 50, elapsed.elapsedPct)).toBe("green");
    expect(pace(1000, 980, 0, elapsed.elapsedPct)).toBe("yellow");
    expect(pace(1000, 1100, 0, elapsed.elapsedPct)).toBe("red");
    expect(pace(0, 0, 0, elapsed.elapsedPct)).toBe("gray");
    expect(pace(0, 10, 0, elapsed.elapsedPct)).toBe("red");
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
