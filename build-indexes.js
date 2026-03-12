/**
 * build-indexes.js
 * Runs at deploy time (via netlify.toml build command).
 * Scans each _data/<collection>/ folder and writes an index.json
 * listing all JSON files — so cms-loader.js knows what to fetch.
 *
 * Run manually: node build-indexes.js
 */

const fs   = require('fs');
const path = require('path');

const collections = ['announcements', 'events', 'board', 'documents'];
const dataDir = path.join(__dirname, '_data');

collections.forEach(col => {
  const dir = path.join(dataDir, col);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort();

  const indexPath = path.join(dir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(files, null, 2) + '\n');
  console.log(`✓ ${col}/index.json — ${files.length} file(s)`);
});

console.log('Index build complete.');
