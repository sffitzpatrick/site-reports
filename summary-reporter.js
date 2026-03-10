// summary-reporter.js
'use strict';

const fs = require('fs');
const path = require('path');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const args = require('minimist')(process.argv.slice(2));

const { readCSV, writeReport } = require('./report-utils');

// -----------------------------
// Command-line / Environment
// -----------------------------
const SITE_NAME = args['site-name'] || process.env.SITE_NAME || '';
const DATESTAMP = args.datestamp || process.env.DATESTAMP || '';
const REPORT_DIR = args['report-dir'] || process.env.REPORT_DIR;
const SITE_URL = args['start-url'] || process.env.SITE_URL || '';

if (!REPORT_DIR) {
  console.error('❌ REPORT_DIR is required');
  process.exit(1);
}

// -----------------------------
// Paths
// -----------------------------
const JSON_DIR = path.join(__dirname, REPORT_DIR, 'axe_json');
const CSV_PATH = path.join(__dirname, REPORT_DIR, 'summary.csv');
const DETAILS_CSV_PATH = path.join(__dirname, REPORT_DIR, 'violations-detailed.csv');

// -----------------------------
// Prepare data
// -----------------------------
const summary = [];
const allViolations = [];

// Severity weights
const WEIGHTS = { critical: 4, serious: 3, moderate: 2, minor: 1 };

if (!fs.existsSync(JSON_DIR)) {
  console.error(`❌ JSON directory not found: ${JSON_DIR}`);
  process.exit(1);
}

// -----------------------------
// Read JSON and build summaries
// -----------------------------
fs.readdirSync(JSON_DIR).forEach(file => {
  if (!file.endsWith('.json')) return;

  const filePath = path.join(JSON_DIR, file);
  let data;

  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.warn(`⚠️ Skipping malformed JSON: ${file}`);
    return;
  }

  const violations = data.violations || data.results?.violations || [];
  const passes = data.passes || data.results?.passes || [];

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let severityScore = 0;

  const pageUrl = data.url || data.meta?.url || '';
  const pageTitle = data.documentTitle || data.meta?.documentTitle || '';

  console.log(`Processing ${file} — ${violations.length} violations, ${passes.length} passes`);

  violations.forEach(v => {
    const impact = v.impact || 'minor';
    const nodeCount = v.nodes?.length || 0;

    if (counts[impact] !== undefined) {
      counts[impact] += nodeCount;
      severityScore += nodeCount * (WEIGHTS[impact] || 0);
    }

    v.nodes?.forEach(node => {
      allViolations.push({
        page: file.replace('.json', ''),
        url: pageUrl,
        title: pageTitle,
        impact: impact,
        id: v.id || '',
        description: v.description || '',
        help: v.help || '',
        helpUrl: v.helpUrl || '',
        html: node.html || ''
      });
    });
  });

  summary.push({
    page: file.replace('.json', ''),
    pageTitle,
    pageUrl,
    reportLink: `./reports/${file.replace('.json', '.html')}`,
    totalViolations: violations.length,
    totalPasses: passes.length,
    severityScore,
    ...counts
  });
});

// -----------------------------
// Async function to write CSV + HTML
// -----------------------------
async function generateReports() {
  try {
    // --- Write summary CSV ---
    await csvWriter({
      path: CSV_PATH,
      header: [
        { id: 'page', title: 'Page' },
        { id: 'pageTitle', title: 'Title' },
        { id: 'pageUrl', title: 'URL' },
        { id: 'reportLink', title: 'Report Link' },
        { id: 'totalViolations', title: 'Total Violations' },
        { id: 'totalPasses', title: 'Total Passes' },
        { id: 'critical', title: 'Critical' },
        { id: 'serious', title: 'Serious' },
        { id: 'moderate', title: 'Moderate' },
        { id: 'minor', title: 'Minor' },
        { id: 'severityScore', title: 'Severity Score' },
      ]
    }).writeRecords(summary);

    console.log('✅ summary.csv written');

    // --- Write detailed CSV ---
    await csvWriter({
      path: DETAILS_CSV_PATH,
      header: [
        { id: 'page', title: 'Page' },
        { id: 'url', title: 'URL' },
        { id: 'title', title: 'Title' },
        { id: 'impact', title: 'Impact' },
        { id: 'id', title: 'Rule ID' },
        { id: 'description', title: 'Description' },
        { id: 'help', title: 'Help' },
        { id: 'helpUrl', title: 'Help URL' },
        { id: 'html', title: 'HTML Element' },
      ]
    }).writeRecords(allViolations);

    console.log('✅ violations-detailed.csv written');

    // --- Read summary CSV and generate HTML ---
    const { headers, data } = readCSV(CSV_PATH);

    writeReport(data, headers, REPORT_DIR, 'summary', {
      title: 'Accessibility Summary Report',
      linkColumns: ['URL', 'Report Link'] // make URLs clickable
    });

    console.log('✅ summary.html written');

  } catch (err) {
    console.error('❌ Error generating reports', err);
  }
}

// Run
generateReports();