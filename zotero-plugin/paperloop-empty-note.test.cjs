'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const savedNotes = [];
class MockNote {
	constructor(type) {
		assert.equal(type, 'note');
		this.key = `NOTE${savedNotes.length + 1}`;
	}
	setNote(html) {
		this.html = html;
	}
	async saveTx() {
		savedNotes.push(this);
	}
}

const context = vm.createContext({
	console,
	Map,
	Set,
	Zotero: {
		Item: MockNote,
		Notes: {AUTO_SYNC_DELAY: 1},
		Utilities: {cleanDOI(value) { return value; }}
	}
});
const source = fs.readFileSync(path.join(__dirname, 'paperloop.js'), 'utf8');
vm.runInContext(source, context, {filename: 'paperloop.js'});
const bridge = context.PaperLoopDOIBridge;

(async () => {
	const parent = {libraryID: 1, id: 10, getNotes() { return []; }};

	bridge.findCanonicalPaperLoopNote = async () => null;
	const created = await bridge._upsertNoteOnce(parent, '', 'empty-save');
	assert.equal(created.created, true);
	assert.equal(created.noteKey, 'NOTE1');
	assert.equal(savedNotes[0].html, '<!-- paperloop-event:empty-save --><h1>PaperLoop 思考</h1>');

	let setCalls = 0;
	let saveCalls = 0;
	const existing = {
		key: 'EXISTING',
		getNote() { return '<h1>PaperLoop 思考</h1><p>保留已有思考</p>'; },
		setNote() { setCalls++; },
		async saveTx() { saveCalls++; }
	};
	bridge.findCanonicalPaperLoopNote = async () => existing;
	const reused = await bridge._upsertNoteOnce(parent, '', 'blank-again');
	assert.equal(reused.noteKey, 'EXISTING');
	assert.equal(reused.created, false);
	assert.equal(reused.updated, false);
	assert.equal(setCalls, 0, 'blank saves must not erase an existing thought');
	assert.equal(saveCalls, 0, 'blank saves must not rewrite an existing thought');

	const updated = await bridge._upsertNoteOnce(
		parent,
		'<h1>PaperLoop 思考</h1><p>新的思考</p>',
		'written-save'
	);
	assert.equal(updated.updated, true);
	assert.equal(setCalls, 1);
	assert.equal(saveCalls, 1);

	console.log('PaperLoop empty-thought note tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
