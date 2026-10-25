import { loadData } from "./data.js";
import { DEFAULTS, bestOf, filterCourses, readFilters, writeFilters, toCsv } from "./search.js";

const $main = document.getElementById("main");
const PAGE = 40;
const MAX_COMPARE = 4;
let D;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const money = (n) => (n == null ? "—" : aud.format(n));
const weeksText = (w) => (w == null ? "—" : `${w} week${w === 1 ? "" : "s"}`);
const siteUrl = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`);
const officialCourse = (c) =>
  `https://cricos.education.gov.au/Course/CourseDetails.aspx?CourseCode=${encodeURIComponent(c)}`;

// --- compare shortlist (localStorage is optional; the URL can carry it too) ---
function readShortlist() {
  try { return JSON.parse(localStorage.getItem("compare") || "[]"); } catch { return []; }
}
function writeShortlist(list) {
  try { localStorage.setItem("compare", JSON.stringify(list)); } catch { /* storage unavailable */ }
  const el = document.getElementById("cmp-count");
  el.textContent = list.length;
  el.hidden = list.length === 0;
}
function toggleCompare(code) {
  const list = readShortlist();
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1);
  else if (list.length < MAX_COMPARE) list.push(code);
  else alertInline(`You can compare up to ${MAX_COMPARE} courses.`);
  writeShortlist(list);
  return list;
}
function alertInline(msg) {
  const live = document.getElementById("live") || Object.assign(document.createElement("div"), { id: "live" });
  live.setAttribute("role", "status");
  live.className = "sr";
  live.textContent = msg;
  document.body.append(live);
}

// --- routing ---
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  const view = parts[0] || "search";
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.toggleAttribute("aria-current", a.dataset.nav === view || (view !== "compare" && view !== "about" && a.dataset.nav === "search")));
  document.querySelectorAll("[data-nav][aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));

  if (view === "course") courseView(parts[1]);
  else if (view === "provider") providerView(parts[1], params);
  else if (view === "compare") compareView(params);
  else if (view === "about") aboutView();
  else searchView(params);
  document.title = document.querySelector("h1")?.textContent
    ? `${document.querySelector("h1").textContent} · CRICOS Search` : "CRICOS Search";
  if (!params.has("keep")) window.scrollTo(0, 0);
}

