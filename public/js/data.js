// Loads the generated JSON and builds lookup structures used by the UI.
async function getJson(name, version) {
  const res = await fetch(`data/${name}.json?v=${version}`);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return res.json();
}

// The register stores some cities in capitals; leave mixed-case names alone.
const tidyCity = (c) => (c === c.toUpperCase()
  ? c.toLowerCase().replace(/(^|[\s\-(])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : c);

export async function loadData() {
  const meta = await (await fetch("data/meta.json", { cache: "no-cache" })).json();
  const v = meta.sourceDate;
  const [c, p, l] = await Promise.all([
    getJson("courses", v), getJson("providers", v), getJson("locations", v),
  ]);

  const providers = p.rows.map((r) => Object.fromEntries(p.cols.map((k, i) => [k, r[i]])));
  const locations = l.rows.map((r) => ({
    provider: r[0], name: r[1], address: r[2], city: tidyCity(r[3]), state: r[4], postcode: r[5],
  }));
  const byProvider = providers.map(() => []);

  const courses = c.rows.map((r) => {
    const o = Object.fromEntries(c.cols.map((k, i) => [k, r[i]]));
    o.sectorName = c.sectors[o.sector];
    o.levelName = c.levels[o.level];
    o.fieldName = c.fields[o.field];
    o.detailName = c.details[o.detail];
    o.perWeek = o.total && o.weeks ? o.total / o.weeks : null;
    o.states = [...new Set(o.locations.map((i) => locations[i].state))].sort();
    o.cities = [...new Set(o.locations.map((i) => locations[i].city))].sort();
    const prov = providers[o.provider];
    o.search = `${o.name} ${prov.name} ${prov.legalName} ${o.code} ${prov.code} ${o.vet}`.toLowerCase();
    byProvider[o.provider].push(o);
    return o;
  });

  providers.forEach((pr, i) => {
    pr.courses = byProvider[i];
    pr.locations = [];
  });
  const providerByCode = new Map(providers.map((x) => [x.code, x]));
  locations.forEach((loc) => providerByCode.get(loc.provider)?.locations.push(loc));

  return {
    meta,
    courses,
    providers,
    locations,
    byCode: new Map(courses.map((x) => [x.code, x])),
    providerByCode,
    sectors: c.sectors,
    levels: c.levels,
    fields: c.fields,
    states: [...new Set(locations.map((x) => x.state))].filter(Boolean).sort(),
  };
}
