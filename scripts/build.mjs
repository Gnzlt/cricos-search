// Turns the four CRICOS CSV exports into the compact JSON the site loads.
import { parseCsv } from "./csv.mjs";

const HE_LEVELS = new Set([
  "Bachelor Degree", "Bachelor Honours Degree", "Masters Degree (Coursework)",
  "Masters Degree (Research)", "Masters Degree (Extended)", "Doctoral Degree",
  "Associate Degree", "Graduate Certificate", "Graduate Diploma", "Diploma",
]);
const SCHOOL_LEVELS = new Set([
  "Senior Secondary Certificate of Education", "Primary School Studies", "Junior Secondary Studies",
]);

export const SECTORS = ["English (ELICOS)", "Vocational (VET)", "Higher education", "School", "Other / non-award"];

export function sectorOf(c) {
  const fields = [c["Field of Education 1 Detailed Field"], c["Field of Education 2 Detailed Field"]];
  if (fields.some((f) => f.startsWith("091501"))) return 0;
  if (c["VET National Code"]) return 1;
  if (HE_LEVELS.has(c["Course Level"])) return 2;
  if (SCHOOL_LEVELS.has(c["Course Level"])) return 3;
  return 4;
}

const money = (s) => {
  const n = parseFloat((s || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Interns strings into a table and returns their index.
function interner() {
  const table = [];
  const map = new Map();
  return {
    table,
    id(s) {
      if (!map.has(s)) { map.set(s, table.length); table.push(s); }
      return map.get(s);
    },
  };
}

export function build({ institutions, courses, locations, courseLocations }, sourceDate) {
  const inst = parseCsv(institutions);
  const crs = parseCsv(courses).filter((c) => c["Expired"] === "No");
  const locs = parseCsv(locations);
  const cl = parseCsv(courseLocations);

  const provIdx = new Map();
  const providers = inst.map((p, i) => {
    provIdx.set(p["CRICOS Provider Code"], i);
    return [
      p["CRICOS Provider Code"],
      p["Trading Name"] || p["Institution Name"],
      p["Institution Name"],
      p["Institution Type"],
      p["Website"],
      p["Postal Address City"],
      p["Postal Address State"],
    ];
  });

  const locIdx = new Map();
  const locTable = [];
  for (const l of locs) {
    const p = provIdx.get(l["CRICOS Provider Code"]);
    if (p === undefined) continue;
    locIdx.set(`${l["CRICOS Provider Code"]}|${l["Location Name"]}`, locTable.length);
    const address = [1, 2, 3, 4].map((n) => l[`Address Line ${n}`]).filter(Boolean).join(", ");
    locTable.push([p, l["Location Name"], address, l["City"], l["State"], l["Postcode"]]);
  }

  const courseLocs = new Map();
  for (const r of cl) {
    const i = locIdx.get(`${r["CRICOS Provider Code"]}|${r["Location Name"]}`);
    if (i === undefined) continue;
    const k = r["CRICOS Course Code"];
    if (!courseLocs.has(k)) courseLocs.set(k, new Set());
    courseLocs.get(k).add(i);
  }

  const level = interner();
  const broad = interner();
  const detail = interner();
  const rows = [];
  for (const c of crs) {
    const code = c["CRICOS Course Code"];
    const p = provIdx.get(c["CRICOS Provider Code"]);
    const places = courseLocs.get(code);
    if (p === undefined || !places) continue;
    const weeks = parseInt(c["Duration (Weeks)"], 10);
    rows.push([
      code,
      c["Course Name"],
      p,
      sectorOf(c),
      level.id(c["Course Level"]),
      c["VET National Code"],
      broad.id(c["Field of Education 1 Broad Field"]),
      detail.id(c["Field of Education 1 Detailed Field"]),
      Number.isFinite(weeks) ? weeks : null,
      money(c["Tuition Fee"]),
      money(c["Non Tuition Fee"]),
      money(c["Estimated Total Course Cost"]),
      c["Work Component"] === "Yes" ? 1 : 0,
      c["Foundation Studies"] === "Yes" ? 1 : 0,
      c["Course Language"],
      [...places].sort((a, b) => a - b),
    ]);
  }

  const meta = {
    source: "https://data.gov.au/data/dataset/cricos",
    sourceDate,
    courses: rows.length,
    providers: providers.length,
    locations: locTable.length,
  };
  return {
    meta,
    courses: {
      cols: ["code", "name", "provider", "sector", "level", "vet", "field", "detail", "weeks",
        "tuition", "other", "total", "work", "foundation", "language", "locations"],
      sectors: SECTORS,
      levels: level.table,
      fields: broad.table,
      details: detail.table,
      rows,
    },
    providers: {
      cols: ["code", "name", "legalName", "type", "website", "city", "state"],
      rows: providers,
    },
    locations: {
      cols: ["provider", "name", "address", "city", "state", "postcode"],
      rows: locTable,
    },
  };
}
