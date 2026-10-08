'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function testHost(version, privateCleanup=true) {
const calls = [];
const context = vm.createContext({
	console,
	Map,
	Set,
	WeakSet,
	Date,
	URL,
	setInterval() { calls.push(['setInterval']); return 1; },
	clearInterval() { calls.push(['clearInterval']); },
	setTimeout,
	clearTimeout,
	Zotero: {
		version,
		initializationPromise: Promise.resolve().then(() => calls.push(['initialized'])),
		Server: {Endpoints: {}},
		Reader: {
			registerEventListener(...args) { calls.push(['reader-register', ...args]); },
			_unregisterEventListenerByPluginID(...args) { calls.push(['reader-unregister', ...args]); }
		},
		Notes: {_editorInstances: []},
		Libraries: {getAll() { return []; }},
		Collections: {async loadAll() {}, getByLibrary() { return []; }},
		getActiveZoteroPane() { return null; },
		debug(message) { calls.push(['debug', message]); },
		logError(error) { calls.push(['error', String(error && error.message || error)]); }
	}
});
if (!privateCleanup) {
 delete context.Zotero.Reader._unregisterEventListenerByPluginID;
 context.Zotero.Reader.unregisterEventListener=(...args)=>calls.push(['reader-public-unregister',...args]);
}

context.Services = {
	scriptloader: {
		loadSubScript(uri) {
			const file = uri.replace('test://paperloop/', '');
			const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
			vm.runInContext(source, context, {filename: file});
		}
	}
};

const bootstrap = fs.readFileSync(path.join(__dirname, 'bootstrap.js'), 'utf8');
vm.runInContext(bootstrap, context, {filename: 'bootstrap.js'});

	await context.startup({
		id: 'paperloop-doi-bridge@paperloop.app',
		version: '0.5.6',
		rootURI: 'test://paperloop/'
	});
	assert.equal(calls.some(call => call[0] === 'error'), false);
	assert.equal(Object.keys(context.Zotero.Server.Endpoints).length, 10);
	assert.equal(
		Object.values(context.Zotero.Server.Endpoints)
			.every(Endpoint => Endpoint.prototype.init.length === 1),
		true,
		'all endpoints must use Zotero 9 single-parameter return-value dispatch'
	);
	assert.equal(calls.filter(call => call[0] === 'reader-register').length, 1);
	assert.ok(
		calls.findIndex(call => call[0] === 'initialized')
			< calls.findIndex(call => call[0] === 'reader-register'),
		'host initialization must finish before PaperLoop registers runtime hooks'
	);

	context.shutdown();
	assert.equal(Object.keys(context.Zotero.Server.Endpoints).length, 0);
	if (privateCleanup) assert.deepEqual(
		calls.find(call => call[0] === 'reader-unregister').slice(1),
		['paperloop-doi-bridge@paperloop.app']
	);
	else assert.equal(calls.filter(call=>call[0]==='reader-public-unregister').length,1);
	await context.startup({id:'paperloop-doi-bridge@paperloop.app',version:'0.5.6',rootURI:'test://paperloop/'});
	assert.equal(Object.keys(context.Zotero.Server.Endpoints).length,10);
	context.shutdown();
	assert.equal(Object.keys(context.Zotero.Server.Endpoints).length,0);
	assert.equal(calls.some(call=>call[0]==='error'),false);
	console.log('PaperLoop bootstrap/re-enable mock passed: '+version+'; private cleanup='+privateCleanup);
}
(async()=>{for(const version of ['7.0.32','8.0.4','9.0.6','10.0.3'])for(const cleanup of [true,false])await testHost(version,cleanup);})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
