// -----------------------------
// CLI Dependencies
// -----------------------------
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
    .option('--user-agent <ua>', 'custom User-Agent header',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    .option('--verbose', 'enable debug logging', false);

  program.parse(process.argv);
}

const opts = program ? program.opts() : {};
const mm = minimist ? minimist(process.argv.slice(2)) : {};

// -----------------------------
// Option Resolution Priority
// CLI > ENV > minimist fallback
// -----------------------------
const START_URL =
  opts.startUrl ||
  process.env.SITE_URL ||
  mm.start_url ||
  mm.startUrl;

if (!START_URL) {
  console.error('❌ START_URL is required (--start-url or SITE_URL env var)');
  process.exit(1);
}

const SITE_NAME =
  opts.siteName ||
  process.env.SITE_NAME ||
  mm.site_name ||
  mm.siteName ||
  new URL(START_URL).hostname;

const DATESTAMP =
  opts.datestamp ||
  process.env.DATESTAMP ||
  mm.datestamp ||
  new Date().toISOString().slice(0,10);

const REPORT_DIR =
  opts.reportDir ||
  process.env.REPORT_DIR ||
  mm.report_dir ||
  mm.reportDir ||
  './output';

const MAX_PAGES =
  parseInt(
    opts.maxPages ||
    process.env.MAX_PAGES ||
    mm.max_pages ||
    mm.maxPages ||
    100,
    10
  );

const DRY_RUN =
  opts.dryRun ||
  process.env.DRY_RUN ||
  mm.dry_run ||
  false;

const IGNORE_ROBOTS =
  opts.ignoreRobots ||
  process.env.IGNORE_ROBOTS ||
  mm.ignore_robots ||
  false;

const USER_AGENT =
  opts.userAgent ||
  process.env.USER_AGENT ||
  'Mozilla/5.0 AccessibilityCrawler/1.0';

// -----------------------------
// Logger
// -----------------------------
let logger;

if (pino) {
  logger = pino({
    level: opts.verbose ? 'debug' : process.env.LOG_LEVEL || 'info'
  });
} else {
  const level = opts.verbose ? 'debug' : process.env.LOG_LEVEL || 'info';

  logger = {
    info: (...a) => console.log('[info]', ...a),
    debug: (...a) => level === 'debug' && console.debug('[debug]', ...a),
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a)
  };
}

// -----------------------------
// Output Paths
// -----------------------------
const DIR_BASE = REPORT_DIR;

const OUTPUT_DIR = path.join(DIR_BASE, 'reports');
const RAW_JSON_DIR = path.join(DIR_BASE, 'axe_json');
const LINK_JSON_PATH = path.join(DIR_BASE, 'link_issues.json');
const LINK_CSV_PATH = path.join(DIR_BASE, 'broken-links.csv');

// helpful startup log
logger.info({
  startUrl: START_URL,
  siteName: SITE_NAME,
  datestamp: DATESTAMP,
  reportDir: DIR_BASE,
  maxPages: MAX_PAGES,
  dryRun: DRY_RUN,
  ignoreRobots: IGNORE_ROBOTS
}, 'Crawler configuration');