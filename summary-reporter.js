// summary-generator.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const csvWriter = require('csv-writer').createObjectCsvWriter;

const args = require('minimist')(process.argv.slice(2));
const SITE_NAME = args.site_name;
const DATESTAMP = args.datestamp;
const REPORT_DIR = args.report_dir
const SITE_URL = args.start_url

const DIR_BASE = REPORT_DIR;

const JSON_DIR = path.join(__dirname, DIR_BASE + '/axe_json');
const CSV_PATH = path.join(__dirname, DIR_BASE + '/summary.csv');
const HTML_PATH = path.join(__dirname, DIR_BASE + '/summary.html');
const DETAILS_CSV_PATH = path.join(__dirname, DIR_BASE+ '/violations-detailed.csv');

const summary = [];
const allViolations = [];

fs.readdirSync(JSON_DIR).forEach(file => {
  if (!file.endsWith('.json')) return;
  const data = JSON.parse(fs.readFileSync(path.join(JSON_DIR, file), 'utf-8'));
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };

  data.violations.forEach(v => {
    const impact = v.impact || 'minor';
    if (counts[impact] !== undefined) {
      counts[impact] += v.nodes.length;
    }
    v.nodes.forEach(node => {
      allViolations.push({
        page: file.replace('.json', ''),
        url: data.url || '',
        title: data.documentTitle || '',
        impact: v.impact || 'minor',
        id: v.id,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        html: node.html
      });
    });
  });

  summary.push({
    page: file.replace('.json', ''),
    reportLink: `./reports/${file.replace('.json', '.html')}`,
    url: data.url || '',
    title: data.documentTitle || '',
    total: data.violations.length,
    ...counts
  });
});

// Write summary CSV
csvWriter({
  path: CSV_PATH,
  header: [
    { id: 'page', title: 'Page' },
    { id: 'url', title: 'URL' },
    { id: 'title', title: 'Title' },
    { id: 'reportLink', title: 'Report Link' },
    { id: 'total', title: 'Total' },
    { id: 'critical', title: 'Critical' },
    { id: 'serious', title: 'Serious' },
    { id: 'moderate', title: 'Moderate' },
    { id: 'minor', title: 'Minor' },
  ]
}).writeRecords(summary).then(() => {
  console.log('✅ CSV summary written to ' + DIR_BASE + '/summary.csv');
});

// Write detailed violations CSV
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
}).writeRecords(allViolations).then(() => {
  console.log('✅ Detailed violations written to ' + DIR_BASE + '/violations-detailed.csv');
});

// HTML summary report with chart
const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Accessibility Summary</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script
			  src="https://code.jquery.com/jquery-3.7.1.slim.min.js"
			  integrity="sha256-kmHvs0B+OpCW5GVHUNjv9rOmY0IvSIRcf7zGUDTDQM8="
			  crossorigin="anonymous"></script>
  <script src="https://cdn.datatables.net/2.3.2/js/dataTables.min.js"></script>
  <link rel="stylesheet" href="https://cdn.datatables.net/2.3.2/css/dataTables.dataTables.min.css">
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
    th { background: #f4f4f4; }
    canvas { max-width: 800px; margin: 2rem auto; display: block; }
    a { color: #0366d6; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Accessibility Audit Summary</h1>
  <h2>Site url: ${SITE_URL}</h2>
  <canvas id="summaryChart"></canvas>
  <table id="summary-table">
    <thead>
      <tr>
        <th>Page</th><th>Title</th><th>URL</th><th>Report</th><th>Total</th><th>Critical</th><th>Serious</th><th>Moderate</th><th>Minor</th>
      </tr>
    </thead>
    <tbody>
      ${summary.map(row => `
        <tr>
          <td>${row.page}</td>
          <td>${row.title}</td>
          <td><a href="${row.url}" target="_blank">${row.url}</a></td>
          <td><a href="${row.reportLink}" target="_blank">Report</a></td>
          <td>${row.total}</td>
          <td>${row.critical}</td>
          <td>${row.serious}</td>
          <td>${row.moderate}</td>
          <td>${row.minor}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <script>
    const data = {
      labels: ${JSON.stringify(summary.map(row => row.page))},
      datasets: [
        { label: 'Critical', backgroundColor: '#e3342f', data: ${JSON.stringify(summary.map(row => row.critical))} },
        { label: 'Serious', backgroundColor: '#f6993f', data: ${JSON.stringify(summary.map(row => row.serious))} },
        { label: 'Moderate', backgroundColor: '#ffed4a', data: ${JSON.stringify(summary.map(row => row.moderate))} },
        { label: 'Minor', backgroundColor: '#38c172', data: ${JSON.stringify(summary.map(row => row.minor))} },
      ]
    };

    new Chart(document.getElementById('summaryChart'), {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Accessibility Violations by Page'
          },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });

    $(document).ready( function () {
      $('#summary-table').DataTable({
        paging: false
      });
  } );



  </script>
</body>
</html>`;

fs.writeFileSync(HTML_PATH, htmlContent, 'utf-8');
console.log('✅ HTML summary written to ' + DIR_BASE + '/summary.html');
