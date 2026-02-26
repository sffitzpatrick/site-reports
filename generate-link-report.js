const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axeCore = require('axe-core');
const { createHtmlReport } = require('axe-html-reporter');
const robotsParser = require('robots-parser');
const axios = require('axios');

let program, pino, minimist;

try { ({ program } = require('commander')); } catch { program = null; }
try { pino = require('pino'); } catch { pino = null; }
try { minimist = require('minimist'); } catch { minimist = null; }

// -----------------------------
// CLI / Options
// -----------------------------
if (program) {
  program
    .option('--start-url <url>')
    .option('--site-name <name>')
    .option('--datestamp <date>')
    .option('--report-dir <dir>', './output')
    .option('--max-pages <n>', (v) => parseInt(v, 10), 100)
    .option('--dry-run', 'create output dirs and show config but do not crawl', false)
    .option('--ignore-robots', 'ignore robots.txt restrictions during crawl', false)
    .option('--user-agent <ua>', 'custom User-Agent header', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    .option('--verbose', 'enable debug logging', false);

  program.parse(process.argv);
}

const opts = program ? program.opts() : {};
const mm = minimist ? minimist(process.argv.slice(2)) : {};

let START_URL = opts.startUrl || process.env.SITE_URL || mm.start_url || mm.startUrl;
if (!START_URL) {
  console.error('❌ START_URL is required (--start-url or SITE_URL env var)');
  process.exit(1);
}

// -----------------------------
// Canonicalize non-www
// -----------------------------
START_URL = START_URL.replace(/^https?:\/\/www\./, 'https://');

const SITE_NAME = opts.siteName || process.env.SITE_NAME || mm.site_name || mm.siteName;
const DATESTAMP = opts.datestamp || process.env.DATESTAMP || mm.datestamp;
const REPORT_DIR = opts.reportDir || process.env.REPORT_DIR || mm.report_dir || mm.reportDir || './output';
const MAX_PAGES = parseInt(opts.maxPages || process.env.MAX_PAGES || mm.max_pages || mm.maxPages || 100, 10);
const DRY_RUN = opts.dryRun || process.env.DRY_RUN || mm.dry_run || false;
const IGNORE_ROBOTS = opts.ignoreRobots || process.env.IGNORE_ROBOTS || mm.ignore_robots || false;
const USER_AGENT = opts.userAgent || process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

let logger;
if (pino) {
  logger = pino({ level: opts.verbose ? 'debug' : process.env.LOG_LEVEL || 'info' });
} else {
  const level = opts.verbose ? 'debug' : process.env.LOG_LEVEL || 'info';
  logger = {
    info: (...a) => console.log('[info]', ...a),
    debug: (...a) => console.debug('[debug]', ...a),
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
  };
}

const DIR_BASE = REPORT_DIR;
const OUTPUT_DIR = path.join(DIR_BASE, 'reports');
const RAW_JSON_DIR = path.join(DIR_BASE, 'axe_json');
const LINK_REPORT_PATH = path.join(DIR_BASE, 'link_issues.json');

const visited = new Set();
const toVisit = new Set([START_URL]);
const baseUrl = new URL(START_URL);
const domainHost = baseUrl.hostname.replace(/^www\./, '');
const canonicalOrigin = baseUrl.protocol + '//' + domainHost;

const nonHtmlExts = /\.(css|js|pdf|png|jpe?g|svg|gif|ico|woff2?|ttf|eot|zip|mp4|mp3)$/i;

let robots;
let allLinkResults = [];

// -----------------------------
// Helpers
// -----------------------------
async function createDirectory(directoryPath) {
  try {
    await fs.promises.mkdir(directoryPath, { recursive: true });
    logger.info({ dir: directoryPath }, 'Directory created');
  } catch (err) {
    if (err.code === 'EEXIST') {
      logger.debug({ dir: directoryPath }, 'Directory already exists');
    } else {
      logger.error({ err }, 'Error creating directory');
    }
  }
}

async function loadRobotsTxt() {
  if (IGNORE_ROBOTS) {
    logger.info('robots.txt ignored (--ignore-robots flag set)');
    robots = { isAllowed: () => true };
    return;
  }

  try {
    const robotsUrl = canonicalOrigin + '/robots.txt';
    const res = await axios.get(robotsUrl, { timeout: 5000, headers: { 'User-Agent': USER_AGENT } });
    const txt = typeof res.data === 'string' ? res.data : '';
    robots = robotsParser(robotsUrl, txt);
    logger.info('Loaded robots.txt');
    logger.debug({ robotsTxt: txt.split('\n').slice(0, 10).join(' ') }, 'robots.txt excerpt (first 10 lines)');
  } catch (e) {
    logger.warn({ err: e.code || e.message }, 'robots.txt not found; crawling anyway.');
    robots = { isAllowed: () => true };
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url, START_URL);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, ''); // canonical non-www
    return u.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isHtmlPage(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return host === domainHost && !nonHtmlExts.test(u.pathname);
  } catch {
    return false;
  }
}

