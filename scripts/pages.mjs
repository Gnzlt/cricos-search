// Pre-renders crawlable HTML (provider pages, provider index, sitemap) from build() output.
// The app itself uses hash routes, which search engines ignore; these pages are what gets indexed.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE = process.env.SITE_URL || "https://cricos.gnzlt.com";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const title = (s) => s.toLowerCase().replace(/(^|[\s\-(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

// Trading names of provider groups can be a long "A; B; C" list: use the first for titles.
const shortName = (name) => name.split(";")[0].trim();
const siteUrl = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`);

function layout({ title, description, path, body, jsonld, depthNote = "" }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="theme-color" content="#98012e">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="CRICOS Search">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${SITE}/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/css/styles.css">
  <script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="top">
    <a class="brand" href="/">CRICOS Search</a>
    <nav aria-label="Main">
      <a href="/">Courses</a>
      <a href="/providers/">Providers</a>
      <a href="/#/compare">Compare</a>
      <a href="/#/about">About</a>
    </nav>
  </header>
  <main id="main" tabindex="-1">
${body}
  </main>
  <footer class="foot">
    <p>Data: CRICOS register, Australian Government Department of Education (<a href="https://data.gov.au/data/dataset/cricos" rel="noopener">data.gov.au</a>, CC BY 2.5 AU).${depthNote}</p>
    <p>Unofficial. Not affiliated with the Australian Government or the Department of Education. Always confirm details with the provider and on the official <a href="https://cricos.education.gov.au/" rel="noopener">CRICOS register</a>.</p>
    <p class="credit">Made by <a href="https://gnzlt.com" rel="noopener">gnzlt.com</a> · <a href="https://github.com/Gnzlt/cricos-search" rel="noopener">Source code</a></p>
  </footer>
</body>
</html>
`;
}

export async function buildPages(data, publicDir) {
  const { cols } = data.courses;
  const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const byProvider = new Map();
  for (const r of data.courses.rows) {
    if (!byProvider.has(r[ix.provider])) byProvider.set(r[ix.provider], []);
    byProvider.get(r[ix.provider]).push(r);
  }
  const locsByProvider = new Map();
  for (const l of data.locations.rows) {
    if (!locsByProvider.has(l[0])) locsByProvider.set(l[0], []);
    locsByProvider.get(l[0]).push(l);
  }

  await rm(join(publicDir, "provider"), { recursive: true, force: true });
  await rm(join(publicDir, "providers"), { recursive: true, force: true });

  const listed = [];
  for (const [pi, courses] of byProvider) {
    const [code, name, legalName, type, website, , state] = data.providers.rows[pi];
    const places = [...new Map((locsByProvider.get(pi) || []).map((l) => [`${l[3]}|${l[4]}`, l])).values()];
    const cities = [...new Set(places.map((l) => title(l[3])))].slice(0, 4);
    const label = shortName(name);
    courses.sort((a, b) => a[ix.name].localeCompare(b[ix.name]));
    const path = `/provider/${code}/`;
    const pageTitle = `${clip(label, 55)} courses for international students | CRICOS Search`;
    const description = clip(
      `${courses.length} CRICOS-registered course${courses.length === 1 ? "" : "s"} at ${label}` +
      `${cities.length ? ` in ${cities.join(", ")}` : ""}. Compare durations, levels and fees.`, 158);

    const rows = courses.map((r) => `        <tr><td><a href="/#/course/${esc(r[ix.code])}">${esc(r[ix.name])}</a></td><td>${esc(data.courses.levels[r[ix.level]])}</td><td>${r[ix.weeks] ?? "—"}</td><td>${r[ix.total] == null ? "—" : aud.format(r[ix.total])}</td><td>${esc(r[ix.code])}</td></tr>`).join("\n");
    const body = `    <p class="crumb"><a href="/providers/">← All providers</a></p>
    <h1>${esc(label)}</h1>
    <p class="muted">CRICOS provider code ${esc(code)} · ${esc(type)}${place(places)}</p>
    <div class="actions">
      <a class="btn primary" href="/#/provider/${esc(code)}">Search and compare these courses</a>
      ${website ? `<a class="btn" href="${esc(siteUrl(website))}" rel="noopener" target="_blank">Provider website ↗</a>` : ""}
    </div>
    ${legalName && legalName !== label ? `<p class="muted">Registered as ${esc(legalName)}${name !== label ? `. Also trades as ${esc(name)}` : ""}.</p>` : ""}
    <h2>${courses.length} current course${courses.length === 1 ? "" : "s"}</h2>
    <div class="cmp"><table>
      <thead><tr><th scope="col">Course</th><th scope="col">Level</th><th scope="col">Weeks</th><th scope="col">Est. total</th><th scope="col">Code</th></tr></thead>
      <tbody>
${rows}
      </tbody></table></div>
    <p class="muted">Fees are as declared by the provider on the register and are often older than its current price list. Confirm with the provider.</p>`;
    const jsonld = {
      "@context": "https://schema.org", "@type": "EducationalOrganization", name: label,
      ...(website ? { url: siteUrl(website) } : {}),
      identifier: `CRICOS ${code}`,
    };
    const dir = join(publicDir, "provider", code);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), layout({ title: pageTitle, description, path, body, jsonld }));
    listed.push({ code, label, count: courses.length, state });
  }

  // Provider index: gives crawlers (and people) a path to every provider page.
  listed.sort((a, b) => a.label.localeCompare(b.label));
  const items = listed.map((p) => `      <li><a href="/provider/${esc(p.code)}/">${esc(p.label)}</a> <span class="muted">${p.count}</span></li>`).join("\n");
  await mkdir(join(publicDir, "providers"), { recursive: true });
  await writeFile(join(publicDir, "providers", "index.html"), layout({
    title: "All CRICOS providers in Australia | CRICOS Search",
    description: `Browse ${listed.length.toLocaleString("en-AU")} CRICOS-registered education providers in Australia that can enrol international students, with their current courses.`,
    path: "/providers/",
    jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "CRICOS providers", url: `${SITE}/providers/` },
    body: `    <h1>CRICOS providers</h1>
    <p class="muted">${listed.length.toLocaleString("en-AU")} providers with current courses open to international students. The number is how many courses each has.</p>
    <ul class="plist">
${items}
    </ul>`,
  }));

  const date = data.meta.sourceDate;
  const urls = [["/", "1.0"], ["/providers/", "0.8"], ...listed.map((p) => [`/provider/${p.code}/`, "0.6"])];
  await writeFile(join(publicDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${date}</lastmod><priority>${pr}</priority></url>`).join("\n") +
    `\n</urlset>\n`);
  await writeFile(join(publicDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  return listed.length;
}

function place(places) {
  const cs = [...new Set(places.map((l) => `${title(l[3])} ${l[4]}`))].slice(0, 6);
  return cs.length ? ` · ${esc(cs.join(", "))}` : "";
}
