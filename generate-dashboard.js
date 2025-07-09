// generate-dashboard.js

const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const args = require('minimist')(process.argv.slice(2));

// Parse CLI args
const REPORT_DIR = args.output_dir; // e.g. docs/reports/2025-07-08/example/reports
const SITE_NAME = args.site_name || 'Unnamed Site';
const DATESTAMP = args.datestamp || format(new Date(), 'yyyy-MM-dd');
const PAGE_COUNT = args.page_count || '?';

// Validate directory
if (!REPORT_DIR || !fs.existsSync(REPORT_DIR)) {
  console.error(`❌ Report directory does not exist: ${REPORT_DIR}`);
  process.exit(1);
}

const reportFiles = fs.readdirSync(REPORT_DIR).filter(file =>
  file.endsWith('.html') || file.endsWith('.csv')
);

const now = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

const rows = reportFiles.map(file => {
  const href = path.join(path.basename(REPORT_DIR), file);
  const type = file.endsWith('.csv') ? 'CSV' : 'HTML';
  return `<tr>
    <td>${file}</td>
    <td>${type}</td>
    <td><a href="${href}" target="_blank">${href}</a></td>
  </tr>`;
}).join('\n');

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${SITE_NAME} Audit Dashboard</title>
  <style>
    body { font-family: sans-serif; padding: 2em; background: #f9f9f9; }
    h1 { font-size: 1.8em; }
    .meta { margin-bottom: 1.5em; color: #555; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; border: 1px solid #ccc; }
    th { background: #eee; }
    tr:nth-child(even) { background: #fefefe; }
    a { color: #0077cc; text-decoration: none; }
  </style>
</head>
<body>
  <h1>📊 ${SITE_NAME} Audit Dashboard</h1>
  <div class="meta">
    <div><strong>Scan Date:</strong> ${DATESTAMP}</div>
    <div><strong>Generated:</strong> ${now}</div>
    <div><strong>Pages Scanned:</strong> ${PAGE_COUNT}</div>
  </div>
  <table>
    <thead>
      <tr><th>Report</th><th>Type</th><th>Link</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
`;

const outPath = path.join(path.dirname(REPORT_DIR), 'index.html');
fs.writeFileSync(outPath, html);
console.log(`✅ Dashboard written to ${outPath}`);
