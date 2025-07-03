const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axeCore = require('axe-core');
const { createHtmlReport } = require('axe-html-reporter'); // Correct import
const robotsParser = require('robots-parser');
const fetch = require('node-fetch');
const args = require('minimist')(process.argv.slice(2));

const START_URL = args.start_url; // Replace with your target
const SITE_NAME = args.site_name;
const DATESTAMP = args.datestamp;
const REPORT_DIR = DATESTAMP + '/' + SITE_NAME

const MAX_PAGES = args.max_pages;
const DIR_BASE = 'docs/reports/' + REPORT_DIR;
const OUTPUT_DIR = DIR_BASE + '/reports';
const RAW_JSON_DIR = DIR_BASE + '/axe_json';

const visited = new Set();
const toVisit = new Set([START_URL]);
const domain = new URL(START_URL).origin;

let robots;
const nonHtmlExts = /\.(css|js|pdf|png|jpe?g|svg|gif|ico|woff2?|ttf|eot|zip|mp4|mp3)$/i;

async function createDirectory(directoryPath) {
  try {
    await fs.mkdir(directoryPath, { recursive: true }); // recursive: true creates parent directories if needed
    console.log(`Directory '${directoryPath}' created successfully.`);
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.log(`Directory '${directoryPath}' already exists.`);
    } else {
      console.error(`Error creating directory: ${err.message}`);
    }
  }
}

async function loadRobotsTxt() {
  try {
    const res = await fetch(domain + '/robots.txt');
    const txt = await res.text();
    robots = robotsParser(domain + '/robots.txt', txt);
    console.log('✅ Loaded robots.txt');
  } catch {
    console.warn('⚠️ robots.txt not found; crawling anyway.');
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
  console.log(`🔍 Crawling: ${url}`);
  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: axeCore.source });
    return await page.evaluate(() => axe.run());
  } catch (e) {
    console.error(`❌ Failed on ${url}: ${e.message}`);
    return null;
  }
}

async function extractLinks(page) {
  const hrefs = await page.$$eval('a[href]', els => els.map(el => el.href));
  return new Set(
    hrefs
      .map(normalizeUrl)
      .filter(u => u && isHtmlPage(u) && !visited.has(u) && robots.isAllowed(u))
  );
}

(async () => {
  if (!fs.existsSync(DIR_BASE)) fs.mkdirSync(DIR_BASE);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  if (!fs.existsSync(RAW_JSON_DIR)) fs.mkdirSync(RAW_JSON_DIR);

  await loadRobotsTxt();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  let count = 0;

  while (toVisit.size && count < MAX_PAGES) {
    const url = toVisit.values().next().value;
    toVisit.delete(url);
    if (!robots.isAllowed(url)) continue;

    visited.add(url);
    const results = await crawlPage(page, url);
    const title = await page.title();
    if (results) {
      count++;
      const safe = `${count}`;
      const title = await page.title();
      results.url = page.url();
      results.documentTitle = title;
      fs.writeFileSync(path.join(RAW_JSON_DIR, safe + '.json'), JSON.stringify(results, null, 2));
      createHtmlReport({
        results,
        options: {
          outputDir: OUTPUT_DIR,
          reportFileName: safe + '.html'
        }
      });
    }

    const links = await extractLinks(page);
    links.forEach(l => toVisit.add(l));
  }

  await browser.close();
  console.log(`✅ Completed. Scanned ${count} pages - reports in ./${OUTPUT_DIR}`);
})();
