'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

// Files whose text may contain references to fingerprinted assets.
const TEXT_EXTS = new Set(['.html', '.js', '.css', '.webmanifest']);

// Shell routes that get precached. /scheme/:id is dynamic and is not listed.
const SHELL_PATHS = [
  '/results',
  '/mee-seva',
  '/tracker',
  '/about',
  '/rules-check',
  '/helper',
  '/editor',
  '/demo',
];

function sha8(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Lists every file under dir as a posix-style path relative to dir.
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walk(dir, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

// Fingerprint targets: everything under css/ and js/, plus top-level .css/.js
// files other than sw.js and manifest files.
function isFingerprintTarget(rel) {
  if (rel.startsWith('css/') || rel.startsWith('js/')) return true;
  if (rel.includes('/')) return false;
  const ext = path.extname(rel);
  return (ext === '.css' || ext === '.js') && rel !== 'sw.js' && !rel.startsWith('manifest');
}

function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('build: public/ not found');
    process.exit(1);
  }

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });

  const files = walk(DIST_DIR);

  // Hash each target's content as copied, and derive its fingerprinted name.
  const mapping = {};
  for (const rel of files.filter(isFingerprintTarget)) {
    const buf = fs.readFileSync(path.join(DIST_DIR, rel));
    const ext = path.extname(rel);
    const base = rel.slice(0, rel.length - ext.length);
    mapping[rel] = `${base}.${sha8(buf)}${ext}`;
  }

  // Longest logical paths first, so a shorter key never rewrites part of a longer one.
  // The lookbehind stops "app.js" from matching inside "myapp.js".
  const patterns = Object.keys(mapping)
    .sort((a, b) => b.length - a.length)
    .map((key) => [new RegExp(`(?<![A-Za-z0-9_.-])${escapeRegExp(key)}`, 'g'), mapping[key]]);

  // Rewrite references in every text file, including sw.js.
  let rewritten = 0;
  for (const rel of files) {
    if (!TEXT_EXTS.has(path.extname(rel))) continue;
    const full = path.join(DIST_DIR, rel);
    const before = fs.readFileSync(full, 'utf8');
    let after = before;
    for (const [re, to] of patterns) {
      after = after.replace(re, () => to);
    }
    if (after !== before) {
      fs.writeFileSync(full, after);
      rewritten += 1;
    }
  }

  // Rename the targets to their fingerprinted names.
  for (const [logical, fingerprinted] of Object.entries(mapping)) {
    fs.renameSync(path.join(DIST_DIR, logical), path.join(DIST_DIR, fingerprinted));
  }

  fs.writeFileSync(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(mapping, null, 2) + '\n');

  // Fill the service worker placeholders.
  const assetPaths = Object.values(mapping).sort();
  const cacheVersion = crypto
    .createHash('sha256')
    .update(assetPaths.join('\n'))
    .digest('hex')
    .slice(0, 12);
  const precacheList = ['/', ...SHELL_PATHS, ...assetPaths.map((p) => '/' + p)];

  const swPath = path.join(DIST_DIR, 'sw.js');
  let swNote = 'sw.js not found, precache skipped';
  if (fs.existsSync(swPath)) {
    const sw = fs
      .readFileSync(swPath, 'utf8')
      .split('__PRECACHE_LIST__')
      .join(JSON.stringify(precacheList))
      .split('__CACHE_VERSION__')
      .join(cacheVersion);
    fs.writeFileSync(swPath, sw);
    swNote = `${precacheList.length} precache entries`;
  }

  console.log(
    `Built dist/: ${Object.keys(mapping).length} fingerprinted assets, ` +
      `${rewritten} text files rewritten, ${swNote}, cache version ${cacheVersion}.`
  );
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
