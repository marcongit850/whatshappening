import { describe, expect, it } from "vitest";
import { FY2027_ADOPTED_CENTS, fy2027CountNote } from "../src/answers";
import { factsFromRow } from "../src/budget";
import { isAccountDetail, parseAccountDetail, parseDetailCents } from "../src/parser";
import { renderPreview } from "../src/view";
import type { ImportRow } from "../src/db";

const header = [
  "FUND", "ORG", "OBJ", "PROJECT", "ACCOUNT DESCRIPTION",
  "ORIGINAL APPROP", "TRANFRS/ADJSMTS", "REVISED BUDGET", "YTD ACTUAL", "ENCUMBRANCES", "AVAILABLE BUDGET",
  "YR/PER/JNL", "EFF DATE", "SRC", "AMOUNT", "VENDOR/REF 1", "REF 2", "REF 3", "REF 4",
  "PO #", "VOUCHER", "INVOICE #", "DOC #", "CHECK #", "VENDOR NAME", "COMMENT", "AR REF", "ITEM DESCRIPTION", "TEXT",
];

describe("account detail workbook", () => {
  it("skips total rows and revenue accounts, and dates the file from the latest transaction", () => {
    const rows = [
      header,
      ["001", "00101000", "512000", "", "REGULAR SALARIES & WAGES", "1000", "0", "1000", "100", "0", "900", "2027/01/000330", "10/09/2026", "PRJ", "100", "261009", "", "", "", "", "", "", "", "0", "", "WARRANT=261009  RUN=1 REGULAR", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "2027/01/001034", "11/12/2026", "PRJ", "50", "261112", "", "", "", "", "", "", "", "0", "", "WARRANT=261112  RUN=1 REGULAR", "", "", ""],
      ["001", "00101000", "534000", "", "OTHER SERVICES", "500", "0", "500", "25.50", "10", "464.50", "2027/01/000673", "10/08/2026", "API", "25.50", "001374", "", "", "", "", "", "INV-1", "", "700019809", "HEALTHIEST YOU", "OCTOBER", "", "", ""],
      ["001", "00101000", "591000", "", "INTRAGOVERNMENTAL TRANSFERS", "4000", "0", "4000", "0", "0", "4000", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["001", "00101000", "599000", "", "OTHER USES/CONTINGENCY", "80", "0", "80", "0", "0", "80", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["001", "00101000", "571000", "", "PRINCIPAL", "200", "0", "200", "0", "50", "150", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["001", "00101002", "581000", "", "WALTON COUNTY HEALTH DEPARTMEN", "70", "0", "70", "0", "0", "70", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["001", "001311", "311000", "", "AD VALOREM TAXES", "-9000", "0", "-9000", "0", "0", "-9000", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "00101000", "", "", "Total 00101000 BCC/LEGISLATIVE", "999999", "0", "999999", "999999", "999999", "0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["001", "", "", "", "Total 001 GENERAL FUND", "999999", "0", "999999", "999999", "999999", "0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "Expense Total", "5850", "0", "5850", "125.50", "60", "5664.50", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "Grand Total", "1", "0", "1", "1", "1", "1", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ];
    expect(isAccountDetail(rows)).toBe(true);
    const parsed = parseAccountDetail(rows, { today: "2026-12-01" });
    expect(parsed.dataAsOf).toBe("2026-11-12");
    expect(parsed.accounts.map((row) => row.objectCode).sort()).toEqual(["512000", "534000", "571000", "581000", "591000", "599000"]);
    expect(parsed.accounts.reduce((sum, row) => sum + row.origCents, 0)).toBe(585000);
    expect(parsed.printed?.origCents).toBe(585000);
    expect(parsed.printed?.ytdCents).toBe(12550);
    expect(parsed.printed?.encCents).toBe(6000);
    expect(parsed.payments).toHaveLength(1);
    expect(parsed.payments[0].vendorName).toBe("HEALTHIEST YOU");
    expect(parsed.payments[0].vendorNumber).toBe("001374");
    expect(parsed.payments[0].checkNumber).toBe("700019809");
    expect(parsed.payrollLines.reduce((sum, row) => sum + row.amountCents, 0)).toBe(15000);
    expect(parsed.payrollLines.every((row) => row.employeeName === "")).toBe(true);
    expect(parsed.departments.find((row) => row.code === "00101000")?.reportName).toBe("BCC/LEGISLATIVE");
    expect(parsed.funds.find((row) => row.code === "001")?.reportName).toBe("GENERAL FUND");
    expect(parsed.accounts.some((row) => row.objectCode.startsWith("3"))).toBe(false);
    expect(parsed.rejectedCellCount).toBe(0);
  });

  it("reads parentheses as negative and rejects amounts that are not plain dollars", () => {
    expect(parseDetailCents("(1,234.00)")).toEqual({ cents: -123400, ok: true });
    expect(parseDetailCents("1,234.50")).toEqual({ cents: 123450, ok: true });
    expect(parseDetailCents("-9000")).toEqual({ cents: -900000, ok: true });
    expect(parseDetailCents("+12.5")).toEqual({ cents: 1250, ok: true });
    expect(parseDetailCents("10,000,000,000.00")).toEqual({ cents: 1_000_000_000_000, ok: true });
    expect(parseDetailCents("292.52999999999997")).toEqual({ cents: 29253, ok: true });
    expect(parseDetailCents("")).toEqual({ cents: 0, ok: true });
    expect(parseDetailCents("   ")).toEqual({ cents: 0, ok: true });
    expect(parseDetailCents("1e300")).toEqual({ cents: 0, ok: false });
    expect(parseDetailCents("1.234")).toEqual({ cents: 0, ok: false });
    expect(parseDetailCents("10000000000.01")).toEqual({ cents: 0, ok: false });
    expect(parseDetailCents("(10,000,000,000.01)")).toEqual({ cents: 0, ok: false });
    expect(parseDetailCents("$1.00").ok).toBe(false);
    expect(parseDetailCents("12,34.00").ok).toBe(false);

    const rows = [
      header,
      ["001", "00101000", "534000", "", "OTHER SERVICES", "(1,234.00)", "0", "(1,234.00)", "10.00", "0", "0", "2027/01/000673", "10/08/2026", "API", "1e300", "001374", "", "", "", "", "", "INV-1", "", "700019809", "ACME\u0000'); INSERT INTO pwned(name) VALUES ('owned');--", "OCTOBER", "", "", ""],
      ["", "", "", "", "Expense Total", "(1,234.00)", "0", "(1,234.00)", "10.00", "0", "0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ];
    const parsed = parseAccountDetail(rows, { today: "2026-12-01" });
    expect(parsed.accounts[0].origCents).toBe(-123400);
    expect(parsed.accounts[0].revCents).toBe(-123400);
    expect(parsed.accounts[0].ytdCents).toBe(1000);
    expect(parsed.payments).toHaveLength(1);
    expect(parsed.payments[0].amountCents).toBe(0);
    expect(parsed.payments[0].vendorName.includes("\0")).toBe(false);
    expect(parsed.payments[0].vendorName.startsWith("ACME")).toBe(true);
    expect(parsed.rejectedCellCount).toBe(1);
    expect(parsed.printed?.origCents).toBe(-123400);

    const row: ImportRow = {
      id: 1,
      created_at: "",
      published_at: null,
      data_as_of: "2026-11-02",
      filename: "account-detail.xlsx",
      status: "draft",
      note: "Rejected amount cells: 1.",
      fund_count: 1,
      department_count: 1,
      account_count: 1,
      payment_count: 1,
      payroll_batch_count: 0,
      payroll_line_count: 0,
      after_cutoff_count: 0,
      recon_mismatch_count: 0,
      orig_cents: -123400,
      adj_cents: 0,
      rev_cents: -123400,
      ytd_cents: 1000,
      enc_cents: 0,
      avail_cents: 0,
      printed_orig_cents: -123400,
      printed_rev_cents: -123400,
      printed_ytd_cents: 1000,
    };
    const html = renderPreview({
      row,
      mismatches: [],
      unmatchedDepts: [],
      unmatchedObjects: [],
      overlap: null,
      csrf: "token",
      error: "",
      showNames: false,
    });
    expect(html).toContain("1 amount cells were not plain dollar amounts and were counted as zero.");
    const clean = renderPreview({
      row: { ...row, note: "Folded 2 payroll batches with fewer than 3 lines into a combined monthly total. Rejected amount cells: 0." },
      mismatches: [],
      unmatchedDepts: [],
      unmatchedObjects: [],
      overlap: null,
      csrf: "token",
      error: "",
      showNames: false,
    });
    expect(clean).toContain("0 amount cells were not plain dollar amounts and were counted as zero.");
    expect(clean).toContain("Folded 2 payroll batches with fewer than 3 lines into a combined monthly total.");
    expect(clean).toContain("Review this before publishing.");
  });

  it("ignores transaction dates after the day the importer runs", () => {
    const rows = [
      header,
      ["001", "00101000", "534000", "", "OTHER SERVICES", "500", "0", "500", "125.50", "0", "374.50", "2027/02/000010", "11/02/2026", "API", "25.50", "001374", "", "", "", "", "", "INV-1", "", "700019809", "HEALTHIEST YOU", "OCTOBER", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "2027/02/000099", "11/12/2026", "API", "100", "001999", "", "", "", "", "", "INV-9", "", "700019900", "FUTURE VENDOR CO", "LATER", "", "", ""],
    ];
    const parsed = parseAccountDetail(rows, { today: "2026-11-04" });
    expect(parsed.dataAsOf).toBe("2026-11-02");
    expect(parsed.accounts[0].ytdCents).toBe(12550);
    const future = parsed.payments.find((row) => row.vendorName === "FUTURE VENDOR CO");
    const current = parsed.payments.find((row) => row.vendorName === "HEALTHIEST YOU");
    expect(future?.payDate).toBe("2026-11-12");
    expect(future?.afterCutoff).toBe(true);
    expect(current?.afterCutoff).toBe(false);
    expect(parsed.afterCutoffCount).toBe(1);
  });

  it("states the adopted resolution apart from the account detail", () => {
    const facts = factsFromRow({
      orig_cents: 48_886_846_381,
      rev_cents: 48_886_846_381,
      ytd_cents: 3_213_084_733,
      enc_cents: 1_943_210_289,
      transfer_orig_cents: 14_366_398_400,
      transfer_rev_cents: 14_366_398_400,
      transfer_ytd_cents: 0,
      transfer_enc_cents: 0,
      reserve_orig_cents: 55_837_200,
      debt_orig_cents: 310_857_476,
      aid_orig_cents: 532_049_000,
    });
    expect(facts.adopted).toBe(34_520_447_981);
    expect(FY2027_ADOPTED_CENTS - facts.adopted).toBe(1_902_819);
    const note = fy2027CountNote(facts);
    expect(note).toContain("$345,223,508.00");
    expect(note).toContain("$1,429,937.00");
    expect(note).toContain("$488,868,463.81");
    expect(note).toContain("$143,663,984.00");
    expect(note).toContain("$19,028.19 under the adopted resolution");
    expect(note).not.toContain("\u2013");
    expect(note).not.toContain("\u2014");
  });
});
