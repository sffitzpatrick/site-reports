# accessibility-reports

This repository runs accessibility audits (axe) and link checks using Playwright.

**Quick CI note**
- The GitHub Actions workflows must install Playwright browsers and OS deps. Ensure the workflow runs:

```yaml
run: |
	npm install
	npm ci
	npx playwright install
	npx playwright install-deps
```

I have updated the workflows in `.github/workflows/` to call `npx playwright install-deps` after `npx playwright install` so the hosted runners have the required system libraries.

**Local quickstart**

1. Install Node deps and Playwright browsers:

```bash
npm install
npx playwright install
# (optional) install OS-level libs on Linux if Playwright warns
sudo npx playwright install-deps
```

2. Run a quick dry run (creates output dirs only):

```bash
node crawler.js --start-url=https://example.com --report-dir=tmp-out --max-pages=0 --dry-run
```

3. Run a limited live crawl (1 page):

```bash
node crawler.js --start-url=https://example.com --report-dir=tmp-out --max-pages=1
```

**Docker** (no host deps needed)

Run inside Playwright's official image (adjust tag if needed):

```bash
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:latest \
	node crawler.js --start-url=https://example.com --report-dir=/work/tmp-out --max-pages=1
```

**Supported CLI flags and env fallbacks**
- `--start-url` (or `--start_url` / env `SITE_URL`) — site to crawl
- `--report-dir` (or `--report_dir` / env `REPORT_DIR`) — output directory
- `--max-pages` (or `--max_pages` / env `MAX_PAGES`) — max pages to scan
- `--site-name` (or `--site_name` / env `SITE_NAME`) — human label
- `--datestamp` (env `DATESTAMP`) — optional datestamp
- `--dry-run` — create dirs and show config, skip crawling

The CLI accepts both hyphenated flags (recommended) and underscore-style flags used in existing GitHub Actions. Environment variables are also supported so existing workflows don't need changes.

**Notes & recommendations**
- Prefer `axios` (used across the codebase) rather than ESM-only `node-fetch` to avoid CommonJS/ESM mismatches.
- Consider modularizing `crawler.js` into `lib/crawler.js`, `lib/link-checker.js`, and a thin `bin/crawl.js` entry point for easier testing.
- Add `npx playwright install-deps` to any CI or container setup step to ensure Playwright can launch browsers on Linux runners.

If you want, I can split `crawler.js` into modules and add a small test harness next.
