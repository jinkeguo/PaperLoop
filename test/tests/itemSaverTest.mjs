/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
					Vienna, Virginia, USA
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

import { Tab, background, getExtensionURL, delay } from '../support/utils.mjs';

describe("ItemSaver", function() {
	var tab = new Tab();

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'))
	});

	after(async function () {
		await tab.close();
	});

	describe('_executeSingleFile', function() {
		it('sets data.url to item.url when item has url defined', async function() {
			const testUrl = 'https://example.com/test-article';

			const capturedData = await tab.run(async function (testUrl) {
				try {
					const ItemSaver = Zotero.ItemSaver;
					let capturedData = null;

					// Stub the required functions
					sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("test content");
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async (options, data) => {
						capturedData = data;
					});

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
					});

					// Set up test data
					itemSaver._items = [{
						url: testUrl,
					}];
					itemSaver._snapshotAttachment = {
						title: 'Test Snapshot',
					};
					itemSaver._sessionID = 'test-session';

					await itemSaver._executeSingleFile(() => 0);

					return capturedData;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			}, testUrl);

			// Verify data.url is set to item.url
			assert.isNotNull(capturedData);
			assert.equal(capturedData.url, testUrl);
		});

		it('sets data.url to document.location.href when item has no url defined', async function() {
			const documentUrl = getExtensionURL('test/data/journalArticle-single.html');
			const capturedData = await tab.run(async function () {
				try {
					const ItemSaver = Zotero.ItemSaver;
					let capturedData = null;

					// Stub the required functions
					sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("test content");
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async (options, data) => {
						capturedData = data;
					});

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
					});

					// Set up test data
					itemSaver._items = [{
						// No url
					}];
					itemSaver._snapshotAttachment = {
						title: 'Test Snapshot',
					};
					itemSaver._sessionID = 'test-session';

					await itemSaver._executeSingleFile(() => 0);

					return capturedData;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			});

			// Verify data.url is set to document.location.href
			assert.isNotNull(capturedData);
			assert.equal(capturedData.url, documentUrl);
		});
	});

	describe('PaperLoop DOI resolution', function() {
		it('skips saveItems and attachment download when an existing DOI already has a PDF', async function() {
			const result = await tab.run(async function () {
				const item = {
					itemType: 'journalArticle',
					title: 'Existing paper',
					DOI: '10.1000/existing',
					notes: [{note: '<p>Thought</p>'}],
					attachments: [{
						title: 'Full Text PDF',
						mimeType: 'application/pdf',
						url: 'https://example.com/paper.pdf'
					}]
				};
				let saveItemsCalls = 0;
				let itemsDoneCalls = 0;
				let attachmentCalls = 0;
				try {
					sinon.stub(Zotero.Connector, 'getPref').resolves(true);
					sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (method, payload) => {
						if (method === 'paperloop/resolve') {
							return {
								items: [{
									id: payload.items[0].id,
									status: 'existing',
									libraryID: 1,
									itemKey: 'EXIST001',
									hasPDF: true,
									filesEditable: true
								}]
							};
						}
						if (method === 'saveItems') saveItemsCalls++;
						return {filesEditable: true};
					});

					const itemSaver = new Zotero.ItemSaver({
						sessionID: 'paperloop-existing',
						itemType: 'journalArticle',
						baseURI: document.location.href,
						paperLoop: {eventID: 'event-existing', note: '<p>Thought</p>'}
					});
					sinon.stub(itemSaver, 'saveAttachmentsToZotero').callsFake(async () => {
						attachmentCalls++;
					});
					const returned = await itemSaver.saveItems(
						[item],
						() => 0,
						() => itemsDoneCalls++
					);
					return {
						returnedLength: returned.length,
						saveItemsCalls,
						itemsDoneCalls,
						attachmentCalls
					};
				}
				finally {
					Zotero.Connector.getPref.restore();
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.deepEqual(result, {
				returnedLength: 1,
				saveItemsCalls: 0,
				itemsDoneCalls: 1,
				attachmentCalls: 0
			});
		});

		it('attaches one Translator PDF to an existing DOI item that has no usable PDF', async function() {
			const result = await tab.run(async function () {
				const item = {
					itemType: 'journalArticle',
					title: 'Existing paper without PDF',
					DOI: '10.1000/missing-pdf',
					notes: [],
					attachments: [
						{
							title: 'Full Text PDF',
							mimeType: 'application/pdf',
							url: 'https://example.com/full.pdf',
							isPrimary: true
						},
						{
							title: 'Supplement PDF',
							mimeType: 'application/pdf',
							url: 'https://example.com/supplement.pdf'
						}
					]
				};
				let saveItemsCalls = 0;
				const progress = [];
				try {
					sinon.stub(Zotero.Connector, 'getPref').resolves(true);
					sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (method, payload) => {
						if (method === 'paperloop/resolve') {
							return {
								libraryID: 1,
								items: [{
									id: payload.items[0].id,
									status: 'existing',
									itemKey: 'MISSPDF1',
									hasPDF: false,
									filesEditable: true
								}]
							};
						}
						if (method === 'saveItems') saveItemsCalls++;
						return {};
					});
					sinon.stub(Zotero.ItemSaver, 'saveExistingPDFToZotero').resolves({
						hasPDF: true,
						created: true,
						alreadyPresent: false,
						attachmentKey: 'PDFNEW01'
					});

					const itemSaver = new Zotero.ItemSaver({
						sessionID: 'paperloop-missing-pdf',
						itemType: 'journalArticle',
						baseURI: document.location.href,
						paperLoop: {eventID: 'event-missing-pdf', note: '<p>Updated thought</p>'}
					});
					const returned = await itemSaver.saveItems(
						[item],
						(attachment, value) => progress.push({url: attachment.url, value})
					);
					return {
						saveItemsCalls,
						pdfCalls: Zotero.ItemSaver.saveExistingPDFToZotero.callCount,
						pdfPayload: Zotero.ItemSaver.saveExistingPDFToZotero.firstCall.args[0],
						paperLoop: returned[0].paperLoop,
						progress
					};
				}
				finally {
					Zotero.Connector.getPref.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.ItemSaver.saveExistingPDFToZotero.restore();
				}
			});

			assert.equal(result.saveItemsCalls, 0);
			assert.equal(result.pdfCalls, 1);
			assert.equal(result.pdfPayload.url, 'https://example.com/full.pdf');
			assert.equal(result.pdfPayload.libraryID, 1);
			assert.equal(result.pdfPayload.itemKey, 'MISSPDF1');
			assert.equal(result.paperLoop.pdfAdded, true);
			assert.equal(result.paperLoop.pdfAttachmentKey, 'PDFNEW01');
			assert.deepEqual(result.progress.map(entry => entry.value), [0, 100]);
		});

		it('saves only unresolved items when a multi-item result is partially matched', async function() {
			const result = await tab.run(async function () {
				const existing = {
					itemType: 'journalArticle',
					title: 'Existing',
					DOI: '10.1000/existing',
					notes: [],
					attachments: []
				};
				const fresh = {
					itemType: 'journalArticle',
					title: 'Fresh',
					DOI: '10.1000/fresh',
					notes: [],
					attachments: []
				};
				let savedTitles = [];
				let updatedTarget = null;
				let resolvedTarget = null;
				let resolveCalls = 0;
				try {
					sinon.stub(Zotero.Connector, 'getPref').resolves(true);
					sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (method, payload) => {
						if (method === 'paperloop/resolve') {
							resolveCalls++;
							resolvedTarget = payload.targetID;
							return {
								items: payload.items.map(item => ({
									id: item.id,
									status: item.DOI === '10.1000/existing' || resolveCalls > 2
										? 'existing'
										: 'new',
									libraryID: 1,
									itemKey: item.DOI === '10.1000/existing' ? 'EXIST001' : 'FRESH001',
									noteKey: 'NOTE001'
								}))
							};
						}
						if (method === 'saveItems') {
							savedTitles = payload.items.map(item => item.title);
							return {};
						}
						if (method === 'updateSession') {
							updatedTarget = payload.target;
							return {};
						}
						if (method === 'getSelectedCollection') {
							return {filesEditable: false};
						}
					});
					sinon.stub(Zotero.Messaging, 'sendMessage').resolves();

					const itemSaver = new Zotero.ItemSaver({
						sessionID: 'paperloop-partial',
						itemType: 'multiple',
						baseURI: document.location.href,
						paperLoop: {eventID: 'event-partial', note: '<p>Fresh thought</p>', targetID: 'C10'}
					});
					const returned = await itemSaver.saveItems([existing, fresh], () => 0);
					return {
						savedTitles,
						resolvedTarget,
						updatedTarget,
						resolveCalls,
						returnedTitles: returned.map(item => item.title),
						freshLink: returned.find(item => item.title === 'Fresh').paperLoop
					};
				}
				finally {
					Zotero.Connector.getPref.restore();
					Zotero.Connector.callMethod.restore();
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.deepEqual(result.savedTitles, ['Fresh']);
			assert.equal(result.resolvedTarget, 'C10');
			assert.equal(result.updatedTarget, 'C10');
			assert.equal(result.resolveCalls, 3);
			assert.equal(result.freshLink.itemKey, 'FRESH001');
			assert.deepEqual(result.returnedTitles, ['Existing', 'Fresh']);
		});

		it('does not fall through to saveItems when the PaperLoop bridge is missing', async function() {
			const result = await tab.run(async function () {
				let saveItemsCalls = 0;
				try {
					sinon.stub(Zotero.Connector, 'getPref').resolves(true);
					sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (method) => {
						if (method === 'paperloop/resolve') {
							let error = new Error('404');
							error.status = 404;
							throw error;
						}
						if (method === 'saveItems') saveItemsCalls++;
					});

					const itemSaver = new Zotero.ItemSaver({
						sessionID: 'paperloop-no-bridge',
						itemType: 'journalArticle',
						baseURI: document.location.href,
						paperLoop: {eventID: 'event-no-bridge', note: ''}
					});
					try {
						await itemSaver.saveItems([{
							itemType: 'journalArticle',
							title: 'Do not duplicate',
							DOI: '10.1000/no-bridge',
							notes: [],
							attachments: []
						}], () => 0);
					}
					catch (e) {
						return {message: e.message, saveItemsCalls};
					}
					return {message: '', saveItemsCalls};
				}
				finally {
					Zotero.Connector.getPref.restore();
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.include(result.message, '已停止收藏以避免生成重复条目');
			assert.equal(result.saveItemsCalls, 0);
		});
	});
});
