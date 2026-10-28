/**
 * Build inline SVG path data for the public door.
 *
 * State and county outlines come from the us-atlas 1:10,000,000 Albers USA
 * files, which redistribute U.S. Census Bureau cartographic boundary
 * shapefiles (public domain). County names come from the Census 2020
 * national county file in scripts/census/national_county2020.txt (public domain).
 *
 * Run from budget-explorer: npm run maps
 * Output is committed. The Worker does not fetch maps at runtime.
 * County shapes are written for Florida only. Other states stay on the national map.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const geoDir = join(root, "src", "geo");
const countyDir = join(geoDir, "counties");

const ABBR = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

function loadTopo(name) {
  const path = join(root, "node_modules", "us-atlas", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadCensus() {
  const text = readFileSync(join(root, "scripts", "census", "national_county2020.txt"), "utf8").replace(/^\uFEFF/, "");
  const byFips = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split("|");
    const stateFp = parts[1];
    const countyFp = parts[2];
    const name = parts[4];
    const classFp = parts[5];
    if (!ABBR[stateFp] || !name) continue;
    byFips.set(`${stateFp}${countyFp}`, { name, classFp, stateFp });
  }
  return byFips;
}

function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function bboxOf(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function dedupe(ring) {
  const out = [];
  for (const point of ring) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === point[0] && prev[1] === point[1]) continue;
    out.push(point);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

function encode(rings) {
  let d = "";
  for (const ring of rings) {
    if (ring.length < 3) continue;
    d += `M${ring[0][0]} ${ring[0][1]}`;
    for (let i = 1; i < ring.length; i += 1) {
      const dx = ring[i][0] - ring[i - 1][0];
      const dy = ring[i][1] - ring[i - 1][1];
      if (dx === 0 && dy === 0) continue;
      d += `l${dx} ${dy}`;
    }
    d += "Z";
  }
  return d;
}

function mapRings(rings, project) {
  return rings.map((ring) => dedupe(ring.map(project))).filter((ring) => ring.length >= 3);
}

function squareAt(cx, cy, size) {
  const s = size / 2;
  return [[Math.round(cx - s), Math.round(cy - s)], [Math.round(cx + s), Math.round(cy - s)], [Math.round(cx + s), Math.round(cy + s)], [Math.round(cx - s), Math.round(cy + s)]];
}

function slugifyName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function preferredSlug(officialName) {
  const stripped = officialName
    .replace(/ City and Borough$/, "")
    .replace(/ Census Areas$/, "")
    .replace(/ Census Area$/, "")
    .replace(/ Municipality$/, "")
    .replace(/ Parish$/, "")
    .replace(/ Borough$/, "")
    .replace(/ County$/, "")
    .replace(/ city$/, "");
  return slugifyName(stripped);
}

function classify(name, classFp) {
  if (name === "District of Columbia") return "district";
  if (name.endsWith(" Parish")) return "parish";
  if (name.endsWith(" Census Area") || name.endsWith(" Census Areas")) return "census-area";
  if (name.endsWith(" City and Borough")) return "city-borough";
  if (name.endsWith(" Borough")) return "borough";
  if (name.endsWith(" Municipality")) return "municipality";
  if (name.endsWith(" city") || classFp === "C7") return "city";
  return "county";
}

function displayName(name, kind) {
  if (kind === "city" && name.endsWith(" city")) return `${name.slice(0, -5)} City`;
  return name;
}

function stateSlug(name) {
  return slugifyName(name);
}

const statesTopo = loadTopo("states-albers-10m.json");
const countiesTopo = loadTopo("counties-albers-10m.json");
const stateFeatures = feature(statesTopo, statesTopo.objects.states).features;
const countyFeatures = feature(countiesTopo, countiesTopo.objects.counties).features;
const census = loadCensus();
// us-atlas 10m still draws FIPS 02261, retired in 2019 when Valdez-Cordova
// was split. The two current areas share that one shape.
census.set("02261", { name: "Chugach and Copper River Census Areas", classFp: "H5", stateFp: "02" });

const stateRings = new Map();
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const item of stateFeatures) {
  const rings = ringsOf(item.geometry);
  stateRings.set(item.id, rings);
  const box = bboxOf(rings);
  if (box.minX < minX) minX = box.minX;
  if (box.minY < minY) minY = box.minY;
  if (box.maxX > maxX) maxX = box.maxX;
  if (box.maxY > maxY) maxY = box.maxY;
}

const pad = 8;
const shiftX = (x) => Math.round(x - minX + pad);
const shiftY = (y) => Math.round(y - minY + pad);
const shiftedMaxX = shiftX(maxX);
const dcBox = { x: shiftedMaxX + 18, y: shiftY(200), w: 92, h: 108 };
const viewWidth = dcBox.x + dcBox.w + pad;
const viewHeight = Math.max(shiftY(maxY) + pad, dcBox.y + dcBox.h + pad);

const states = [];
for (const item of stateFeatures) {
  const fips = String(item.id).padStart(2, "0");
  const name = item.properties?.name;
  const abbr = ABBR[fips];
  if (!name || !abbr) throw new Error(`Missing state name for ${item.id}`);
  const slug = stateSlug(name);
  const projected = mapRings(stateRings.get(item.id) || [], ([x, y]) => [shiftX(x), shiftY(y)]);
  let d = encode(projected);
  const box = bboxOf(projected);
  const cx = Math.round((box.minX + box.maxX) / 2);
  const cy = Math.round((box.minY + box.maxY) / 2);
  let silhouette = {
    x: box.minX,
    y: box.minY,
    w: Math.max(1, box.maxX - box.minX),
    h: Math.max(1, box.maxY - box.minY),
  };
  let hit;
  if (fips === "11") {
    const raw = stateRings.get(item.id) || [];
    const src = bboxOf(raw);
    const dest = { x: dcBox.x + 8, y: dcBox.y + 28, w: dcBox.w - 16, h: dcBox.h - 38 };
    const scale = Math.min(dest.w / (src.maxX - src.minX || 1), dest.h / (src.maxY - src.minY || 1));
    const drawnW = (src.maxX - src.minX) * scale;
    const drawnH = (src.maxY - src.minY) * scale;
    const ox = dest.x + (dest.w - drawnW) / 2;
    const oy = dest.y + (dest.h - drawnH) / 2;
    const inset = mapRings(raw, ([x, y]) => [Math.round(ox + (x - src.minX) * scale), Math.round(oy + (y - src.minY) * scale)]);
    d += encode(inset);
    silhouette = { x: dcBox.x, y: dcBox.y, w: dcBox.w, h: dcBox.h };
    hit = { cx, cy, r: 28 };
  } else if (fips === "44" || fips === "10") {
    hit = { cx, cy, r: 32 };
  } else if (fips === "15") {
    hit = { cx, cy, r: 42 };
  } else if (Math.min(box.maxX - box.minX, box.maxY - box.minY) < 28) {
    hit = { cx, cy, r: 24 };
  }
  states.push({ fips, abbr, name, slug, d, box: silhouette, ...(hit ? { hit } : {}) });
}

states.sort((a, b) => a.fips.localeCompare(b.fips));

const byState = new Map();
const missing = [];
for (const item of countyFeatures) {
  const fips = String(item.id).padStart(5, "0");
  const row = census.get(fips);
  if (!row) {
    missing.push(fips);
    continue;
  }
  const list = byState.get(row.stateFp) || [];
  list.push({ fips, row, geometry: item.geometry });
  byState.set(row.stateFp, list);
}
if (missing.length) throw new Error(`No Census name for ${missing.join(", ")}`);

rmSync(countyDir, { recursive: true, force: true });
mkdirSync(countyDir, { recursive: true });

const stateByFips = new Map(states.map((state) => [state.fips, state]));
let countyCount = 0;
let countyBytes = 0;
const registryImports = [];
const countyMapSlugs = new Set(["florida"]);

for (const state of states) {
  if (!countyMapSlugs.has(state.slug)) continue;
  const rows = byState.get(state.fips) || [];
  if (!rows.length) throw new Error(`No counties for ${state.name}`);
  const allRings = rows.flatMap((row) => ringsOf(row.geometry));
  const src = bboxOf(allRings);
  const width = 720;
  const spanX = src.maxX - src.minX || 1;
  const spanY = src.maxY - src.minY || 1;
  const topPad = state.slug === "florida" ? 36 : pad;
  const scale = (width - pad * 2) / spanX;
  const height = Math.round(spanY * scale + topPad + pad);
  const project = ([x, y]) => [Math.round((x - src.minX) * scale + pad), Math.round((y - src.minY) * scale + topPad)];

  const taken = new Set();
  const ordered = [...rows].sort((a, b) => {
    const ak = classify(a.row.name, a.row.classFp) === "city" ? 1 : 0;
    const bk = classify(b.row.name, b.row.classFp) === "city" ? 1 : 0;
    return ak - bk || a.row.name.localeCompare(b.row.name);
  });
  const counties = [];
  for (const row of ordered) {
    const kind = classify(row.row.name, row.row.classFp);
    let slug = kind === "district" ? "district" : preferredSlug(row.row.name);
    if (taken.has(slug)) slug = `${slug}-${kind === "city" ? "city" : kind}`;
    if (taken.has(slug)) throw new Error(`Slug collision in ${state.name}: ${slug}`);
    taken.add(slug);
    const projected = mapRings(ringsOf(row.geometry), project);
    let rings = projected;
    if (!encode(rings)) {
      const rawBox = bboxOf(ringsOf(row.geometry));
      const cx = project([(rawBox.minX + rawBox.maxX) / 2, 0])[0];
      const cy = project([0, (rawBox.minY + rawBox.maxY) / 2])[1];
      rings = [squareAt(cx, cy, 8)];
    }
    const drawn = bboxOf(rings);
    const county = { fips: row.fips, slug, name: displayName(row.row.name, kind), kind, d: encode(rings) };
    if (slug === "walton") {
      const midX = Math.round((drawn.minX + drawn.maxX) / 2);
      const midY = Math.round((drawn.minY + drawn.maxY) / 2);
      const labelY = Math.max(16, drawn.minY - 16);
      county.label = { x: midX, y: labelY, ax: midX, ay: drawn.minY };
      const span = Math.max(drawn.maxX - drawn.minX, drawn.maxY - drawn.minY);
      county.hit = { cx: midX, cy: midY, r: Math.max(22, Math.round(span * 0.7)) };
    }
    counties.push(county);
  }
  counties.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  const payload = { viewBox: `0 0 ${width} ${height}`, counties };
  const file = join(countyDir, `${state.slug}.json`);
  const json = JSON.stringify(payload);
  writeFileSync(file, json);
  countyBytes += json.length;
  countyCount += counties.length;
  registryImports.push(state.slug);
  if (!stateByFips.has(state.fips)) throw new Error(state.name);
}

function insetFrame(abbr, label) {
  const state = states.find((item) => item.abbr === abbr);
  const box = state.box;
  return { id: abbr.toLowerCase(), label, x: box.x - 4, y: box.y - 22, w: box.w + 8, h: box.h + 26 };
}

const stateFile = {
  viewBox: `0 0 ${viewWidth} ${viewHeight}`,
  insets: [insetFrame("AK", "AK"), insetFrame("HI", "HI"), { id: "dc", label: "DC", x: dcBox.x, y: dcBox.y, w: dcBox.w, h: dcBox.h }],
  states,
};
const statesJson = JSON.stringify(stateFile);
writeFileSync(join(geoDir, "states.json"), statesJson);

const importLines = registryImports.map((slug) => `import ${ident(slug)} from "./counties/${slug}.json";`).join("\n");
const mapLines = registryImports.map((slug) => `  "${slug}": ${ident(slug)} as CountyFile,`).join("\n");
const registry = `// Generated by scripts/build-maps.mjs. Do not edit by hand.
import type { CountyFile, StateMapFile } from "./types";
import states from "./states.json";
${importLines}

export const STATE_MAP = states as StateMapFile;
export const COUNTY_MAPS: Record<string, CountyFile> = {
${mapLines}
};
`;
writeFileSync(join(geoDir, "registry.ts"), registry);

function ident(slug) {
  return slug.replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase());
}

console.log(`states ${states.length} bytes ${statesJson.length}`);
console.log(`counties ${countyCount} files ${registryImports.length} bytes ${countyBytes}`);
console.log(`viewBox ${stateFile.viewBox}`);
const florida = JSON.parse(readFileSync(join(countyDir, "florida.json"), "utf8"));
const walton = florida.counties.find((county) => county.slug === "walton");
console.log("florida counties", florida.counties.length, "walton", walton && walton.name);
