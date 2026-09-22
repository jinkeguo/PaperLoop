'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {globalThis: {}, URL};
const source = fs.readFileSync(
	path.join(__dirname, 'paperloop-auto-display-policy.js'),
	'utf8'
);
vm.runInNewContext(source, context, {filename: 'paperloop-auto-display-policy.js'});
const policy = context.globalThis.PaperLoopAutoDisplayPolicy;

assert.deepEqual(
	JSON.parse(JSON.stringify(policy.normalizeCategories())),
	{literature: true, webpage: true}
);
assert.deepEqual(
	JSON.parse(JSON.stringify(policy.normalizeCategories({literature: false}))),
	{literature: false, webpage: true}
);

assert.equal(policy.classifyTabInfo({translators: [{itemType: 'multiple'}]}), 'result-list');
assert.equal(policy.classifyTabInfo({
	url: 'https://kns.cnki.net/kcms2/article/abstract?v=abc',
	translators: [{itemType: 'multiple'}]
}), 'literature', 'CNKI detail routes override transient multiple detection');
assert.equal(policy.classifyTabInfo({
	url: 'https://www.sciencedirect.com/science/article/pii/S0263822319328302',
	translators: [{itemType: 'multiple'}]
}), 'literature', 'ScienceDirect article routes override recommendation-list detection');
assert.equal(policy.classifyTabInfo({
	url: 'https://kns.cnki.net/kns8s/defaultresult/index?kw=test',
	translators: [{itemType: 'journalArticle'}]
}), 'result-list', 'CNKI result routes remain manual even if detection is temporarily concrete');
assert.equal(policy.classifyTabInfo({
	url: 'https://www.sciencedirect.com/search?qs=evtol',
	translators: [{itemType: 'journalArticle'}]
}), 'result-list', 'ScienceDirect search routes remain manual');
assert.equal(
	policy.classifyTabInfo({isPDF: true, translators: [{itemType: 'multiple'}]}),
	'literature',
	'direct PDF pages remain literature even if detection is temporarily multiple'
);
assert.equal(policy.classifyTabInfo({isPDF: true, translators: []}), 'literature');
assert.equal(policy.classifyTabInfo({translators: [{itemType: 'journalArticle'}]}), 'literature');
assert.equal(policy.classifyTabInfo({translators: [{itemType: 'thesis'}]}), 'literature');
assert.equal(policy.classifyTabInfo({translators: [{itemType: 'webpage'}]}), 'webpage');
assert.equal(policy.classifyTabInfo({translators: []}), 'webpage');
assert.equal(policy.classifyTabInfo({}), 'webpage');

assert.equal(policy.shouldAutoDisplay('result-list', {literature: true, webpage: true}), false);
assert.equal(policy.shouldAutoDisplay('literature', {literature: true, webpage: false}), true);
assert.equal(policy.shouldAutoDisplay('webpage', {literature: true, webpage: false}), false);

console.log('PaperLoop auto-display policy tests passed');
