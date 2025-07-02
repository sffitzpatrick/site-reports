// a11y-run-all.js
const { execSync } = require("child_process");

const args = process.argv.slice(2).join(" ");
execSync(`node crawler.js ${args}`, { stdio: "inherit" });
execSync(`node summary-reporter.js ${args}`, { stdio: "inherit" });