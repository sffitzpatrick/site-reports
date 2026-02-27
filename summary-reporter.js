// summary-generator.js
const fs = require('fs');
const path = require('path');
const csvWriter = require('csv-writer').createObjectCsvWriter;

const args = require('minimist')(process.argv.slice(2));
const SITE_NAME = args['site-name'] || process.env.SITE_NAME || '';
const DATESTAMP = args.datestamp || process.env.DATESTAMP || '';
const REPORT_DIR = args['report-dir'] || process.env.REPORT_DIR;
const SITE_URL = args['start-url'] || process.env.SITE_URL || '';

if (!REPORT_DIR) {
  console.error('❌ REPORT_DIR is required');
  process.exit(1);
}

const JSON_DIR = path.join(__dirname, REPORT_DIR, 'axe_json');
const CSV_PATH = path.join(__dirname, REPORT_DIR, 'summary.csv');
const DETAILS_CSV_PATH = path.join(__dirname, REPORT_DIR, 'violations-detailed.csv');
const HTML_PATH = path.join(__dirname, REPORT_DIR, 'summary.html');

const summary = [];
const allViolations = [];

// Severity weights
const WEIGHTS = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1
};

if (!fs.existsSync(JSON_DIR)) {
  console.error(`❌ JSON directory not found: ${JSON_DIR}`);
  process.exit(1);
}

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

  // Support old and new axe-core structures
  const violations = data.violations || data.results?.violations || [];
  const passes = data.passes || data.results?.passes || [];

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let severityScore = 0;

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
        url: data.url || data.meta?.url || '',
        title: data.documentTitle || data.meta?.documentTitle || '',
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
    reportLink: `./reports/${file.replace('.json', '.html')}`,
    url: data.url || data.meta?.url || '',
    title: data.documentTitle || data.meta?.documentTitle || '',
    totalViolations: violations.length,
    totalPasses: passes.length,
    severityScore,
    ...counts
  });
});

//
// WRITE SUMMARY CSV
//
csvWriter({
  path: CSV_PATH,
  header: [
    { id: 'page', title: 'Page' },
    { id: 'url', title: 'URL' },
    { id: 'title', title: 'Title' },
    { id: 'reportLink', title: 'Report Link' },
    { id: 'totalViolations', title: 'Total Violations' },
    { id: 'totalPasses', title: 'Total Passes' },
    { id: 'critical', title: 'Critical' },
    { id: 'serious', title: 'Serious' },
    { id: 'moderate', title: 'Moderate' },
    { id: 'minor', title: 'Minor' },
    { id: 'severityScore', title: 'Severity Score' },
  ]
}).writeRecords(summary)
  .then(() => console.log('✅ summary.csv written'))
  .catch(err => console.error('❌ Failed writing summary CSV', err));

//
// WRITE DETAILED CSV
//
csvWriter({
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
}).writeRecords(allViolations)
  .then(() => console.log('✅ violations-detailed.csv written'))
  .catch(err => console.error('❌ Failed writing detailed CSV', err));

//
// HTML REPORT
//
const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Accessibility Summary</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://code.jquery.com/jquery-3.7.1.slim.min.js"></script>
<script src="https://cdn.datatables.net/2.3.2/js/dataTables.min.js"></script>
<link rel="stylesheet" href="https://cdn.datatables.net/2.3.2/css/dataTables.dataTables.min.css">
<style>
body { font-family: sans-serif; padding: 2rem; }
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
th { background: #f4f4f4; }
canvas { max-width: 900px; margin: 2rem auto; display: block; }
</style>
</head>
<body>

<h1>Accessibility Audit Summary</h1>
<h2>Site URL: ${SITE_URL}</h2>

<canvas id="summaryChart"></canvas>

<table id="summary-table">
<thead>
<tr>
<th>Page</th>
<th>Title</th>
<th>Total Violations</th>
<th>Passes</th>
<th>Critical</th>
<th>Serious</th>
<th>Moderate</th>
<th>Minor</th>
<th>Severity Score</th>
</tr>
</thead>
<tbody>
${summary.map(row => `
<tr>
<td>${row.page}</td>
<td>${row.title}</td>
<td>${row.totalViolations}</td>
<td>${row.totalPasses}</td>
<td>${row.critical}</td>
<td>${row.serious}</td>
<td>${row.moderate}</td>
<td>${row.minor}</td>
<td><strong>${row.severityScore}</strong></td>
</tr>
`).join('')}
</tbody>
</table>

<script>
const chartData = {
  labels: ${JSON.stringify(summary.map(r => r.page))},
  datasets: [
    { label: 'Critical', backgroundColor: '#e3342f', data: ${JSON.stringify(summary.map(r => r.critical))} },
    { label: 'Serious', backgroundColor: '#f6993f', data: ${JSON.stringify(summary.map(r => r.serious))} },
    { label: 'Moderate', backgroundColor: '#ffed4a', data: ${JSON.stringify(summary.map(r => r.moderate))} },
    { label: 'Minor', backgroundColor: '#38c172', data: ${JSON.stringify(summary.map(r => r.minor))} }
  ]
};

new Chart(document.getElementById('summaryChart'), {
  type: 'bar',
  data: chartData,
  options: {
    responsive: true,
    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
  }
});

$(document).ready(function() {
  $('#summary-table').DataTable({ paging: false });
});
</script>

</body>
</html>`;

fs.writeFileSync(HTML_PATH, htmlContent, 'utf-8');
console.log('✅ summary.html written');