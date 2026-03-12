/**
 * vendor-approve.js  — Netlify Function
 *
 * POST body:
 *   { action: "approve" | "reject", submissionId: string, vendor: { name, category, phone, website, description } }
 *
 * On approve  → creates _data/vendors/<slug>.md via GitHub Contents API, then deletes Netlify Forms submission
 * On reject   → marks Netlify Forms submission as spam (deletes it)
 *
 * Required env vars (set in Netlify → Site settings → Environment variables):
 *   GITHUB_TOKEN        — Personal access token with repo write scope
 *   NETLIFY_API_TOKEN   — Netlify personal access token
 *   NETLIFY_SITE_ID     — Your site's Netlify ID
 *   GITHUB_REPO_OWNER   — mtrimble
 *   GITHUB_REPO_NAME    — shamrock-ridge-hoa
 */

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action, submissionId, vendor } = body;
  const {
    GITHUB_TOKEN,
    NETLIFY_API_TOKEN,
    NETLIFY_SITE_ID,
    GITHUB_REPO_OWNER = 'mtrimble',
    GITHUB_REPO_NAME  = 'shamrock-ridge-hoa',
  } = process.env;

  if (!GITHUB_TOKEN || !NETLIFY_API_TOKEN || !NETLIFY_SITE_ID) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing environment variables. See setup instructions.' }) };
  }

  // ── Approve: write .md file to GitHub ──────────────────────────────────────
  if (action === 'approve') {
    if (!vendor || !vendor.name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Vendor data required for approval' }) };
    }

    // Build a URL-safe slug from the business name
    const slug = vendor.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const frontmatter = [
      '---',
      `name: "${vendor.name.replace(/"/g, '\\"')}"`,
      `category: "${(vendor.category || 'other').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}"`,
      `phone: "${(vendor.phone || '').replace(/"/g, '\\"')}"`,
      `website: "${(vendor.website || '').replace(/"/g, '\\"')}"`,
      `description: "${(vendor.description || '').replace(/"/g, '\\"')}"`,
      `recommended: false`,
      `active: true`,
      '---',
      '',
    ].join('\n');

    const encoded = Buffer.from(frontmatter).toString('base64');
    const filePath = `_data/vendors/${slug}.md`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

    // Check if file already exists (to get its SHA for update)
    let sha;
    try {
      const check = await fetch(apiUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (check.ok) {
        const existing = await check.json();
        sha = existing.sha;
      }
    } catch { /* file doesn't exist, that's fine */ }

    const ghPayload = {
      message: `Add vendor: ${vendor.name} (approved via HOA admin)`,
      content: encoded,
      ...(sha ? { sha } : {}),
    };

    const ghRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ghPayload),
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'GitHub write failed', detail: err }) };
    }
  }

  // ── Delete submission from Netlify Forms (approve & reject) ────────────────
  if (submissionId) {
    await fetch(`https://api.netlify.com/api/v1/submissions/${submissionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${NETLIFY_API_TOKEN}` },
    });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, action }),
  };
};
