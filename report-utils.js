'use strict';
const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/sync').parse;

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// CSV → array of objects
function readCSV(file) {
  const content = fs.readFileSync(file, 'utf8');
  const records = parse(content, {
    columns: true,      // first row = headers
    skip_empty_lines: true,
    trim: true
  });
  const headers = Object.keys(records[0] || {});
  return { headers, data: records };
}

// Convert array of objects to CSV (for custom reports)
function toCSV(data, headers) {
  const rows = [headers.join(',')];
  for (const row of data) {
    rows.push(
      headers
        .map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
  }
  return rows.join('\n');
}

// Generate HTML table from CSV data
function toHTMLTable(data, headers, options = {}) {
  const title = options.title || 'Report';
  const linkColumns = options.linkColumns || [];

  const head = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');

  const rows = data
    .map(row => {
      const cols = headers
        .map(h => {
          const val = row[h] ?? '';
          if (linkColumns.includes(h)) {
            return `<td><a href="${escapeHtml(val)}" target="_blank">${escapeHtml(val)}</a></td>`;
          } else {
            return `<td>${escapeHtml(val)}</td>`;
          }
        })
        .join('');
      return `<tr>${cols}</tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: system-ui, sans-serif; padding: 2rem; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 6px 10px; }
th { background: #eee; }
tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<table>
<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}

// Write both CSV + HTML
function writeReport(data, headers, outputDir, baseName, options = {}) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const csvContent = toCSV(data, headers);
  const htmlContent = toHTMLTable(data, headers, options);

  const csvPath = path.join(outputDir, `${baseName}.csv`);
  const htmlPath = path.join(outputDir, `${baseName}.html`);

  fs.writeFileSync(csvPath, csvContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  return { csvPath, htmlPath };
}

module.exports = {
  readCSV,
  writeReport,
  toCSV,
  toHTMLTable
};