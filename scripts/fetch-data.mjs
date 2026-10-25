// Downloads the latest CRICOS CSVs from data.gov.au and writes public/data/*.json.
// Usage: node scripts/fetch-data.mjs [--from <dir-with-csvs>]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { buildPages } from "./pages.mjs";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const OUT = join(PUBLIC, "data");
const API = "https://data.gov.au/data/api/3/action/package_show?id=cricos";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; cricos-search data refresh)" };

// Resource names as listed by the dataset, mapped to the keys build() expects.
const FILES = {
  institutions: "CRICOS Institutions.csv",
  courses: "CRICOS Courses.csv",
  locations: "CRICOS Locations.csv",
  courseLocations: "CRICOS Course Locations.csv",
};

async function get(url) {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function loadRemote() {
  const { result } = await (await get(API)).json();
  const out = {};
  let newest = "";
  for (const [key, name] of Object.entries(FILES)) {
    const r = result.resources.find((x) => x.name === name);
    if (!r) throw new Error(`Resource "${name}" not found in the dataset`);
    out[key] = await (await get(r.url)).text();
    if (r.last_modified > newest) newest = r.last_modified;
  }
  return { csv: out, sourceDate: newest.slice(0, 10) };
}

async function loadLocal(dir) {
  const names = { institutions: "institutions.csv", courses: "courses.csv",
    locations: "locations.csv", courseLocations: "course-locations.csv" };
  const out = {};
  for (const [k, f] of Object.entries(names)) out[k] = await readFile(join(dir, f), "utf8");
  return { csv: out, sourceDate: new Date().toISOString().slice(0, 10) };
}

const i = process.argv.indexOf("--from");
const { csv, sourceDate } = i > 0 ? await loadLocal(process.argv[i + 1]) : await loadRemote();
const data = build(csv, sourceDate);

// Guard against a truncated or broken export replacing good data.
try {
  const prev = JSON.parse(await readFile(join(OUT, "meta.json"), "utf8"));
  if (data.meta.courses < prev.courses * 0.8) {
    throw new Error(`Course count fell from ${prev.courses} to ${data.meta.courses}; refusing to write`);
  }
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

await mkdir(OUT, { recursive: true });
for (const k of ["meta", "courses", "providers", "locations"]) {
  await writeFile(join(OUT, `${k}.json`), JSON.stringify(data[k]));
}
console.log(data.meta);
console.log("provider pages:", await buildPages(data, PUBLIC));
