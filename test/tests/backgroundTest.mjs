/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
					George Mason University, Fairfax, Virginia, USA
					http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

import { Tab, background, getExtensionURL } from '../support/utils.mjs';

describe('Connector_Browser', function() {
	var tab = new Tab();

	describe('#getAllCookies()', function() {
		it('uses the Safari cookie store associated with the tab', async function() {
			let details = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.cookies, 'getAllCookieStores').resolves([
					{id: 'persistent-1', tabIds: []},
					{id: 'persistent-2', tabIds: [123]}
				]);
				sinon.stub(browser.cookies, 'getAll').resolves([]);
				try {
					await Zotero.Connector_Browser.getAllCookies({url: 'https://example.com/'}, 123);
					return browser.cookies.getAll.firstCall.args[0];
				}
				finally {
					browser.cookies.getAllCookieStores.restore();
					browser.cookies.getAll.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.deepEqual(details, {
				url: 'https://example.com/',
				storeId: 'persistent-2'
			});
		});

		it('uses the active tab to resolve the Safari cookie store when no tab is provided', async function() {
			let details = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.tabs, 'query').resolves([{id: 123}]);
				sinon.stub(browser.cookies, 'getAllCookieStores').resolves([
					{id: 'persistent-1', tabIds: []},
					{id: 'persistent-2', tabIds: [123]}
				]);
				sinon.stub(browser.cookies, 'getAll').resolves([]);
				try {
					await Zotero.Connector_Browser.getAllCookies({name: 'target'});
					return browser.cookies.getAll.firstCall.args[0];
				}
				finally {
					browser.tabs.query.restore();
					browser.cookies.getAllCookieStores.restore();
					browser.cookies.getAll.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.deepEqual(details, {
				name: 'target',
				storeId: 'persistent-2'
			});
		});
	});
	
	describe('onPDFFrame', function() {
		it('sets icon to PDF if no translators present', async function () {
			try {
				let bgPromise = background(function() {
					Zotero.Prefs.set('firstUse', false);
					let stub = sinon.stub(Zotero.Connector_Browser, '_showPDFIcon');
					var deferred = Zotero.Promise.defer();
					stub.callsFake(deferred.resolve);
					
					// Independent of the online status of Zotero client we need to observe content types
					// to trigger the onPDFFrame icon, but don't want to affect the already attached
					// observer state, so we generate a custom function to work with
					let customObserver = details => Zotero.ContentTypeHandler.onHeadersReceived(details);
					Zotero.WebRequestIntercept.addListener('headersReceived', customObserver);
					deferred.promise.then(() => Zotero.WebRequestIntercept.removeListener('headersReceived', customObserver));
					return deferred.promise;
				});
				const url = getExtensionURL('test/data/framePDF.html');
				await tab.init(url);
				await bgPromise;
	
				let result = await background(() => {
					return Zotero.Connector_Browser._showPDFIcon.called;
				});
				assert.isTrue(result);
			} finally {
				await background(function() {
					Zotero.Connector_Browser._showPDFIcon.restore()
				});
				if (tab.tabId) {
					await tab.close();
				}
			}
		});
	});

	describe('PaperLoop persistent sidebar and one-click save', function() {
		it('toggles a Translator-backed sidebar without saving on toolbar click', async function() {
			let updates = await background(async function() {
				let tab = {id: 87001, url: 'https://example.com/article', title: 'Example Paper'};
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'paperloop-test-instance',
					translators: [{translatorID: 'paperloop-test-translator', label: 'Example Translator'}]
				});
				let calls = [];
				let open = false;
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async (name, args) => {
					if (name === 'ping') return 'pong';
					if (name === 'paperloop.sidebar.status') return {open};
					if (name === 'paperloop.sidebar.update') {
						open = args.open;
						calls.push({name, args});
					}
				});
				try {
					await Zotero.Connector_Browser.onZoteroButtonElementClick(tab);
					await Zotero.Connector_Browser.onZoteroButtonElementClick(tab);
					return calls;
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.lengthOf(updates, 2);
			assert.equal(updates[0].name, 'paperloop.sidebar.update');
			assert.isTrue(updates[0].args.open);
			assert.isTrue(updates[0].args.canSave);
			assert.equal(updates[0].args.translatorLabel, 'Example Translator');
			assert.isFalse(updates[1].args.open);
		});

		it('opens on the first click and injects into a tab that predates installation', async function() {
			let result = await background(async function() {
				let tab = {id: 87007, url: 'https://example.com/already-open', title: 'Already Open Paper'};
				let tabInfo = {
					instanceID: null,
					translators: null,
					paperLoopPinned: false
				};
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns(tabInfo);
				let injected = false;
				let update = null;
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async (name, args) => {
					if (name === 'ping') return injected ? 'pong' : undefined;
					if (name === 'paperloop.sidebar.status') return {open: false};
					if (name === 'paperloop.sidebar.update') {
						update = args;
						return {open: args.open};
					}
				});
				sinon.stub(Zotero.Connector_Browser, 'injectTranslationScripts').callsFake(async () => {
					injected = true;
				});
				Zotero.Prefs.set('firstUse', true);
				try {
					let clickResult = await Zotero.Connector_Browser.onZoteroButtonElementClick(tab);
					return {
						clickResult,
						firstUse: Zotero.Prefs.get('firstUse'),
						injectCalls: Zotero.Connector_Browser.injectTranslationScripts.callCount,
						update,
						pinned: tabInfo.paperLoopPinned
					};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Messaging.sendMessage.restore();
					Zotero.Connector_Browser.injectTranslationScripts.restore();
				}
			});

			assert.equal(result.injectCalls, 1);
			assert.isFalse(result.firstUse);
			assert.isTrue(result.pinned);
			assert.isTrue(result.update.open);
			assert.isTrue(result.update.pending);
			assert.isTrue(result.clickResult.open);
		});

		it('shows an explicit action error when the current page cannot be injected', async function() {
			let result = await background(async function() {
				let tab = {id: 87008, url: 'https://example.com/blocked', title: 'Blocked Page'};
				let tabInfo = {translators: null, paperLoopPinned: false};
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns(tabInfo);
				sinon.stub(Zotero.Messaging, 'sendMessage').resolves(undefined);
				sinon.stub(Zotero.Connector_Browser, 'injectTranslationScripts').resolves(undefined);
				sinon.stub(browser.action, 'setBadgeText').resolves();
				sinon.stub(browser.action, 'setBadgeBackgroundColor').resolves();
				sinon.stub(browser.action, 'setTitle').resolves();
				try {
					let clickResult = await Zotero.Connector_Browser.onZoteroButtonElementClick(tab);
					return {
						clickResult,
						pinned: tabInfo.paperLoopPinned,
						badge: browser.action.setBadgeText.args[0][0],
						title: browser.action.setTitle.args[0][0]
					};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Messaging.sendMessage.restore();
					Zotero.Connector_Browser.injectTranslationScripts.restore();
					browser.action.setBadgeText.restore();
					browser.action.setBadgeBackgroundColor.restore();
					browser.action.setTitle.restore();
				}
			});

			assert.equal(result.clickResult.error, 'CONTENT_SCRIPT_UNAVAILABLE');
			assert.isFalse(result.pinned);
			assert.equal(result.badge.text, '!');
			assert.include(result.title.title, '刷新页面或允许站点访问');
		});

		it('passes escaped multiline thought text to the Zotero translator save', async function() {
			let result = await background(async function() {
				let tab = {id: 87002, url: 'https://example.com/article-escaped', title: 'Example Paper'};
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'paperloop-test-instance',
					translators: [{translatorID: 'paperloop-test-translator', label: 'Example Translator'}]
				});
				let translateArgs;
				sinon.stub(Zotero.Connector, 'callMethod').resolves({
					targets: [
						{id: 'L1', name: 'My Library', level: 0},
						{id: 'C10', name: '生物', level: 1}
					]
				});
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async (name, args) => {
					if (name === 'translate') {
						translateArgs = args;
						return [{
							paperLoop: {
								status: 'existing',
								libraryID: 1,
								itemKey: 'LINK0001',
								noteKey: 'NOTE0001',
								doi: '10.1000/link'
							}
						}];
					}
				});
				try {
					await browser.storage.local.remove([
						'paperloop:link:v1:https://example.com/article-escaped',
						'paperloop:link:v2:1:https://example.com/article-escaped'
					]);
					let saveResult = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: 'A&B <重要>\n第二行',
						documentKey: 'https://example.com/article-escaped',
						targetID: 'C10'
					}, tab, 0);
					let stored = await browser.storage.local.get(
						'paperloop:link:v2:1:https://example.com/article-escaped'
					);
					return {saveResult, translateArgs, stored};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.isTrue(result.saveResult.ok);
			assert.equal(result.translateArgs[1], 'paperloop-test-translator');
			assert.isUndefined(result.translateArgs[2].note);
			assert.equal(
				result.translateArgs[2].paperLoop.note,
				'<h1>PaperLoop 思考</h1><p>A&amp;B &lt;重要&gt;<br>第二行</p>'
			);
			assert.lengthOf(result.translateArgs[2].paperLoop.eventID, 24);
			assert.equal(result.translateArgs[2].paperLoop.targetID, 'C10');
			assert.equal(
				result.stored['paperloop:link:v2:1:https://example.com/article-escaped'].itemKey,
				'LINK0001'
			);
		});

		it('recovers and stores the DOI link when a site translator drops the PaperLoop result', async function() {
			let result = await background(async function() {
				let tab = {id: 87012, url: 'https://example.com/site-translator', title: 'Site Paper'};
				let calls = [];
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'site-translator-instance',
					translators: [{translatorID: 'site-translator', label: 'Site Translator'}]
				});
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					const method = typeof options === 'string' ? options : options.method;
					calls.push({method, data});
					if (method === 'getSelectedCollection') {
						return {targets: [
							{id: 'L1', name: 'My Library', level: 0},
							{id: 'C10', name: '生物', level: 1}
						]};
					}
					if (method === 'paperloop/resolve') {
						return {items: [{
							id: data.items[0].id,
							status: 'existing',
							libraryID: 1,
							itemKey: 'RECOVER1',
							noteKey: 'RECNOTE1',
							doi: '10.1000/recover'
						}]};
					}
				});
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async name => {
					if (name === 'translate') {
						return [{
							id: 'SITE0001',
							itemType: 'journalArticle',
							title: 'Site Paper',
							DOI: '10.1000/recover'
						}];
					}
				});
				try {
					await browser.storage.local.remove('paperloop:link:v2:1:https://example.com/site-translator');
					const save = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '站点结果缺失后的恢复思考',
						documentKey: 'https://example.com/site-translator',
						targetID: 'C10'
					}, tab, 0);
					const stored = await browser.storage.local.get(
						'paperloop:link:v2:1:https://example.com/site-translator'
					);
					return {save, calls, stored};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.equal(result.save.itemKey, 'RECOVER1');
			assert.equal(result.save.noteKey, 'RECNOTE1');
			assert.deepEqual(result.calls.map(call => call.method), [
				'getSelectedCollection',
				'paperloop/resolve'
			]);
			assert.equal(result.calls[1].data.targetID, 'C10');
			assert.include(result.calls[1].data.note, '站点结果缺失后的恢复思考');
			assert.equal(
				result.stored['paperloop:link:v2:1:https://example.com/site-translator'].noteKey,
				'RECNOTE1'
			);
		});

		it('rebuilds a cacheless document link from Zotero state without writing a note', async function() {
			let result = await background(async function() {
				let tab = {id: 87014, url: 'https://example.com/cacheless', title: 'Cacheless Paper'};
				let calls = [];
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					const method = typeof options === 'string' ? options : options.method;
					calls.push({method, data});
					if (method === 'getSelectedCollection') {
						return {targets: [
							{id: 'L1', name: 'My Library', level: 0},
							{id: 'C10', name: '生物', level: 1}
						]};
					}
					if (method === 'paperloop/state') {
						return {
							status: 'existing',
							libraryID: 1,
							itemKey: 'CACHE001',
							noteKey: 'CACHEN01',
							doi: '10.1000/cacheless',
							noteModified: '2026-08-01 08:00:00',
							thought: 'Zotero authoritative thought'
						};
					}
				});
				try {
					const key = 'paperloop:link:v2:1:https://example.com/cacheless';
					await browser.storage.local.remove(key);
					const state = await Zotero.Connector_Browser.paperLoopGetDocumentState({
						documentKey: 'https://example.com/cacheless',
						targetID: 'C10',
						doi: '10.1000/cacheless'
					}, tab, 0);
					const stored = await browser.storage.local.get(key);
					return {state, calls, stored};
				}
				finally {
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.equal(result.state.status, 'existing');
			assert.equal(result.state.thought, 'Zotero authoritative thought');
			assert.deepEqual(result.calls.map(call => call.method), [
				'getSelectedCollection',
				'paperloop/state'
			]);
			assert.equal(result.calls[1].data.itemKey, '');
			assert.equal(result.calls[1].data.doi, '10.1000/cacheless');
			assert.equal(
				result.stored['paperloop:link:v2:1:https://example.com/cacheless'].itemKey,
				'CACHE001'
			);
		});

		it('coalesces concurrent save requests but not sidebar editing', async function() {
			let translateCalls = await background(async function() {
				let tab = {id: 87003, url: 'https://example.com/article-coalesce', title: 'Example Paper'};
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'paperloop-test-instance',
					translators: [{translatorID: 'paperloop-test-translator', label: 'Example Translator'}]
				});
				let calls = 0;
				sinon.stub(Zotero.Connector, 'callMethod').resolves({
					targets: [
						{id: 'L1', name: 'My Library', level: 0},
						{id: 'C10', name: '生物', level: 1}
					]
				});
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async (name) => {
					if (name === 'translate') {
						calls++;
						await Zotero.Promise.delay(20);
					}
				});
				try {
					let payload = {
						thought: '只保存一次',
						documentKey: 'https://example.com/article-coalesce',
						targetID: 'C10'
					};
					await Promise.all([
						Zotero.Connector_Browser.paperLoopSaveThought(payload, tab, 0),
						Zotero.Connector_Browser.paperLoopSaveThought(payload, tab, 0)
					]);
					return calls;
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.equal(translateCalls, 1);
		});

		it('re-syncs a linked document directly and keeps the PaperLoop target authoritative', async function() {
			let result = await background(async function() {
				let tab = {id: 87010, url: 'https://example.com/linked-paper', title: 'Linked Paper'};
				let calls = [];
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'linked-instance',
					translators: null
				});
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					const method = typeof options === 'string' ? options : options.method;
					calls.push({method, data});
					if (method === 'getSelectedCollection') {
						return {
							targets: [
								{id: 'L1', name: 'My Library', level: 0},
								{id: 'C10', name: '生物', level: 1},
								{id: 'C11', name: '化学', level: 1}
							]
						};
					}
					return {
						status: 'ok',
						libraryID: 1,
						itemKey: 'LINK0002',
						noteKey: 'NOTE0002',
						updated: true,
						collectionAdded: true
					};
				});
				try {
					await browser.storage.local.set({
						'paperloop:link:v1:https://example.com/linked-paper': {
							libraryID: 1,
							itemKey: 'LINK0002',
							noteKey: 'NOTE0002',
							targetID: 'C10'
						}
					});
					let sync = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '补充后的完整思考',
						documentKey: 'https://example.com/linked-paper',
						targetID: 'C11'
					}, tab, 0);
					let stored = await browser.storage.local.get(
						'paperloop:link:v2:1:https://example.com/linked-paper'
					);
					return {sync, calls, stored};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.equal(result.sync.mode, 'sync');
			assert.isTrue(result.sync.updated);
			assert.deepEqual(result.calls.map(call => call.method), [
				'getSelectedCollection',
				'paperloop/append-note'
			]);
			assert.equal(result.calls[1].data.mode, 'upsert');
			assert.equal(result.calls[1].data.itemKey, 'LINK0002');
			assert.equal(result.calls[1].data.targetID, 'C11');
			assert.isUndefined(result.calls[1].data.previousTargetID);
			assert.equal(
				result.stored['paperloop:link:v2:1:https://example.com/linked-paper'].targetID,
				'C11'
			);
		});

		it('reruns the Translator for a linked DOI item only when Zotero reports no usable PDF', async function() {
			let result = await background(async function() {
				const tab = {id: 87015, url: 'https://example.com/missing-pdf', title: 'Missing PDF'};
				const connectorCalls = [];
				let translateCalls = 0;
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'missing-pdf-instance',
					translators: [{translatorID: 'metadata', label: 'Embedded Metadata'}]
				});
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					const method = typeof options === 'string' ? options : options.method;
					connectorCalls.push({method, data});
					if (method === 'getSelectedCollection') {
						return {targets: [
							{id: 'L1', name: 'My Library', level: 0},
							{id: 'C10', name: 'Test', level: 1}
						]};
					}
					if (method === 'paperloop/state') {
						return {
							status: 'existing',
							libraryID: 1,
							itemKey: 'MISSPDF1',
							doi: '10.1000/missing-pdf',
							hasPDF: false
						};
					}
					throw new Error(`Unexpected connector method ${method}`);
				});
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async name => {
					if (name === 'translate') {
						translateCalls++;
						return [{
							id: 'incoming-missing-pdf',
							DOI: '10.1000/missing-pdf',
							paperLoop: {
								status: 'existing',
								libraryID: 1,
								itemKey: 'MISSPDF1',
								noteKey: 'NOTE-MISSING-PDF',
								doi: '10.1000/missing-pdf',
								updated: true,
								hasPDF: true,
								pdfAdded: true,
								pdfAttachmentKey: 'PDF-NEW-1'
							}
						}];
					}
				});
				try {
					const key = 'paperloop:link:v2:1:https://example.com/missing-pdf';
					await browser.storage.local.set({[key]: {
						libraryID: 1,
						itemKey: 'MISSPDF1',
						noteKey: 'NOTE-MISSING-PDF',
						doi: '10.1000/missing-pdf',
						targetID: 'C10'
					}});
					const response = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '补充 PDF 的同时更新思考',
						documentKey: 'https://example.com/missing-pdf',
						targetID: 'C10',
						doi: '10.1000/missing-pdf'
					}, tab, 0);
					return {response, connectorCalls, translateCalls};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.equal(result.translateCalls, 1);
			assert.equal(result.response.mode, 'sync');
			assert.equal(result.response.pdfAdded, true);
			assert.equal(result.response.pdfAttachmentKey, 'PDF-NEW-1');
			assert.deepEqual(result.connectorCalls.map(call => call.method), [
				'getSelectedCollection',
				'paperloop/state'
			]);
		});

		it('drops a stale deleted-item link and re-collects through the Translator DOI path', async function() {
			let result = await background(async function() {
				let tab = {id: 87013, url: 'https://example.com/deleted-paper', title: 'Deleted Paper'};
				let calls = [];
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'deleted-instance',
					translators: [{translatorID: 'deleted-translator', label: 'Site Translator'}]
				});
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					const method = typeof options === 'string' ? options : options.method;
					calls.push({method, data});
					if (method === 'getSelectedCollection') {
						return {targets: [
							{id: 'L1', name: 'My Library', level: 0},
							{id: 'C10', name: 'repairHC', level: 1}
						]};
					}
					if (method === 'paperloop/append-note') {
						throw new Zotero.Connector.CommunicationError(
							'Method paperloop/append-note failed',
							404,
							{error: 'ITEM_NOT_FOUND', itemKey: 'DELETED1'}
						);
					}
				});
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async name => {
					if (name === 'translate') {
						return [{paperLoop: {
							status: 'existing',
							libraryID: 1,
							itemKey: 'RESTORED1',
							noteKey: 'RESTNOTE1',
							doi: '10.1000/deleted'
						}}];
					}
				});
				try {
					const key = 'paperloop:link:v2:1:https://example.com/deleted-paper';
					await browser.storage.local.set({[key]: {
						libraryID: 1,
						itemKey: 'DELETED1',
						noteKey: 'OLDNOTE1',
						doi: '10.1000/deleted',
						targetID: 'C10'
					}});
					const save = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '删除后重新收藏',
						documentKey: 'https://example.com/deleted-paper',
						targetID: 'C10'
					}, tab, 0);
					const stored = await browser.storage.local.get(key);
					return {save, calls, stored};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.equal(result.save.itemKey, 'RESTORED1');
			assert.equal(result.save.noteKey, 'RESTNOTE1');
			assert.deepEqual(result.calls.map(call => call.method), [
				'getSelectedCollection',
				'paperloop/state',
				'paperloop/append-note'
			]);
			assert.equal(
				result.stored['paperloop:link:v2:1:https://example.com/deleted-paper'].itemKey,
				'RESTORED1'
			);
		});

		it('adds a linked item to another Collection without requiring new thought text', async function() {
			let result = await background(async function() {
				let tab = {id: 87011, url: 'https://example.com/classify-only', title: 'Linked Paper'};
				let appendPayload = null;
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'classify-instance',
					translators: null
				});
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					const method = typeof options === 'string' ? options : options.method;
					if (method === 'getSelectedCollection') {
						return {targets: [
							{id: 'L1', name: 'My Library', level: 0},
							{id: 'C10', name: 'Test', level: 1},
							{id: 'C11', name: 'Another', level: 1}
						]};
					}
					appendPayload = data;
					return {status: 'ok', libraryID: 1, itemKey: 'LINK0003', classifiedOnly: true};
				});
				try {
					await browser.storage.local.set({
						'paperloop:link:v2:1:https://example.com/classify-only': {
							libraryID: 1,
							itemKey: 'LINK0003',
							noteKey: 'NOTE0003',
							targetID: 'C10'
						}
					});
					const response = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '',
						documentKey: 'https://example.com/classify-only',
						targetID: 'C11'
					}, tab, 0);
					return {response, appendPayload};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.equal(result.response.mode, 'classify');
			assert.equal(result.appendPayload.note, '');
			assert.equal(result.appendPayload.targetID, 'C11');
			assert.isUndefined(result.appendPayload.previousTargetID);
		});

		it('uses an independent item link when the target is another Zotero Library', async function() {
			let result = await background(async function() {
				let tab = {id: 87012, url: 'https://example.com/cross-library', title: 'Cross-library Paper'};
				let connectorCalls = [];
				let translateArgs = null;
				sinon.stub(Zotero.Connector_Browser, 'getTabInfo').returns({
					instanceID: 'cross-library-instance',
					translators: [{translatorID: 'cross-library-translator', label: 'Embedded Metadata'}]
				});
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async options => {
					const method = typeof options === 'string' ? options : options.method;
					connectorCalls.push(method);
					return {targets: [
						{id: 'L1', name: 'My Library', level: 0},
						{id: 'C10', name: 'Test', level: 1},
						{id: 'L2', name: 'Group Library', level: 0},
						{id: 'C20', name: 'Shared', level: 1}
					]};
				});
				sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(async (name, args) => {
					if (name === 'translate') {
						translateArgs = args;
						return [{paperLoop: {
							status: 'existing',
							libraryID: 2,
							itemKey: 'GROUP001',
							noteKey: 'GROUPNOTE',
							doi: '10.1000/cross-library'
						}}];
					}
				});
				try {
					await browser.storage.local.set({
						'paperloop:link:v2:1:https://example.com/cross-library': {
							libraryID: 1,
							itemKey: 'LOCAL001',
							noteKey: 'LOCALNOTE',
							targetID: 'C10'
						}
					});
					const response = await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '群组文库中的独立思考',
						documentKey: 'https://example.com/cross-library',
						targetID: 'C20'
					}, tab, 0);
					const stored = await browser.storage.local.get(
						'paperloop:link:v2:2:https://example.com/cross-library'
					);
					return {response, connectorCalls, translateArgs, stored};
				}
				finally {
					Zotero.Connector_Browser.getTabInfo.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.equal(result.response.mode, 'save');
			assert.deepEqual(result.connectorCalls, ['getSelectedCollection']);
			assert.equal(result.translateArgs[2].paperLoop.targetID, 'C20');
			assert.equal(
				result.stored['paperloop:link:v2:2:https://example.com/cross-library'].itemKey,
				'GROUP001'
			);
		});

		it('lists Zotero collections and persists a validated save target', async function() {
			let result = await background(async function() {
				let tab = {id: 87009, url: 'https://example.com/reading'};
				let calls = [];
				sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
					calls.push({method: typeof options === 'string' ? options : options.method, data});
					return {
						libraryID: 1,
						libraryName: 'My Library',
						id: 10,
						targets: [
							{id: 'L1', name: 'My Library', level: 0},
							{id: 'C10', name: '生物', level: 1},
							{id: 'C11', name: '化学', level: 1}
						]
					};
				});
				try {
					await browser.storage.local.remove('paperloop:target:v1');
					let search = await Zotero.Connector_Browser.paperLoopGetCollections({query: '生物'}, tab, 0);
					let selected = await Zotero.Connector_Browser.paperLoopSetTarget({targetID: 'C10'}, tab, 0);
					let stored = await browser.storage.local.get('paperloop:target:v1');
					return {search, selected, stored, calls};
				}
				finally {
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.deepEqual(result.search.targets.map(target => target.name), ['生物']);
			assert.equal(result.search.targets[0].path, 'My Library / 生物');
			assert.equal(result.search.targets[0].libraryID, '1');
			assert.equal(result.selected.target.targetID, 'C10');
			assert.equal(result.stored['paperloop:target:v1'], 'C10');
			assert.deepEqual(result.calls.map(call => call.method), [
				'getSelectedCollection',
				'getSelectedCollection'
			]);
		});

		it('rejects saving after the tab has switched to another document', async function() {
			let message = await background(async function() {
				let tab = {id: 87004, url: 'https://example.com/new-paper'};
				try {
					await Zotero.Connector_Browser.paperLoopSaveThought({
						thought: '旧页面草稿',
						documentKey: 'https://example.com/old-paper'
					}, tab, 0);
				}
				catch (e) {
					return e.message;
				}
			});

			assert.include(message, '页面已切换');
		});

		it('preserves pin state across navigation and keeps tabs independent', async function() {
			let states = await background(async function() {
				let tabA = {id: 87005, url: 'https://example.com/paper-a-v2'};
				let tabB = {id: 87006, url: 'https://example.com/paper-b'};
				let infoA = Zotero.Connector_Browser.resetTabInfo(tabA.id);
				infoA.url = 'https://example.com/paper-a-v1';
				infoA.paperLoopPinned = true;
				await Zotero.Connector_Browser.paperLoopSetMinimized(true, tabA, 0);
				await Zotero.Connector_Browser.paperLoopSetPosition({left: 130, top: 40}, tabA, 0);
				let infoB = Zotero.Connector_Browser.resetTabInfo(tabB.id);
				infoB.url = tabB.url;
				infoB.paperLoopPinned = false;

				await Zotero.Connector_Browser.onPageLoad(tabA.url, tabA);
				let afterA = Zotero.Connector_Browser.getTabInfo(tabA.id);
				let afterB = Zotero.Connector_Browser.getTabInfo(tabB.id);
				return {
						a: {
						url: afterA.url,
						paperLoopPinned: afterA.paperLoopPinned,
						paperLoopMinimized: afterA.paperLoopMinimized,
						paperLoopPosition: afterA.paperLoopPosition && {
							left: afterA.paperLoopPosition.left,
							top: afterA.paperLoopPosition.top
						}
					},
					b: {
						url: afterB.url,
						paperLoopPinned: afterB.paperLoopPinned,
						paperLoopMinimized: afterB.paperLoopMinimized
					}
				};
			});

			assert.equal(states.a.url, 'https://example.com/paper-a-v2');
			assert.isTrue(states.a.paperLoopPinned);
			assert.isTrue(states.a.paperLoopMinimized);
			assert.deepEqual(states.a.paperLoopPosition, {left: 130, top: 40});
			assert.isFalse(states.b.paperLoopPinned);
			assert.isFalse(states.b.paperLoopMinimized);
		});
	});
});