// --- shared pieces ---
// 16px line icons, drawn by hand; colour comes from the surrounding text.
const ICONS = {
  building: '<path d="M3 14V3h7v11M10 7h3v7M1.5 14h13M5.5 6h2M5.5 9h2"/>',
  pin: '<path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8z"/><circle cx="8" cy="6.5" r="1.6"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.2 1.5"/>',
  wallet: '<path d="M2 4.5h11a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5zM2 4.5l9-2v2M10.5 9.5h3"/>',
  week: '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
  hash: '<path d="M6 2.5L5 13.5M11 2.5l-1 11M2.5 6h11M2 10h11"/>',
};
const ico = (n) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICONS[n]}</svg>`;
const compareLabel = (on) => (on ? "✓ Added" : "+ Compare");

function courseCard(c) {
  const p = D.providers[c.provider];
  const inList = readShortlist().includes(c.code);
  const fact = (icon, label, html) => `<span title="${label}">${ico(icon)}<span class="sr">${label}: </span><span>${html}</span></span>`;
  return `<li class="card">
    <div class="row">
      <h3><a href="#/course/${esc(c.code)}">${esc(c.name)}</a></h3>
      <button class="btn small" data-compare="${esc(c.code)}" aria-pressed="${inList}">${compareLabel(inList)}</button>
    </div>
    <div class="meta">
      <span>${ico("building")}<a href="#/provider/${esc(p.code)}" title="${esc(p.name)}">${esc(p.name.split(";")[0].trim())}</a></span>
      <span>${ico("pin")}${esc(c.cities.slice(0, 3).join(", "))}${c.cities.length > 3 ? ` +${c.cities.length - 3}` : ""} (${esc(c.states.join(", "))})</span>
    </div>
    <div class="tags"><span class="tag">${esc(c.sectorName)}</span><span class="tag outline">${esc(c.levelName)}</span></div>
    <div class="facts">
      ${c.weeks != null ? fact("clock", "Duration", `<b>${esc(weeksText(c.weeks))}</b>`) : ""}
      ${c.total != null ? fact("wallet", "Total cost", `<b>${money(c.total)}</b>`) : ""}
      ${c.perWeek ? fact("week", "Cost per week", `<b>${money(c.perWeek)}</b> / week`) : ""}
      <span class="code" title="CRICOS course code">${ico("hash")}<span class="sr">Course code: </span>${esc(c.code)}</span>
    </div>
  </li>`;
}

function bindCompareButtons(root) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-compare]");
    if (!b) return;
    const list = toggleCompare(b.dataset.compare);
    const on = list.includes(b.dataset.compare);
    b.setAttribute("aria-pressed", on);
    b.textContent = b.closest(".card") ? compareLabel(on) : on ? "In compare" : "Add to compare";
  });
}

// --- views ---
function searchView(params) {
  const f = readFilters(params);
  const opts = (arr, sel, withBlank = "Any") =>
    `<option value="">${withBlank}</option>` + arr.map((t, i) => `<option value="${i}"${String(i) === sel ? " selected" : ""}>${esc(t)}</option>`).join("");
  const states = `<option value="">All of Australia</option>` +
    D.states.map((s) => `<option${s === f.state ? " selected" : ""}>${esc(s)}</option>`).join("");
  const sorts = [["relevance", "Default order"], ["perweek", "Cheapest per week"], ["cost", "Lowest total cost"], ["weeks", "Longest first"], ["name", "Name A–Z"]];
  const activeAdv = ["level", "field", "minWeeks", "maxWeeks", "maxTotal", "maxPerWeek", "work"].some((k) => f[k] !== "");

  const pick = (arr, name) => String(arr.indexOf(name));
  const chip = (label, over) => `<a class="chip" href="#/?${writeFilters({ ...DEFAULTS, ...over })}">${label}</a>`;
  const nf = (n) => n.toLocaleString("en-AU");

  const stats = `<b>${nf(D.courses.length)}</b> courses · <b>${nf(D.providers.length)}</b> providers · data as at ${esc(D.meta.sourceDate)}`;
  const rest = `
    <h1 class="compact" id="compact" hidden>Find a CRICOS course</h1>
    <form id="f" role="search">
      <div class="searchbox"><input type="search" name="q" value="${esc(f.q)}" placeholder="Search a course, provider or CRICOS code" aria-label="Search courses" autocomplete="off"></div>
      <p class="try" id="try">
        <span>Try:</span>
        ${chip("English courses", { sector: pick(D.sectors, "English (ELICOS)") })}
        ${chip("Vocational (VET)", { sector: pick(D.sectors, "Vocational (VET)") })}
        ${chip("Bachelor degrees", { level: pick(D.levels, "Bachelor Degree") })}
        ${chip("Masters degrees", { level: pick(D.levels, "Masters Degree (Coursework)") })}
        ${chip("Victoria", { state: "VIC" })}
        ${chip("New South Wales", { state: "NSW" })}
        ${chip("Under A$400 a week", { maxPerWeek: "400" })}
        ${chip("12 weeks or less", { maxWeeks: "12" })}</p>
      <details class="filters" ${activeAdv || window.innerWidth >= 720 ? "open" : ""}><summary>Filters</summary>
        <div class="filter-grid">
          <label>State<select name="state">${states}</select></label>
          <label>Sector<select name="sector">${opts(D.sectors, f.sector)}</select></label>
          <label>Course level<select name="level">${opts(D.levels, f.level)}</select></label>
          <label>Field of education<select name="field">${opts(D.fields, f.field)}</select></label>
          <label>Duration (weeks)<span class="range"><input type="number" name="minWeeks" min="0" inputmode="numeric" placeholder="Min" value="${esc(f.minWeeks)}" aria-label="Minimum weeks"><input type="number" name="maxWeeks" min="0" inputmode="numeric" placeholder="Max" value="${esc(f.maxWeeks)}" aria-label="Maximum weeks"></span></label>
          <label>Max total cost (A$)<input type="number" name="maxTotal" min="0" inputmode="numeric" placeholder="e.g. 10000" value="${esc(f.maxTotal)}"></label>
          <label>Max cost per week (A$)<input type="number" name="maxPerWeek" min="0" inputmode="numeric" placeholder="e.g. 400" value="${esc(f.maxPerWeek)}"></label>
          <label class="check"><input type="checkbox" name="work" value="1"${f.work === "1" ? " checked" : ""}> Includes a work component</label>
        </div>
      </details>
    </form>
    <ol class="steps" id="steps">
      <li><b>Search and filter</b><span>By course, provider, state, level, duration and cost.</span></li>
      <li><b>Compare</b><span>Put up to 4 courses side by side and see the best value.</span></li>
      <li><b>Check</b><span>Confirm fees and details with the provider and the official register.</span></li>
    </ol>
    <h2 class="sr">Results</h2>
    <div class="bar"><span id="count" aria-live="polite"></span>
      <span><select id="sort" aria-label="Sort by">${sorts.map(([v, l]) => `<option value="${v}"${v === f.sort ? " selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn small" id="csv" type="button">Download CSV</button>
      <button class="btn small" id="reset" type="button">Reset</button></span></div>
    <ul class="results" id="results"></ul>
    <button class="btn more" id="more" hidden>Show more</button>`;

  // Reuse the intro already on the page (the static copy from index.html on first load):
  // replacing it would repaint the LCP element late and shift the page.
  const intro = $main.querySelector("#intro");
  if (intro) {
    for (const n of [...$main.children]) if (n !== intro) n.remove();
    intro.querySelector(".stats").innerHTML = stats;
    intro.insertAdjacentHTML("afterend", rest);
  } else {
    $main.innerHTML = `
    <section class="intro" id="intro">
      <img class="intro-logo" src="/logo.webp" width="64" height="64" alt="">
      <h1>Find a course you can study in Australia on a student visa</h1>
      <p class="lead">Search the official CRICOS register: every course that international students can enrol in on an Australian student visa. Filter by place, level, length and cost, then compare courses side by side.</p>
      <p class="stats">${stats}</p>
    </section>${rest}`;
  }

  const form = $main.querySelector("#f");
  const list = $main.querySelector("#results");
  const more = $main.querySelector("#more");
  let rows = [], shown = 0;

  const read = () => {
    const fd = new FormData(form);
    const cur = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (fd.has(k)) cur[k] = String(fd.get(k)).trim();
    cur.sort = $main.querySelector("#sort").value;
    return cur;
  };
  const render = () => {
    const cur = read();
    history.replaceState(null, "", `#/?${writeFilters(cur)}&keep=1`.replace("?&", "?"));
    const active = Object.keys(DEFAULTS).some((k) => k !== "sort" && cur[k] !== DEFAULTS[k]);
    for (const id of ["intro", "try", "steps"]) $main.querySelector(`#${id}`).hidden = active;
    $main.querySelector("#compact").hidden = !active;
    rows = filterCourses(D.courses, cur);
    shown = Math.min(PAGE, rows.length);
    $main.querySelector("#count").textContent = `${rows.length.toLocaleString("en-AU")} course${rows.length === 1 ? "" : "s"}`;
    list.innerHTML = rows.slice(0, shown).map(courseCard).join("") || `<li class="empty">No courses match. Try removing a filter.</li>`;
    more.hidden = shown >= rows.length;
  };
  let t;
  form.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });
  form.addEventListener("submit", (e) => e.preventDefault());
  $main.querySelector("#sort").addEventListener("change", render);
  $main.querySelector("#reset").addEventListener("click", () => { location.hash = "#/"; });
  more.addEventListener("click", () => {
    list.insertAdjacentHTML("beforeend", rows.slice(shown, shown + PAGE).map(courseCard).join(""));
    shown = Math.min(shown + PAGE, rows.length);
    more.hidden = shown >= rows.length;
  });
  $main.querySelector("#csv").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows, D.providers)], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "cricos-courses.csv" }).click();
    URL.revokeObjectURL(url);
  });
  bindCompareButtons(list);
  render();
}

