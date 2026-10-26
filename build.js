#!/usr/bin/env node
/* Zero-dependency build: joins src/ into one self-contained HTML file.
 *
 *   node build.js            -> writes dist/noise_poc.html
 *   node build.js --check    -> exits 1 if dist/noise_poc.html is out of date
 *
 * src/index.html   page shell with /*@@CSS@@*\/ and /*@@JS@@*\/ markers
 * src/style.css    inlined at the CSS marker
 * src/data/*.json  embedded as `const DATA = { <basename>: <json>, ... };`
 * src/js/*.js      concatenated in file-name order inside one IIFE (shared scope)
 *
 * Users never run this; it is for developers and CI. The built file runs from
 * local disk with no network and no external scripts.
 */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = __dirname, SRC = path.join(ROOT, 'src'), OUT = path.join(ROOT, 'dist', 'noise_poc.html');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function list(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort();
}

function build() {
  const shell = read(path.join(SRC, 'index.html'));
  const css = read(path.join(SRC, 'style.css')).replace(/\n$/, '');

  const data = {};
  for (const f of list(path.join(SRC, 'data'), '.json')) {
    const key = path.basename(f, '.json');
    data[key] = JSON.parse(read(path.join(SRC, 'data', f)));   // validates the JSON
  }
  const dataJs = Object.keys(data).length
    ? '/* ================================ DATA ================================= */\n' +
      'const DATA = ' + JSON.stringify(data, null, 1) + ';\n'
    : '';

  const js = list(path.join(SRC, 'js'), '.js').map(f => read(path.join(SRC, 'js', f)).replace(/\n$/, ''));
  const body = "(function () {\n'use strict';\n\n" + dataJs + js.join('\n') + '\n})();';

  if (!shell.includes('/*@@CSS@@*/') || !shell.includes('/*@@JS@@*/')) throw new Error('src/index.html is missing a build marker');
  // split/join instead of replace() so `$` sequences in the source are kept literally
  return shell.split('/*@@CSS@@*/').join(css).split('/*@@JS@@*/').join(body);
}

const html = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? read(OUT) : '';
  if (cur !== html) { console.error('dist/noise_poc.html is out of date - run `node build.js`'); process.exit(1); }
  console.log('dist/noise_poc.html is up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024).toFixed(0)} KB)`);
}
