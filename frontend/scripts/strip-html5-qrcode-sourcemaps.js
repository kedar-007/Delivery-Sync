#!/usr/bin/env node
/**
 * Strip `//# sourceMappingURL=…` comments from html5-qrcode's published .js
 * files. The package ships those comments pointing at .ts source files that
 * aren't bundled in the npm tarball, so CRA's source-map-loader emits ~24
 * "Failed to parse source map" warnings on every build, drowning out real
 * issues. We can't fix the upstream package, and overriding source-map-loader
 * from CRA without ejecting requires extra tooling (craco / react-app-rewired)
 * we'd rather not pull in just for this.
 *
 * Idempotent: safe to re-run on every `npm install` via the `postinstall`
 * hook. If the comments are already gone, this is a no-op.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'node_modules', 'html5-qrcode', 'esm');

function strip(file) {
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  if (next !== src) {
    fs.writeFileSync(file, next);
    return true;
  }
  return false;
}

function walk(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      if (strip(full)) count++;
    }
  }
  return count;
}

const stripped = walk(ROOT);
if (stripped > 0) {
  console.log(`[strip-html5-qrcode-sourcemaps] cleaned ${stripped} file(s)`);
}