function dl(pairs) {
  return `<dl class="dl">${pairs.filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

function courseView(code) {
  const c = D.byCode.get(code);
  if (!c) { $main.innerHTML = `<p class="empty">Course ${esc(code)} was not found. It may have expired.</p><a href="#/">Back to search</a>`; return; }
  const p = D.providers[c.provider];
  const places = c.locations.map((i) => D.locations[i]);
  const inList = readShortlist().includes(c.code);
  $main.innerHTML = `
    <p class="crumb"><a href="#/">← Courses</a></p>
    <h1>${esc(c.name)}</h1>
    <p class="muted"><a href="#/provider/${esc(p.code)}">${esc(p.name)}</a></p>
    <div class="actions">
      <button class="btn primary" data-compare="${esc(c.code)}" aria-pressed="${inList}">${inList ? "In compare" : "Add to compare"}</button>
      <a class="btn" href="${officialCourse(c.code)}" rel="noopener" target="_blank">Official CRICOS page ↗</a>
    </div>
    ${dl([
      ["CRICOS course code", esc(c.code)], ["CRICOS provider code", esc(p.code)],
      ["Sector", esc(c.sectorName)], ["Course level", esc(c.levelName)],
      ["National VET code", esc(c.vet)], ["Field of education", esc(c.fieldName)],
      ["Detailed field", esc(c.detailName)],
      ["Duration", esc(weeksText(c.weeks))],
      ["Tuition fee", money(c.tuition)], ["Other fees", money(c.other)],
      ["Estimated total cost", money(c.total)], ["Cost per week", c.perWeek ? money(c.perWeek) : ""],
      ["Work component", c.work ? "Yes" : "No"], ["Foundation studies", c.foundation ? "Yes" : ""],
      ["Language", esc(c.language)],
    ])}
    <p class="muted">Fees are as declared by the provider on the register and are often older than its current price list. Confirm with the provider.</p>
    <h2>Where it is taught</h2>
    <ul class="locs">${places.map((l) => `<li><b>${esc(l.name)}</b><br><span class="muted">${esc([l.address, l.city, l.state, l.postcode].filter(Boolean).join(", "))}</span></li>`).join("")}</ul>`;
  bindCompareButtons($main);
}

function providerView(code, params) {
  const p = D.providerByCode.get(code);
  if (!p) { $main.innerHTML = `<p class="empty">Provider ${esc(code)} was not found.</p><a href="#/">Back to search</a>`; return; }
  const q = (params.get("q") || "").toLowerCase();
  const rows = p.courses.filter((c) => !q || c.search.includes(q));
  $main.innerHTML = `
    <p class="crumb"><a href="#/">← Courses</a></p>
    <h1>${esc(p.name)}</h1>
    ${dl([
      ["Legal name", esc(p.legalName)], ["CRICOS provider code", esc(p.code)], ["Type", esc(p.type)],
      ["Website", p.website ? `<a href="${esc(siteUrl(p.website))}" rel="noopener" target="_blank">${esc(p.website)}</a>` : ""],
      ["Locations", esc([...new Set(p.locations.map((l) => `${l.city} ${l.state}`))].join(", "))],
    ])}
    <h2>${p.courses.length} current course${p.courses.length === 1 ? "" : "s"}</h2>
    <form id="pf"><input type="search" name="q" value="${esc(params.get("q") || "")}" placeholder="Filter this provider's courses" aria-label="Filter courses"></form>
    <ul class="results spaced" id="results">${rows.map(courseCard).join("") || `<li class="empty">No courses match.</li>`}</ul>`;
  $main.querySelector("#pf").addEventListener("input", (e) => {
    history.replaceState(null, "", `#/provider/${code}?q=${encodeURIComponent(e.target.value)}&keep=1`);
    route();
    $main.querySelector("#pf input").focus();
  });
  $main.querySelector("#pf").addEventListener("submit", (e) => e.preventDefault());
  bindCompareButtons($main);
}

