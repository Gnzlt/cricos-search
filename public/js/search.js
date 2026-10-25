// Pure filtering, sorting and URL (de)serialisation. No DOM access, so it can be unit tested.

export const DEFAULTS = {
  q: "", state: "", sector: "", level: "", field: "",
  minWeeks: "", maxWeeks: "", maxTotal: "", maxPerWeek: "", work: "", sort: "relevance",
};

export function readFilters(params) {
  const f = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (params.has(k)) f[k] = params.get(k);
  return f;
}

export function writeFilters(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== "" && v !== DEFAULTS[k]) p.set(k, v);
  return p;
}

const num = (s) => (s === "" || s == null ? null : Number(s));

export function filterCourses(courses, f) {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const minW = num(f.minWeeks), maxW = num(f.maxWeeks);
  const maxT = num(f.maxTotal), maxP = num(f.maxPerWeek);
  const sector = f.sector === "" ? null : Number(f.sector);
  const level = f.level === "" ? null : Number(f.level);
  const field = f.field === "" ? null : Number(f.field);

  const out = courses.filter((c) => {
    if (sector !== null && c.sector !== sector) return false;
    if (level !== null && c.level !== level) return false;
    if (field !== null && c.field !== field) return false;
    if (f.state && !c.states.includes(f.state)) return false;
    if (f.work === "1" && !c.work) return false;
    if (minW !== null && !(c.weeks >= minW)) return false;
    if (maxW !== null && !(c.weeks <= maxW)) return false;
    if (maxT !== null && !(c.total <= maxT)) return false;
    if (maxP !== null && !(c.perWeek <= maxP)) return false;
    for (const t of terms) if (!c.search.includes(t)) return false;
    return true;
  });

  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    cost: (a, b) => (a.total ?? Infinity) - (b.total ?? Infinity),
    perweek: (a, b) => (a.perWeek ?? Infinity) - (b.perWeek ?? Infinity),
    weeks: (a, b) => (b.weeks ?? -1) - (a.weeks ?? -1),
  }[f.sort];
  if (by) out.sort(by);
  return out;
}

export function toCsv(rows, providers) {
  const head = ["Course code", "Course name", "Provider", "Provider code", "Sector", "Level",
    "VET code", "Field", "Weeks", "Tuition (A$)", "Other fees (A$)", "Total cost (A$)",
    "A$ per week", "States", "Cities"];
  const q = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((c) => {
    const p = providers[c.provider];
    return [c.code, c.name, p.name, p.code, c.sectorName, c.levelName, c.vet, c.fieldName, c.weeks,
      c.tuition, c.other, c.total, c.perWeek == null ? "" : Math.round(c.perWeek),
      c.states.join(" "), c.cities.join("; ")].map(q).join(",");
  });
  return [head.map(q).join(","), ...lines].join("\n");
}

// Indexes holding the best value ("min" or "max"), ties included.
// Empty unless at least two values are present and they are not all equal.
export function bestOf(values, dir = "min") {
  const have = values.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (have.length < 2) return new Set();
  const best = Math[dir](...have.map(([v]) => v));
  if (have.every(([v]) => v === best)) return new Set();
  return new Set(have.filter(([v]) => v === best).map(([, i]) => i));
}
