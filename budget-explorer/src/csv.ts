export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ""));
}

export interface ChartNames {
  funds: { code: string; name: string }[];
  departments: { code: string; name: string }[];
  objects: { code: string; name: string }[];
}

function headerIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""));
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function mostCommon(pairs: { code: string; name: string }[]): { code: string; name: string }[] {
  const counts = new Map<string, Map<string, number>>();
  for (const pair of pairs) {
    const code = pair.code.trim();
    const name = pair.name.trim();
    if (!code || !name) continue;
    if (!counts.has(code)) counts.set(code, new Map());
    const names = counts.get(code)!;
    names.set(name, (names.get(name) || 0) + 1);
  }
  const out: { code: string; name: string }[] = [];
  for (const [code, names] of counts) {
    let best = "";
    let bestCount = -1;
    for (const [name, count] of names) {
      if (count > bestCount) {
        best = name;
        bestCount = count;
      }
    }
    if (best) out.push({ code, name: best });
  }
  return out;
}

export function chartFromRows(rows: string[][]): ChartNames | null {
  if (!rows.length) return null;
  const headers = rows[0];
  const fundCode = headerIndex(headers, ["fundcode", "fund"]);
  const fundName = headerIndex(headers, ["fundname", "fundtitle"]);
  const deptCode = headerIndex(headers, ["deptcode", "departmentcode", "dept"]);
  const deptName = headerIndex(headers, ["deptname", "departmentname", "department"]);
  const objectCode = headerIndex(headers, ["objectcode", "objcode", "object"]);
  const objectName = headerIndex(headers, ["objectname", "objname"]);
  if (fundCode < 0 && deptCode < 0 && objectCode < 0) return null;
  const funds: { code: string; name: string }[] = [];
  const departments: { code: string; name: string }[] = [];
  const objects: { code: string; name: string }[] = [];
  for (const row of rows.slice(1)) {
    if (fundCode >= 0 && fundName >= 0) funds.push({ code: row[fundCode] || "", name: row[fundName] || "" });
    if (deptCode >= 0 && deptName >= 0) departments.push({ code: row[deptCode] || "", name: row[deptName] || "" });
    if (objectCode >= 0 && objectName >= 0) objects.push({ code: row[objectCode] || "", name: row[objectName] || "" });
  }
  return {
    funds: mostCommon(funds),
    departments: mostCommon(departments),
    objects: mostCommon(objects),
  };
}

export function chartFromCsv(text: string): ChartNames | null {
  return chartFromRows(parseCsv(text));
}
