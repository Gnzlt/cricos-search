import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../scripts/csv.mjs";
import { sectorOf } from "../scripts/build.mjs";
import { filterCourses, bestOf, DEFAULTS } from "../public/js/search.js";

test("parses quotes, commas, CRLF and BOM", () => {
  const rows = parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n2,\r\n');
  assert.deepEqual(rows, [{ a: "1", b: 'x, "y"' }, { a: "2", b: "" }]);
});

test("sectorOf classifies courses", () => {
  const base = { "Field of Education 1 Detailed Field": "", "Field of Education 2 Detailed Field": "", "VET National Code": "", "Course Level": "" };
  assert.equal(sectorOf({ ...base, "Field of Education 1 Detailed Field": "091501 English Language" }), 0);
  assert.equal(sectorOf({ ...base, "VET National Code": "BSB50420", "Course Level": "Diploma" }), 1);
  assert.equal(sectorOf({ ...base, "Course Level": "Bachelor Degree" }), 2);
  assert.equal(sectorOf({ ...base, "Course Level": "Senior Secondary Certificate of Education" }), 3);
});

test("filterCourses applies filters and sorting", () => {
  const mk = (name, weeks, total, states) => ({ name, weeks, total, perWeek: total / weeks, states, sector: 0, level: 0, field: 0, work: 0, search: name.toLowerCase() });
  const cs = [mk("General English", 48, 9600, ["VIC"]), mk("IELTS Prep", 10, 3000, ["NSW"]), mk("Business English", 40, 6000, ["VIC"])];
  const r = filterCourses(cs, { ...DEFAULTS, q: "english", state: "VIC", minWeeks: "40", sort: "perweek" });
  assert.deepEqual(r.map((c) => c.name), ["Business English", "General English"]);
});

test("bestOf picks the best values, keeps ties, ignores missing and all-equal", () => {
  assert.deepEqual([...bestOf([9600, 3000, null, 6000], "min")], [1]);
  assert.deepEqual([...bestOf([3000, 5000, 3000], "min")], [0, 2]);
  assert.deepEqual([...bestOf([0, 1, 1], "max")], [1, 2]);
  assert.equal(bestOf([5, 5], "min").size, 0);
  assert.equal(bestOf([5, null], "min").size, 0);
});