function compareView(params) {
  const fromUrl = (params.get("c") || "").split(",").filter((x) => D.byCode.has(x));
  if (fromUrl.length) writeShortlist(fromUrl.slice(0, MAX_COMPARE));
  const list = readShortlist().filter((x) => D.byCode.has(x));
  if (!list.length) {
    $main.innerHTML = `<h1>Compare</h1><p class="empty">Pick up to ${MAX_COMPARE} courses with the Compare button and they will show up side by side here.</p><a class="btn" href="#/">Find courses</a>`;
    return;
  }
  const cs = list.map((x) => D.byCode.get(x));
  // best: { values, dir, label } marks the winning cell(s) of a row.
  const row = (label, fn, best) => {
    const win = best ? bestOf(best.values, best.dir) : new Set();
    return `<tr><th scope="row">${label}</th>${cs.map((c, i) =>
      win.has(i) ? `<td class="best">${fn(c)}<span class="flag">${best.label}</span></td>` : `<td>${fn(c)}</td>`).join("")}</tr>`;
  };
  const fee = (k) => cs.map((c) => (c[k] > 0 ? c[k] : null));
  const share = `${location.origin}${location.pathname}#/compare?c=${list.join(",")}`;
  $main.innerHTML = `
    <h1>Compare</h1>
    <p class="muted">The best value in each row is highlighted. Fees are as declared by providers, so confirm them before deciding.</p>
    <div class="actions"><button class="btn small" id="share">Copy share link</button><button class="btn small" id="clear">Clear all</button></div>
    <div class="cmp"><table>
      <thead><tr><th></th>${cs.map((c) => `<th scope="col"><a href="#/course/${esc(c.code)}">${esc(c.name)}</a><span class="muted prov-name">${esc(D.providers[c.provider].name)}</span><button class="btn small" data-remove="${esc(c.code)}">✕ Remove</button></th>`).join("")}</tr></thead>
      <tbody>
        ${row("Provider", (c) => `<a href="#/provider/${esc(D.providers[c.provider].code)}">${esc(D.providers[c.provider].name)}</a>`)}
        ${row("Where", (c) => esc(c.cities.join(", ") + " (" + c.states.join(", ") + ")"))}
        ${row("Sector", (c) => esc(c.sectorName))}
        ${row("Level", (c) => esc(c.levelName))}
        ${row("Duration", (c) => esc(weeksText(c.weeks)))}
        ${row("Total cost", (c) => `<b>${money(c.total)}</b>`, { values: fee("total"), dir: "min", label: "Lowest" })}
        ${row("Per week", (c) => (c.perWeek ? money(c.perWeek) : "—"), { values: cs.map((c) => c.perWeek || null), dir: "min", label: "Lowest" })}
        ${row("Tuition", (c) => money(c.tuition), { values: fee("tuition"), dir: "min", label: "Lowest" })}
        ${row("Other fees", (c) => money(c.other), { values: cs.map((c) => c.other ?? null), dir: "min", label: "Lowest" })}
        ${row("Work component", (c) => (c.work ? "Yes" : "No"), { values: cs.map((c) => (c.work ? 1 : 0)), dir: "max", label: "Includes work" })}
        ${row("Course code", (c) => esc(c.code))}
      </tbody></table></div>`;
  $main.addEventListener("click", function h(e) {
    const r = e.target.closest("[data-remove]");
    if (!r) return;
    $main.removeEventListener("click", h);
    writeShortlist(readShortlist().filter((x) => x !== r.dataset.remove));
    history.replaceState(null, "", "#/compare");
    route();
  });
  $main.querySelector("#clear").addEventListener("click", () => { writeShortlist([]); history.replaceState(null, "", "#/compare"); route(); });
  $main.querySelector("#share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(share); e.target.textContent = "Copied"; }
    catch { prompt("Copy this link", share); }
  });
}

