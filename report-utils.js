'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/sync').parse;


// -----------------------------
// Read CSV
// -----------------------------
function readCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const headers = Object.keys(records[0] || {});
  return { headers, data: records };
}


// -----------------------------
// Escape HTML
// -----------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// -----------------------------
// Generate HTML Table
// -----------------------------
function generateTable(data, headers, linkColumns = []) {

  const thead = `
<thead>
<tr>
${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('\n')}
</tr>
</thead>`;

  const tbodyRows = data.map(row => {

    const cols = headers.map(h => {

      let value = row[h] ?? '';

      if (linkColumns.includes(h) && value) {
        return `<td><a href="${escapeHtml(value)}" target="_blank">${escapeHtml(value)}</a></td>`;
      }

      return `<td>${escapeHtml(value)}</td>`;
    });

    return `<tr>${cols.join('')}</tr>`;
  });

  const tbody = `<tbody>\n${tbodyRows.join('\n')}\n</tbody>`;

  return `<table id="summary-table">${thead}${tbody}</table>`;
}


// -----------------------------
// Write HTML Report
// -----------------------------
function writeReport(data, headers, reportDir, name, options = {}) {

  const {
    title = 'Report',
    linkColumns = [],
    siteUrl = '',
    siteName = '',
    datestamp = ''
  } = options;

  const table = generateTable(data, headers, linkColumns);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://code.jquery.com/jquery-3.7.1.slim.min.js"></script>
<script src="https://cdn.datatables.net/2.3.2/js/dataTables.min.js"></script>
<link rel="stylesheet" href="https://cdn.datatables.net/2.3.2/css/dataTables.dataTables.min.css">
<style>
body { font-family: sans-serif; padding: 2rem; }
table { border-collapse: collapse; width: 100%; margin-top: 1rem; table-layout: fixed; }
th, td { border: 1px solid #ccc; padding: 6px; text-align: center; word-break: break-word; }
th { background: #f4f4f4; }
canvas { max-width: 900px; margin: 2rem auto; display: block; }
</style>

</head>
<body>

<h1>${escapeHtml(title)}</h1>

<div class="meta">
${siteName ? `<div><strong>Site:</strong> ${escapeHtml(siteName)}</div>` : ''}
${siteUrl ? `<div><strong>URL:</strong> <a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a></div>` : ''}
${datestamp ? `<div><strong>Date:</strong> ${escapeHtml(datestamp)}</div>` : ''}
</div>

${table}

<script>

$(document).ready(function() {
  $('#summary-table').DataTable({ paging: false });
});
</script>


</body>
</html>
`;

  const outputPath = path.join(reportDir, `${name}.html`);
  fs.writeFileSync(outputPath, html, 'utf8');
}


// -----------------------------
module.exports = {
  readCSV,
  writeReport
};