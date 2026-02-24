const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axeCore = require('axe-core');
const { createHtmlReport } = require('axe-html-reporter'); // Correct import
const robotsParser = require('robots-parser');
const axios = require('axios');
let program;
let pino;
let minimist;
try {
  ({ program } = require('commander'));
} catch (e) {
  program = null;
}

try {
  pino = require('pino');
} catch (e) {
  pino = null;
}

try {
  minimist = require('minimist');
} catch (e) {
  minimist = null;
}

// If `commander` is available use it, otherwise fall back to a noop program
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
  var opts = program.opts();
} else {
  var opts = {};
}

// Support legacy underscore-style flags and environment variables used by GitHub Actions
const mm = minimist ? minimist(process.argv.slice(2)) : {};
const START_URL = opts.startUrl || process.env.SITE_URL || mm.start_url || mm.startUrl;
const SITE_NAME = opts.siteName || process.env.SITE_NAME || mm.site_name || mm.siteName;
const DATESTAMP = opts.datestamp || process.env.DATESTAMP || mm.datestamp;
const REPORT_DIR = opts.reportDir || process.env.REPORT_DIR || mm.report_dir || mm.reportDir || './output';
const MAX_PAGES = opts.maxPages || process.env.MAX_PAGES || mm.max_pages || mm.maxPages || 100;
const DRY_RUN = opts.dryRun || process.env.DRY_RUN || mm.dry_run || false;
const IGNORE_ROBOTS = opts.ignoreRobots || process.env.IGNORE_ROBOTS || mm.ignore_robots || false;
const USER_AGENT = opts.userAgent || process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

let logger;
if (pino) {
  logger = pino({ level: opts.verbose ? 'debug' : process.env.LOG_LEVEL || 'info' });
} else {
  // simple console fallback
  const level = opts.verbose ? 'debug' : process.env.LOG_LEVEL || 'info';
  logger = {
    info: (...a) => console.log('[info]', ...a),
    debug: (...a) => console.debug('[debug]', ...a),
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
  };
}

const DIR_BASE = REPORT_DIR;
const OUTPUT_DIR = DIR_BASE + '/reports';
const RAW_JSON_DIR = DIR_BASE + '/axe_json';
const LINK_REPORT_PATH = path.join(DIR_BASE, 'link_issues.json');

const visited = new Set();
const toVisit = new Set([START_URL]);
const domain = new URL(START_URL).origin;


let robots;
const nonHtmlExts = /\.(css|js|pdf|png|jpe?g|svg|gif|ico|woff2?|ttf|eot|zip|mp4|mp3)$/i;

async function createDirectory(directoryPath) {
  try {
    await fs.mkdir(directoryPath, { recursive: true }); // recursive: true creates parent directories if needed
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
    const res = await axios.get(domain + '/robots.txt', { 
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT }
    });
    const txt = typeof res.data === 'string' ? res.data : '';
    robots = robotsParser(domain + '/robots.txt', txt);
    logger.info('Loaded robots.txt');
    logger.debug({ robotsTxt: txt.split('\n').slice(0, 10).join(' ') }, 'robots.txt excerpt (first 10 lines)');
  } catch (e) {
    logger.warn({ err: e.code || e.message }, 'robots.txt not found; crawling anyway.');
    robots = { isAllowed: () => true };
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url, domain);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function isHtmlPage(url) {
  return url.startsWith(domain) && !nonHtmlExts.test(url);
}

async function crawlPage(page, url) {
  logger.info({ url }, 'Crawling');
  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    // Wait for network to idle to ensure dynamically-loaded links are present
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      logger.debug('Network idle timeout; proceeding anyway');
    });
    await page.addScriptTag({ content: axeCore.source });
    return await page.evaluate(() => axe.run());
  } catch (e) {
    logger.error({ err: e, url }, 'Failed crawling page');
    return null;
  }
}

async function checkLinks(links, baseUrl) {
  const results = [];

  for (const link of links) {
    try {
      const res = await axios.head(link, { 
        maxRedirects: 5, 
        timeout: 5000,
        headers: { 'User-Agent': USER_AGENT }
      });
      results.push({ link, status: res.status });
    } catch (error) {
      // If HEAD is not allowed (405) try GET as a fallback
      if (error.response && error.response.status === 405) {
        try {
          const res = await axios.get(link, { 
            maxRedirects: 5, 
            timeout: 5000,
            headers: { 'User-Agent': USER_AGENT }
          });
          results.push({ link, status: res.status });
          continue;
        } catch (e) {
          results.push({ link, status: e.response?.status || null, error: e.code || e.message, source: baseUrl });
          continue;
        }
      }

      results.push({
        link,
        status: error.response?.status || null,
        error: error.code || error.message,
        source: baseUrl,
      });
    }
  }

  return results;
}

let allLinkResults = [];


async function extractLinks(page) {
  const hrefs = await page.$$eval('a[href]', els => els.map(el => el.href));
  const raw = hrefs.length;

  const normalized = hrefs.map(normalizeUrl).filter(u => u);
  const htmlOnly = normalized.filter(u => isHtmlPage(u));
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

(async () => {
  if (!fs.existsSync(DIR_BASE)) fs.mkdirSync(DIR_BASE, { recursive: true });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(RAW_JSON_DIR)) fs.mkdirSync(RAW_JSON_DIR, { recursive: true });

  logger.info({ startUrl: START_URL, reportDir: DIR_BASE, maxPages: MAX_PAGES, dryRun: DRY_RUN }, 'Initialization complete');

  if (DRY_RUN) {
    logger.info('Dry run enabled — skipping network requests and browser launch');
    process.exit(0);
  }

  await loadRobotsTxt();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  let count = 0;

  while (toVisit.size && count < MAX_PAGES) {
    const url = toVisit.values().next().value;
    toVisit.delete(url);
    if (!IGNORE_ROBOTS && !robots.isAllowed(url)) continue;

    visited.add(url);
    const results = await crawlPage(page, url);
    if (results) {
      count++;
      const safe = `${count}`;
      const title = await page.title();

      const report = {
        meta: {
          scannedAt: new Date().toISOString(),
          url: page.url(),
          documentTitle: title,
          index: count,
        },
        results,
      };

      // write raw JSON report asynchronously
      await fs.promises.writeFile(path.join(RAW_JSON_DIR, safe + '.json'), JSON.stringify(report, null, 2));

      // create HTML report from the raw axe results (not the wrapped report)
      createHtmlReport({
        results,
        options: {
          outputDir: OUTPUT_DIR,
          reportFileName: safe + '.html'
        }
      });
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

  // const core = require('@actions/core');
  // core.setOutput('broken_count', brokenLinkCount);


})();
