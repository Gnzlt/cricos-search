<p align="center"><img src="assets/logo.png" alt="CRICOS Search logo" width="120"></p>

<h1 align="center">CRICOS Search</h1>

A fast, mobile-friendly search for courses on the Australian CRICOS register (Commonwealth Register of Institutions and Courses for Overseas Students). It is an unofficial replacement for the old [CRICOS course search](https://cricos.education.gov.au/Course/CourseSearch.aspx).

- Search by course, provider or code; filter by state, sector, level, field, duration, total cost and cost per week.
- Course and provider pages; compare up to 4 courses side by side, with the best value in each row highlighted; export results to CSV.
- Filters live in the URL, so any search can be bookmarked or shared.
- Plain HTML, CSS and ES modules. **No framework, no runtime dependencies, no build step.**

## SEO

Live at https://cricos.gnzlt.com. The app uses hash routes that search engines do not index, so `scripts/pages.mjs` pre-renders a static page per provider (`/provider/<code>/`), a provider index (`/providers/`), `sitemap.xml` and `robots.txt`, with canonical URLs, Open Graph tags and JSON-LD.

## Data

The data comes from the Department of Education's [CRICOS open dataset on data.gov.au](https://data.gov.au/data/dataset/cricos), published monthly under CC BY 2.5 AU. `scripts/fetch-data.mjs` looks up the current CSV links through the data.gov.au CKAN API, downloads them, keeps current (non-expired) courses and writes compact JSON into `public/data/`.

```sh
npm run data   # refresh public/data from data.gov.au (Node 22+)
npm test       # unit tests (node:test)
npm start      # serve public/ at http://localhost:8765
```

A GitHub Action (`.github/workflows/refresh-data.yml`) runs on the 3rd of every month and commits the new data only when it changed. It refuses to write if the course count drops by more than 20%.

## Deploy on Cloudflare Pages (free)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, and pick this repo (authorise the Cloudflare GitHub app for it).
2. Framework preset **None**, build command empty, build output directory `public`.
3. Every push to `main`, including the monthly data commit, redeploys automatically.

Without Git: `npx wrangler pages deploy public --project-name cricos-search`.

## Notes

- Fees are what providers declared on the register and are often older than their current price lists.
- Sector is derived: English (ELICOS) = field of education 091501; Vocational = has a national VET code; Higher education = degree, graduate certificate or a diploma without a VET code.
- Courses with no listed location are left out.

## Licence

Code: MIT. Data: © Commonwealth of Australia (Department of Education), CC BY 2.5 AU. This project is not affiliated with or endorsed by the Australian Government.
