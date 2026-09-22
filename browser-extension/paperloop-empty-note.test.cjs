'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
const match = source.match(
	/\tfunction _paperLoopNoteHTML\(text\) \{[\s\S]*?\n\t\}\n\n\tfunction _paperLoopDocumentKey/
);
assert.ok(match, 'PaperLoop note formatter must remain testable');

const context = vm.createContext({});
vm.runInContext(`${match[0].replace(/\n\n\tfunction _paperLoopDocumentKey$/, '')}; this.formatNote = _paperLoopNoteHTML;`, context);

assert.equal(context.formatNote(''), '<h1>PaperLoop 思考</h1>');
assert.equal(context.formatNote('   \n'), '<h1>PaperLoop 思考</h1>');
assert.equal(
	context.formatNote('第一段\n第二行\n\n<script>'),
	'<h1>PaperLoop 思考</h1><p>第一段<br>第二行</p><p>&lt;script&gt;</p>'
);

console.log('PaperLoop browser empty-thought note tests passed');
