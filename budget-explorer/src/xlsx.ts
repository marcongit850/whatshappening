import { strFromU8, Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { stripC0Controls } from "./text";

/**
 * Uncompressed caps for the Worker import.
 * The FY2027 account detail workbook is about 9 MB uncompressed, so it still fits.
 * One entry cannot be larger than the total.
 */
export const XLSX_MAX_ENTRY_BYTES = 30_000_000;
export const XLSX_MAX_TOTAL_BYTES = 30_000_000;
/** Compressed .xlsx cap. Rejected before any unzip. Matches the upload cap. */
export const XLSX_MAX_COMPRESSED_BYTES = 20_000_000;
/** Push this much compressed input at a time so a forged size can be stopped early. */
export const ZIP_PUSH_BYTES = 4096;

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
  const decoded = value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&amp;/g, "&");
  return stripC0Controls(decoded);
}

function isNameBoundary(char: string | undefined): boolean {
  return char === undefined || char === ">" || char === "/" || char === " " || char === "\t" || char === "\n" || char === "\r";
}

function tagEnd(xml: string, from: number): number {
  let quote = "";
  for (let i = from; i < xml.length; i += 1) {
    const char = xml[i];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return i;
  }
  return -1;
}

/** Find the next `<name` element. An unclosed tag stops the scan instead of backtracking. */
function readTag(xml: string, name: string, from: number): { attrs: string; body: string; next: number } | null {
  const needle = `<${name}`;
  let pos = from;
  while (pos < xml.length) {
    const start = xml.indexOf(needle, pos);
    if (start < 0) return null;
    if (!isNameBoundary(xml[start + needle.length])) {
      pos = start + needle.length;
      continue;
    }
    const openEnd = tagEnd(xml, start + needle.length);
    if (openEnd < 0) return null;
    const selfClosing = xml[openEnd - 1] === "/";
    const attrs = xml.slice(start + needle.length, selfClosing ? openEnd - 1 : openEnd);
    if (selfClosing) return { attrs, body: "", next: openEnd + 1 };
    const closeNeedle = `</${name}>`;
    const close = xml.indexOf(closeNeedle, openEnd + 1);
    if (close < 0) return null;
    return { attrs, body: xml.slice(openEnd + 1, close), next: close + closeNeedle.length };
  }
  return null;
}

function textContent(xml: string, name: string): string {
  let out = "";
  let pos = 0;
  while (pos < xml.length) {
    const tag = readTag(xml, name, pos);
    if (!tag) break;
    out += decodeXml(tag.body);
    pos = tag.next;
  }
  return out;
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function wantedSheet(name: string): boolean {
  return name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
}

/** Actual uncompressed bytes must not exceed the declared size, the entry cap, or the total cap. */
export function uncompressedWithinLimits(actual: number, declared: number, total: number, limits: ZipLimits): boolean {
  if (actual > declared) return false;
  if (actual > limits.entry) return false;
  if (total > limits.total) return false;
  return true;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Feed the unzipper a few kilobytes at a time. One push of the whole buffer
 * inflates that whole buffer before the size check can run. A 4 KB slice
 * bounds how far inflation gets after a forged uncompressed size is noticed.
 * The final flag is set only on the last slice.
 */
function pushSliced(unzipper: Unzip, buffer: Uint8Array): void {
  const size = buffer.length;
  if (size === 0) {
    unzipper.push(buffer, true);
    return;
  }
  for (let offset = 0; offset < size; offset += ZIP_PUSH_BYTES) {
    const end = Math.min(offset + ZIP_PUSH_BYTES, size);
    unzipper.push(buffer.subarray(offset, end), end === size);
  }
}

/**
 * Unzip with a hard stop. The compressed buffer is capped by the caller.
 * Declared sizes are checked before inflate. Actual output is counted and
 * aborted when it passes the declared size or the total cap.
 */
export function unzipChecked(buffer: Uint8Array, limits: ZipLimits): Record<string, Uint8Array> {
  const out = new Map<string, Uint8Array[]>();
  let declaredTotal = 0;
  let actualTotal = 0;
  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  unzipper.onfile = (file: UnzipFile) => {
    if (file.size == null || file.originalSize == null || file.size < 0 || file.originalSize < 0) {
      throw new Error("Spreadsheet entry is missing a size.");
    }
    const decision = zipEntryAllowed({ size: file.size, originalSize: file.originalSize }, declaredTotal, limits);
    if (!decision.ok) throw new Error("Spreadsheet entry is too large.");
    declaredTotal = decision.total;
    if (!wantedSheet(file.name)) return;
    const declared = file.originalSize;
    const chunks: Uint8Array[] = [];
    let actual = 0;
    file.ondata = (err, chunk, final) => {
      if (err) throw err instanceof Error ? err : new Error("Spreadsheet could not be read.");
      if (chunk && chunk.length) {
        actual += chunk.length;
        actualTotal += chunk.length;
        if (!uncompressedWithinLimits(actual, declared, actualTotal, limits)) {
          const overDeclared = actual > declared;
          throw new Error(overDeclared ? "Spreadsheet entry is larger than declared." : "Spreadsheet entry is too large.");
        }
        chunks.push(chunk);
      }
      if (final) out.set(file.name, chunks);
    };
    file.start();
  };
  pushSliced(unzipper, buffer);
  const files: Record<string, Uint8Array> = {};
  for (const [name, chunks] of out) files[name] = concatChunks(chunks);
  return files;
}

export function xlsxToRows(buffer: Uint8Array, limits: ZipLimits = { entry: XLSX_MAX_ENTRY_BYTES, total: XLSX_MAX_TOTAL_BYTES }): string[][] {
  if (buffer.byteLength > XLSX_MAX_COMPRESSED_BYTES) throw new Error("Spreadsheet is too large.");
  const files = unzipChecked(buffer, limits);
  const strings: string[] = [];
  const shared = files["xl/sharedStrings.xml"];
  if (shared) {
    const xml = strFromU8(shared);
    let pos = 0;
    while (pos < xml.length) {
      const item = readTag(xml, "si", pos);
      if (!item) break;
      strings.push(textContent(item.body, "t"));
      pos = item.next;
    }
  }
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) return [];
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  let pos = 0;
  while (pos < xml.length) {
    const row = readTag(xml, "row", pos);
    if (!row) break;
    pos = row.next;
    const cells: string[] = [];
    let cursor = 0;
    let cellPos = 0;
    while (cellPos < row.body.length) {
      const cell = readTag(row.body, "c", cellPos);
      if (!cell) break;
      cellPos = cell.next;
      const ref = /r="([A-Z]+)\d+"/.exec(cell.attrs);
      const index = ref ? columnIndex(ref[1]) : cursor;
      while (cells.length < index) cells.push("");
      const type = /t="([^"]+)"/.exec(cell.attrs)?.[1] || "";
      let value = textContent(cell.body, "v");
      if (type === "s") value = strings[Number(value)] || "";
      if (type === "inlineStr") value = textContent(cell.body, "t");
      cells[index] = value;
      cursor = index + 1;
    }
    if (cells.some((value) => value.trim())) rows.push(cells);
  }
  return rows;
}
