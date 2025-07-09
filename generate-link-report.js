const fs = require('fs');
const path = require('path');

const args = require('minimist')(process.argv.slice(2));
const SITE_NAME = args.site_name;
const DATESTAMP = args.datestamp;
const REPORT_DIR = DATESTAMP + '/' + SITE_NAME

const DIR_BASE = 'docs/reports/' + REPORT_DIR;

const inputFile = DIR_BASE + '/link_issues.json'; // e.g., 'docs/reports/2025-07-08/example/link_issues.json'
const outputFile = args.output_file || DIR_BASE + '/link-report.html';


if (!fs.existsSync(inputFile)) {
  console.error(`❌ File not found: ${inputFile}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile));

const rows = data.map(item => `
  <tr>
    <td><a href="${item.link}" target="_blank">${item.link}</a></td>
    <td>${item.status || 'N/A'}</td>
    <td>${item.error || ''}</td>
    <td><a href="${item.source}" target="_blank">${item.source}</a></td>
  </tr>
`).join('\n');

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Broken Link Report</title>
  <style>
    body { font-family: sans-serif; padding: 2em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    th { background: #f4f4f4; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <h1>Broken Link Report</h1>
  <p>Found ${data.length} issues.</p>
  <table>
    <thead>
      <tr>
        <th>Broken Link</th>
        <th>Status</th>
        <th>Error</th>
        <th>Found On</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
`;

fs.writeFileSync(outputFile, html);
console.log(`✅ HTML report written to ${outputFile}`);