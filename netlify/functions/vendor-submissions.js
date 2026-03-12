/**
 * vendor-submissions.js — Netlify Function
 *
 * GET → returns pending vendor suggestion submissions from Netlify Forms
 *
 * Required env vars:
 *   NETLIFY_API_TOKEN  — Netlify personal access token
 *   NETLIFY_SITE_ID    — Your site's Netlify ID
 */

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { NETLIFY_API_TOKEN, NETLIFY_SITE_ID } = process.env;

  if (!NETLIFY_API_TOKEN || !NETLIFY_SITE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Missing NETLIFY_API_TOKEN or NETLIFY_SITE_ID environment variables.',
        setup: 'Go to Netlify → Site configuration → Environment variables and add these two values.',
      }),
    };
  }

  try {
    // First, find the form named "vendor-suggestion"
    const formsRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/forms`,
      { headers: { Authorization: `Bearer ${NETLIFY_API_TOKEN}` } }
    );

    if (!formsRes.ok) {
      throw new Error(`Netlify Forms API error: ${formsRes.status} ${await formsRes.text()}`);
    }

    const forms = await formsRes.json();
    const vendorForm = forms.find(f =>
      f.name && (
        f.name.toLowerCase().includes('vendor') ||
        f.name.toLowerCase().includes('suggest')
      )
    );

    if (!vendorForm) {
      // No form found yet (no submissions have been made) — return empty
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    // Fetch pending (verified) submissions
    const subsRes = await fetch(
      `https://api.netlify.com/api/v1/forms/${vendorForm.id}/submissions?per_page=100`,
      { headers: { Authorization: `Bearer ${NETLIFY_API_TOKEN}` } }
    );

    if (!subsRes.ok) {
      throw new Error(`Submissions API error: ${subsRes.status} ${await subsRes.text()}`);
    }

    const submissions = await subsRes.json();
    return { statusCode: 200, headers, body: JSON.stringify(submissions) };

  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
