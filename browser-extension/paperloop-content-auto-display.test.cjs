const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pageSaving = fs.readFileSync(path.join(root, 'inject', 'pageSaving.js'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'inject', 'paperLoopSidebar_inject.js'), 'utf8');
const scripts = manifest.content_scripts[0].js;

assert.equal(manifest.version, '0.3.28');
assert.ok(scripts.indexOf('inject/paperLoopFlow_inject.js')>0&&scripts.indexOf('inject/paperLoopFlow_inject.js')<scripts.indexOf('inject/paperLoopSidebar_inject.js'),'theme/layout helper must load before sidebar');
const background=fs.readFileSync(path.join(root,'background.js'),'utf8');
assert.ok(background.indexOf('"inject/paperLoopFlow_inject.js"')>0&&background.indexOf('"inject/paperLoopFlow_inject.js"')<background.indexOf('"inject/paperLoopSidebar_inject.js"'),'reinjection/reload must load the helper too');
assert.ok(scripts.includes('paperloop-auto-display-policy.js'),
	'content scripts must load the shared auto-display policy');
assert.ok(scripts.indexOf('paperloop-auto-display-policy.js') < scripts.indexOf('inject/pageSaving.js'),
	'policy must be available before PageSaving runs detection');
assert.match(pageSaving, /await this\._paperLoopAutoDisplay\(translators\)/,
	'detection completion must invoke the content-side fallback');
assert.match(pageSaving, /classifyTabInfo\(\{[\s\S]*?translators,[\s\S]*?isPDF:[\s\S]*?url: window\.location\.href/,
	'fallback must use the shared Translator/PDF classification');
assert.match(pageSaving, /shouldAutoDisplay\(pageCategory, categories\)/,
	'fallback must honor the two persisted category switches and result-list exclusion');
assert.match(pageSaving, /PaperLoopSidebar\.autoDisplay\(\{/,
	'fallback must render locally instead of relying on a background return message');
assert.match(sidebar, /dismissedDocumentKey === props\.documentKey/,
	'local fallback must respect a manual close for the current document');

console.log('PaperLoop content-side automatic-display checks passed');
