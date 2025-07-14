const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axeCore = require('axe-core');
const { createHtmlReport } = require('axe-html-reporter'); // Correct import
const robotsParser = require('robots-parser');
const fetch = require('node-fetch');
const axios = require('axios');
const args = require('minimist')(process.argv.slice(2));

const START_URL = args.start_url; // Replace with your target
const SITE_NAME = args.site_name;
const DATESTAMP = args.datestamp;
const REPORT_DIR = args.report_dir
const MAX_PAGES = args.max_pages;

const DIR_BASE = 'docs/reports/' + REPORT_DIR;
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

async function checkLinks(links, baseUrl) {
  const results = [];

  for (const link of links) {
    try {
      const res = await axios.head(link, { maxRedirects: 5, timeout: 5000 });
      results.push({ link, status: res.status });
    } catch (error) {
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
  return new Set(
    hrefs
      .map(normalizeUrl)
      .filter(u => u && isHtmlPage(u) && !visited.has(u) && robots.isAllowed(u))
  );
}

(async () => {
  if (!fs.existsSync(DIR_BASE)) fs.mkdirSync(DIR_BASE, { recursive: true });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(RAW_JSON_DIR)) fs.mkdirSync(RAW_JSON_DIR, { recursive: true });

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
    const linkArray = Array.from(links);
    const brokenLinks = await checkLinks(linkArray, url);
    allLinkResults.push(...brokenLinks.filter(l => l.status >= 400 || l.error));

    links.forEach(l => toVisit.add(l));
  }

  await browser.close();

  fs.writeFileSync(LINK_REPORT_PATH, JSON.stringify(allLinkResults, null, 2));
  
  const brokenLinkCount = allLinkResults.length;
  console.log(`❌ Found ${brokenLinkCount} broken links.`);
  console.log(`🔗 Link check report written to ${LINK_REPORT_PATH}`);
  console.log(`✅ Completed. Scanned ${count} pages - reports in ./${OUTPUT_DIR}`);

  // const core = require('@actions/core');
  // core.setOutput('broken_count', brokenLinkCount);


})();
