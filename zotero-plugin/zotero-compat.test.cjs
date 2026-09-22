'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCompat(version='9.0.6', options={}) {
	const calls = [];
	const reader = {
		registerEventListener(...args) { calls.push(['register', ...args]); },
		unregisterEventListener(...args) { calls.push(['unregister-public', ...args]); }
	};
	if (options.privateCleanup !== false) {
		reader._unregisterEventListenerByPluginID = (...args) => {
			calls.push(['unregister-private', ...args]);
		};
	}
	const context = {
		Zotero: {
			version,
			Server: {Endpoints: {}},
			Reader: reader,
			Notes: {_editorInstances: []}
		},
		Services: {
			scriptloader: {
				loadSubScript(...args) { calls.push(['load', ...args]); }
			}
		}
	};
	const source = fs.readFileSync(path.join(__dirname, 'zotero-compat.js'), 'utf8');
	vm.runInNewContext(source, context, {filename: 'zotero-compat.js'});
	return {compat: context.PaperLoopZoteroCompat, context, calls};
}

for (const version of ['7.0.32', '8.0.1', '9.0.6']) {
	const {compat} = loadCompat(version);
	assert.equal(compat.assertSupported().hostVersion, version);
}
assert.throws(() => loadCompat('10.0.1').compat.assertSupported(), /UNSUPPORTED_ZOTERO_VERSION/);

{
	const {compat, context} = loadCompat();
	function Endpoint() {}
	compat.registerEndpoint('/connector/paperloop/test', Endpoint);
	assert.equal(context.Zotero.Server.Endpoints['/connector/paperloop/test'], Endpoint);
	assert.equal(compat.unregisterEndpoint('/connector/paperloop/test', function Other() {}), false);
	assert.equal(context.Zotero.Server.Endpoints['/connector/paperloop/test'], Endpoint);
	assert.equal(compat.unregisterEndpoint('/connector/paperloop/test', Endpoint), true);
}

{
	const {compat, calls} = loadCompat();
	const handler = () => {};
	compat.registerReaderListener('renderTextSelectionPopup', handler, 'paperloop@test');
	compat.unregisterReaderListener('renderTextSelectionPopup', handler, 'paperloop@test');
	assert.equal(calls[0][0], 'register');
	assert.deepEqual(calls[0].slice(1), ['renderTextSelectionPopup', handler, 'paperloop@test']);
	assert.deepEqual(calls[1], ['unregister-private', 'paperloop@test']);
}

{
	const {compat, calls} = loadCompat('9.0.6', {privateCleanup: false});
	const handler = () => {};
	compat.unregisterReaderListener('renderTextSelectionPopup', handler, 'paperloop@test');
	assert.deepEqual(calls[0], ['unregister-public', 'renderTextSelectionPopup', handler]);
	compat.loadSubScript('file:///paperloop.js');
	assert.deepEqual(calls[1], ['load', 'file:///paperloop.js', undefined]);
}

console.log('PaperLoop Zotero compatibility tests passed');
