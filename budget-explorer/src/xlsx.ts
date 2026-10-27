import { strFromU8, unzipSync } from "fflate";

export const XLSX_MAX_ENTRY_BYTES = 2_000_000;
export const XLSX_MAX_TOTAL_BYTES = 8_000_000;

export interface ZipLimits {
  entry: number;
  total: number;
}

export function zipEntryAllowed(
  entry: { size: number; originalSize: number },
  totalSoFar: number,
  limits: ZipLimits,
): { ok: boolean; total: number } {
  const next = totalSoFar + Math.max(entry.size, entry.originalSize, 0);
  if (entry.size > limits.entry || entry.originalSize > limits.entry || next > limits.total) {
    return { ok: false, total: next };
  }
  return { ok: true, total: next };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&amp;/g, "&");
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export function xlsxToRows(buffer: Uint8Array, limits: ZipLimits = { entry: XLSX_MAX_ENTRY_BYTES, total: XLSX_MAX_TOTAL_BYTES }): string[][] {
  let total = 0;
  const files = unzipSync(buffer, {
    filter(file) {
      const decision = zipEntryAllowed(file, total, limits);
      total = decision.total;
      if (!decision.ok) throw new Error("Spreadsheet entry is too large.");
      return file.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name);
    },
  });
  const strings: string[] = [];
  const shared = files["xl/sharedStrings.xml"];
  if (shared) {
    const xml = strFromU8(shared);
    const items = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
    for (const item of items) {
      const texts = [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
      strings.push(texts.join(""));
    }
  }
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) return [];
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let cursor = 0;
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] || "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      const index = ref ? columnIndex(ref[1]) : cursor;
      while (cells.length < index) cells.push("");
      const type = /t="([^"]+)"/.exec(attrs)?.[1] || "";
      let value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "";
      value = decodeXml(value);
      if (type === "s") value = strings[Number(value)] || "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
      }
      cells[index] = value;
      cursor = index + 1;
    }
    if (cells.some((value) => value.trim())) rows.push(cells);
  }
  return rows;
}
