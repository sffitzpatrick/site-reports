const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Only needed if using Node < 18

// Configuration
const DATESTAMP = process.env.DATESTAMP;
const REPORTS_DIR = path.join('scheduled-reports', DATESTAMP);
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = 'noreply@proofstudio.co';
const TO_EMAIL = 'sean@proofstudio.co';

if (!DATESTAMP) {
  console.error('ERROR: DATESTAMP environment variable is not set.');
  process.exit(1);
}

if (!SENDGRID_API_KEY) {
  console.error('ERROR: SENDGRID_API_KEY environment variable is not set.');
  process.exit(1);
}

async function sendEmail(site) {
  const body = {
    personalizations: [{
      to: [{ email: TO_EMAIL }],
      subject: `Report for ${site}`,
    }],
    from: { email: FROM_EMAIL },
    content: [{
      type: 'text/plain',
      value: `The report for ${site} is ready. View it here: https://sffitzpatrick.github.io/site-reports/scheduled-reports/${DATESTAMP}/${site}/summary.html`
    }]
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email for ${site}: ${response.status} ${errorText}`);
  }

  console.log(`Email sent successfully for ${site}`);
}

async function main() {
  try {
    const sites = await fs.promises.readdir(REPORTS_DIR, { withFileTypes: true });
    for (const dirent of sites) {
      if (dirent.isDirectory()) {
        const site = dirent.name;
        console.log(`Sending email for ${site}...`);
        await sendEmail(site);
      }
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