async function crawlPage(page, url) {
  logger.info({ url }, 'Crawling');
  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => logger.debug('Network idle timeout; proceeding anyway'));
    await page.addScriptTag({ content: axeCore.source });
    return await page.evaluate(() => axe.run());
  } catch (e) {
    logger.error({ err: e, url }, 'Failed crawling page');
    return null;
  }
}

async function extractLinks(page) {
  const hrefs = await page.$$eval('a[href]', els => els.map(el => el.href));
  const raw = hrefs.length;

  const normalized = hrefs.map(normalizeUrl).filter(u => u);
  const htmlOnly = normalized.filter(isHtmlPage);
  const notVisited = htmlOnly.filter(u => !visited.has(u));
  const allowed = IGNORE_ROBOTS ? notVisited : notVisited.filter(u => robots.isAllowed(u));

  logger.debug({
    rawCount: raw,
    afterNormalize: normalized.length,
    htmlFiltered: htmlOnly.length,
    notYetVisited: notVisited.length,
    robotsAllowed: allowed.length,
  }, 'Link extraction breakdown');

  return new Set(allowed);
}

async function checkLinks(links, baseUrl) {
  const checks = links.map(async (link) => {
    try {
      const res = await axios.head(link, { maxRedirects: 5, timeout: 5000, headers: { 'User-Agent': USER_AGENT } });
      return { link, status: res.status };
    } catch (error) {
      return {
        link,
        status: error.response?.status || null,
        error: error.code || error.message,
        source: baseUrl,
      };
    }
  });

  return Promise.all(checks);
}

// -----------------------------
// Crawl Loop
// -----------------------------
(async () => {
  await createDirectory(DIR_BASE);
  await createDirectory(OUTPUT_DIR);
  await createDirectory(RAW_JSON_DIR);

  logger.info({ startUrl: START_URL, domainHost, reportDir: DIR_BASE, maxPages: MAX_PAGES, dryRun: DRY_RUN }, 'Initialization complete');

  if (DRY_RUN) {
    logger.info('Dry run enabled — skipping network requests and browser launch');
    process.exit(0);
  }

  await loadRobotsTxt();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  let count = 0;

  while (toVisit.size && count < MAX_PAGES) {
    const rawUrl = toVisit.values().next().value;
    toVisit.delete(rawUrl);

    const url = normalizeUrl(rawUrl);
    if (!url) continue;
    if (visited.has(url)) continue;
    visited.add(url);

    if (!IGNORE_ROBOTS && !robots.isAllowed(url)) {
      logger.debug({ url }, 'URL blocked by robots.txt');
      continue;
    }

    const results = await crawlPage(page, url);
    if (results) {
      count++;
      const safe = `${count}`;
      const title = await page.title();

      const report = { meta: { scannedAt: new Date().toISOString(), url, documentTitle: title, index: count }, results };
      await fs.promises.writeFile(path.join(RAW_JSON_DIR, safe + '.json'), JSON.stringify(report, null, 2));

      createHtmlReport({ results, options: { outputDir: OUTPUT_DIR, reportFileName: safe + '.html' } });
    }

    const links = await extractLinks(page);
    const linkArray = Array.from(links);
    const brokenLinks = await checkLinks(linkArray, url);
    allLinkResults.push(...brokenLinks.filter(l => l.status >= 400 || l.error));

    links.forEach(l => toVisit.add(l));
  }

  await browser.close();
  await fs.promises.writeFile(LINK_REPORT_PATH, JSON.stringify(allLinkResults, null, 2));

  const brokenLinkCount = allLinkResults.length;
  console.log(`❌ Found ${brokenLinkCount} broken links.`);
  console.log(`🔗 Link check report written to ${LINK_REPORT_PATH}`);
  console.log(`✅ Completed. Scanned ${count} pages - reports in ./${OUTPUT_DIR}`);
})();