function aboutView() {
  $main.innerHTML = `<div class="prose"><h1>About</h1>
    <p>CRICOS is the Commonwealth Register of Institutions and Courses for Overseas Students. Only courses on it can be studied on an Australian student visa.</p>
    <p>This site is a faster, mobile-friendly way to search that register. It is unofficial and independent of the Australian Government.</p>
    <h2>Data</h2>
    <p>Course, provider and location data comes from the Department of Education's <a href="${esc(D.meta.source)}" rel="noopener">CRICOS open dataset on data.gov.au</a> (licence: CC BY 2.5 AU). It was last published on <b>${esc(D.meta.sourceDate)}</b> and is refreshed monthly. Only current (non-expired) courses with at least one listed location are shown.</p>
    <h2>Read the numbers with care</h2>
    <ul><li>Fees are what the provider declared when registering or updating the course. They are often older than its current price list.</li>
    <li>Weeks is the longest enrolment allowed in the course code, not a fixed length.</li>
    <li>Sector is derived: English = field of education 091501; Vocational = has a national VET code; Higher education = degree, graduate certificate or diploma without a VET code.</li></ul>
    <p>Always check details with the provider and on the <a href="https://cricos.education.gov.au/" rel="noopener">official register</a> before enrolling.</p></div>`;
}

// --- boot ---
try {
  D = await loadData();
  document.getElementById("foot-data").innerHTML =
    `Data: CRICOS register, Australian Government Department of Education, as at ${esc(D.meta.sourceDate)} (<a href="${esc(D.meta.source)}" rel="noopener">data.gov.au</a>, CC BY 2.5 AU).`;
  writeShortlist(readShortlist());
  addEventListener("hashchange", route);
  route();
} catch (e) {
  $main.innerHTML = `<p class="empty">Could not load the course data. Please refresh and try again.</p>`;
  console.error(e);
}
