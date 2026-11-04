import { describe, expect, it } from "vitest";
import { FY2027_ADOPTED_CENTS, fy2027CountNote } from "../src/answers";
import { factsFromRow } from "../src/budget";
import { isAccountDetail, parseAccountDetail } from "../src/parser";

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
    const parsed = parseAccountDetail(rows);
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
