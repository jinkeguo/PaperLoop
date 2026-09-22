const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

assert.equal(manifest.version, '0.3.27');
assert.match(background, /nextTabInfo\.paperLoopPinnedByAuto = true;[\s\S]*?open: true, pending: true/,
	'same-document navigation must keep an auto-open panel pending until reclassification');
assert.match(background, /browser\.tabs\.query\(\{active: true, currentWindow: true\}\)/,
	'extension startup must recover the already-open active tab');
assert.match(background, /async function _paperLoopRecoverAutoDisplay\(tab, expectedURL\)/,
	'background must provide one guarded recovery path');
assert.match(background, /await _paperLoopEnsureContentScript\(tab\)/,
	'recovery must inject or ping the content script before publishing state');
assert.match(background, /await _paperLoopAwaitTranslatorDetection\(tab\)/,
	'recovery must wait for Translator detection before classifying the page');
assert.match(background, /if \(details\.frameId !== 0\) return;[\s\S]*?_paperLoopRecoverAutoDisplay\(tab, details\.url\)/,
	'only top-frame DOMContentLoaded events may recover automatic display');
assert.match(background, /onActivated for[\s\S]*?await _paperLoopRecoverAutoDisplay\(tab, url\)/,
	'tab activation must recover pages missed during extension reload');
assert.match(background, /if \(!tab \|\| \(expectedURL && tab\.url !== expectedURL\)\) return \{open: false\};/,
	'recovery must not publish stale state after navigation');

console.log('PaperLoop automatic-display recovery checks passed');
