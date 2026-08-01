import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./paperloop.js', import.meta.url), 'utf8');

function createHarness({
	items = [],
	notes = [],
	attachments = [],
	collections = [],
	beforeSave = async () => {},
	beforePDFImport = async () => {}
} = {}) {
	let savedNotes = [];
	let savedPDFs = [];
	let temporaryFiles = new Map();
	class Search {
		constructor() {
			this.conditions = [];
		}
		addCondition(field, operator, value) {
			this.conditions.push({field, operator, value: String(value || '')});
		}
		async search() {
			return items.filter(item => this.conditions.every(condition => {
				let field = condition.field === 'creator' ? 'firstCreator' : condition.field;
				let current = String(item.getField(field) || '').toLowerCase();
				let expected = condition.value.toLowerCase();
				return condition.operator === 'is'
					? current === expected
					: current.includes(expected);
			})).map(item => item.id);
		}
	}
	class Note {
		constructor() {
			this.key = `NOTE-${savedNotes.length + 1}`;
		}
		setNote(html) {
			this.html = html;
		}
		async saveTx() {
			await beforeSave(this);
			savedNotes.push(this);
		}
	}
	const context = {
		Blob,
		Uint8Array,
		atob(value) {
			return Buffer.from(String(value), 'base64').toString('binary');
		},
		OS: {
			Path: {join: (...parts) => parts.join('/')},
			File: {
				async writeAtomic(path, bytes) { temporaryFiles.set(path, bytes); },
				async remove(path) { temporaryFiles.delete(path); }
			}
		},
		Zotero: {
			Utilities: {
				randomString(length=8) { return 'R'.repeat(length); },
				cleanDOI(value) {
					const match = String(value).match(/10\.\d{4,9}\/\S+/i);
					return match ? match[0].replace(/[.,;]+$/, '') : null;
				}
			},
			Search,
			Items: {
				async getAsync(ids) {
					const all = [...items, ...notes, ...attachments, ...savedNotes, ...savedPDFs];
					return all.filter(item => ids.includes(item.id));
				},
				async getByLibraryAndKeyAsync(libraryID, key) {
					const all = [...items, ...notes, ...attachments, ...savedNotes, ...savedPDFs];
					return all.find(item => item.libraryID === libraryID && item.key === key) || null;
				}
			},
			Libraries: {
				get(libraryID) {
					return libraryID === 1
						? {libraryID: 1, name: 'My Library', editable: true, filesEditable: true, treeViewID: 'L1'}
						: null;
				},
				getAll() {
					return [{libraryID: 1, name: 'My Library', editable: true, filesEditable: true, treeViewID: 'L1'}];
				}
			},
			DB: {
				async executeTransaction(callback) {
					return callback();
				}
			},
			ItemTypes: {
				getName() { return 'journalArticle'; }
			},
			Item: Note,
			Notes: {AUTO_SYNC_DELAY: 1},
			getTempDirectory() {
				return {
					path: '/paperloop-temp',
					append(name) { this.path += `/${name}`; }
				};
			},
			getMainWindow() { return {Blob}; },
			File: {
				async putContentsAsync(path, blob) {
					temporaryFiles.set(path, blob);
				},
				async removeIfExists(path) {
					const existed = temporaryFiles.has(path);
					temporaryFiles.delete(path);
					return existed;
				}
			},
			Attachments: {
				async importFromFile(options) {
					await beforePDFImport(options);
					if (!temporaryFiles.has(options.file)) throw new Error('temporary PDF missing');
					const parent = items.find(item => item.id === options.parentItemID);
					if (!parent) throw new Error('parent missing');
					const attachment = pdfAttachment({
						id: 1000 + savedPDFs.length,
						key: `PDF-${savedPDFs.length + 1}`,
						parentID: parent.id
					});
					attachment.title = options.title;
					attachment.setField = (field, value) => { attachment[field] = value; };
					attachment.saveTx = async () => {};
					savedPDFs.push(attachment);
					parent._attachmentIDs.push(attachment.id);
					return attachment;
				}
			},
			Server: {
				Endpoints: {},
				Connector: {
					getSaveTarget() {
						return {
							library: {libraryID: 1, name: 'My Library', editable: true, filesEditable: true, treeViewID: 'L1'},
							collection: null,
							editable: true
						};
					},
					resolveTarget(targetID) {
						const library = {libraryID: 1, name: 'My Library', editable: true, filesEditable: true, treeViewID: 'L1'};
						if (targetID === 'L1') return {library, collection: null, editable: true};
						const collection = collections.find(value => value.treeViewID === targetID);
						if (!collection) throw new Error('target not found');
						return {library, collection, editable: true};
					}
				}
			}
		}
	};
	vm.createContext(context);
	vm.runInContext(source, context);
	return {
		bridge: context.PaperLoopDOIBridge,
		savedNotes,
		savedPDFs,
		temporaryFiles,
		endpoints: context.Zotero.Server.Endpoints
	};
}

function zoteroCollection({id, key, name, itemIDs = []}) {
	const members = new Set(itemIDs);
	return {
		id,
		key,
		name,
		libraryID: 1,
		treeViewID: `C${id}`,
		members,
		async loadDataType() {},
		hasItem(itemID) { return members.has(itemID); },
		async addItem(itemID) { members.add(itemID); },
		async removeItem(itemID) { members.delete(itemID); }
	};
}

async function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return {promise, resolve, reject};
}

function regularItem({
	id,
	key,
	DOI,
	dateAdded,
	dateModified = '',
	title = '',
	creator = '',
	date = '',
	noteIDs = [],
	attachmentIDs = [],
	deleted = false
}) {
	const item = {
		id,
		key,
		dateAdded,
		dateModified,
		itemTypeID: 1,
		libraryID: 1,
		deleted,
		isRegularItem: () => true,
		getField: field => ({DOI, title, firstCreator: creator, date}[field] || ''),
		getNotes: () => noteIDs,
		_attachmentIDs: [...attachmentIDs],
		getAttachments() { return [...this._attachmentIDs]; }
	};
	return item;
}

function pdfAttachment({id, key, parentID, exists = true, deleted = false}) {
	return {
		id,
		key,
		parentID,
		libraryID: 1,
		deleted,
		attachmentContentType: 'application/pdf',
		getFilename: () => 'paper.pdf',
		async fileExists() { return exists; }
	};
}

{
	const newer = regularItem({
		id: 2,
		key: 'NEWER',
		DOI: '10.1000/ABC',
		dateAdded: '2025-01-01'
	});
	const older = regularItem({
		id: 1,
		key: 'OLDER',
		DOI: 'https://doi.org/10.1000/abc',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedNotes} = createHarness({items: [newer, older]});
	const response = await bridge.Endpoint.prototype.init({
		data: {
			eventID: 'event-1',
			note: '<p>My thought</p>',
			items: [{id: 'incoming', DOI: '10.1000/abc'}]
		}
	});
	const body = JSON.parse(response[2]);
	assert.equal(response[0], 200);
	assert.equal(body.items[0].status, 'existing');
	assert.equal(body.items[0].itemKey, 'OLDER');
	assert.equal(body.items[0].duplicateCount, 2);
	assert.equal(savedNotes.length, 1);
	assert.match(savedNotes[0].html, /paperloop-event:event-1/);
}

{
	const existingNote = {
		id: 9,
		key: 'NOTE-EXISTING',
		getNote: () => '<!-- paperloop-event:event-2 --><p>Already saved</p>'
	};
	const parent = regularItem({
		id: 1,
		key: 'PARENT',
		DOI: '10.1000/retry',
		dateAdded: '2024-01-01',
		noteIDs: [9]
	});
	const {bridge, savedNotes} = createHarness({items: [parent], notes: [existingNote]});
	const response = await bridge.Endpoint.prototype.init({
		data: {
			eventID: 'event-2',
			note: '<p>Retry</p>',
			items: [{id: 'incoming', DOI: '10.1000/retry'}]
		}
	});
	const body = JSON.parse(response[2]);
	assert.equal(body.items[0].repeatedEvent, true);
	assert.equal(body.items[0].noteKey, 'NOTE-EXISTING');
	assert.equal(savedNotes.length, 0);
}

{
	let html = '<!-- paperloop-event:old-event --><h1>PaperLoop 思考</h1><p>旧思考</p>';
	let saveCount = 0;
	const canonicalNote = {
		id: 13,
		key: 'NOTE-CANONICAL',
		dateAdded: '2024-01-02',
		getNote: () => html,
		setNote: value => { html = value; },
		async saveTx() { saveCount++; }
	};
	const parent = regularItem({
		id: 14,
		key: 'UPSERT01',
		DOI: '10.1000/upsert',
		dateAdded: '2024-01-01',
		noteIDs: [13]
	});
	const {bridge} = createHarness({items: [parent], notes: [canonicalNote]});
	const updated = await bridge.upsertNote(
		parent,
		'<h1>PaperLoop 思考</h1><p>补充后的完整思考</p>',
		'new-event'
	);
	const repeated = await bridge.upsertNote(
		parent,
		'<h1>PaperLoop 思考</h1><p>补充后的完整思考</p>',
		'another-event'
	);
	assert.equal(updated.noteKey, 'NOTE-CANONICAL');
	assert.equal(updated.updated, true);
	assert.equal(repeated.noteKey, 'NOTE-CANONICAL');
	assert.equal(repeated.repeatedContent, true);
	assert.equal(saveCount, 1);
	assert.match(html, /补充后的完整思考/);
}

{
	const existingNote = {
		id: 10,
		key: 'NOTE-SAME-CONTENT',
		getNote: () => '<!-- paperloop-event:older-event --><p>Same thought</p>'
	};
	const parent = regularItem({
		id: 1,
		key: 'PARENT',
		DOI: '10.1000/repeated-content',
		dateAdded: '2024-01-01',
		noteIDs: [10]
	});
	const {bridge, savedNotes} = createHarness({items: [parent], notes: [existingNote]});
	const response = await bridge.Endpoint.prototype.init({
		data: {
			eventID: 'new-click-event',
			note: '<p>Same thought</p>',
			items: [{id: 'incoming', DOI: '10.1000/repeated-content'}]
		}
	});
	const body = JSON.parse(response[2]);
	assert.equal(body.items[0].repeatedEvent, false);
	assert.equal(body.items[0].repeatedContent, true);
	assert.equal(body.items[0].noteKey, 'NOTE-SAME-CONTENT');
	assert.equal(savedNotes.length, 0);
}

{
	const {bridge, savedNotes} = createHarness();
	const response = await bridge.Endpoint.prototype.init({
		data: {
			eventID: 'event-3',
			note: '<p>New</p>',
			items: [{id: 'incoming', DOI: '10.1000/new'}]
		}
	});
	const body = JSON.parse(response[2]);
	assert.equal(body.items[0].status, 'new');
	assert.equal(savedNotes.length, 0);
}

{
	const parent = regularItem({
		id: 21,
		key: 'BIOITEM1',
		DOI: '10.1000/biology',
		dateAdded: '2024-01-01'
	});
	const biology = zoteroCollection({id: 10, key: 'BIOLOGY1', name: '生物'});
	const {bridge, savedNotes} = createHarness({items: [parent], collections: [biology]});
	const request = {
		data: {
			targetID: 'C10',
			eventID: 'biology-save',
			note: '',
			items: [{id: 'incoming-bio', DOI: '10.1000/biology'}]
		}
	};
	const first = JSON.parse((await bridge.Endpoint.prototype.init(request))[2]);
	const second = JSON.parse((await bridge.Endpoint.prototype.init(request))[2]);
	assert.equal(first.items[0].collectionAdded, true);
	assert.equal(first.items[0].collectionName, '生物');
	assert.equal(second.items[0].collectionAlreadyPresent, true);
	assert.equal(biology.members.size, 1);
	assert.equal(savedNotes.length, 0);
}

{
	const saveStarted = await deferred();
	const allowSave = await deferred();
	const parent = regularItem({
		id: 1,
		key: 'PARENT-CONCURRENT-EVENT',
		DOI: '10.1000/concurrent-event',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedNotes} = createHarness({
		items: [parent],
		beforeSave: async () => {
			saveStarted.resolve();
			await allowSave.promise;
		}
	});
	const first = bridge.appendNote(parent, '<p>Concurrent thought</p>', 'same-event');
	await saveStarted.promise;
	const second = bridge.appendNote(parent, '<p>Concurrent thought</p>', 'same-event');
	allowSave.resolve();
	const [firstResult, secondResult] = await Promise.all([first, second]);
	assert.equal(savedNotes.length, 1);
	assert.equal(firstResult.inFlightReuse, false);
	assert.equal(secondResult.inFlightReuse, true);
	assert.equal(secondResult.repeatedEvent, true);
	assert.equal(bridge.pendingNotes.size, 0);
}

{
	const saveStarted = await deferred();
	const allowSave = await deferred();
	const parent = regularItem({
		id: 2,
		key: 'PARENT-CONCURRENT-CONTENT',
		DOI: '10.1000/concurrent-content',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedNotes} = createHarness({
		items: [parent],
		beforeSave: async () => {
			saveStarted.resolve();
			await allowSave.promise;
		}
	});
	const note = '<p>Same content, different clicks</p>';
	const first = bridge.appendNote(parent, note, 'event-a');
	await saveStarted.promise;
	const second = bridge.appendNote(parent, note, 'event-b');
	allowSave.resolve();
	const [, secondResult] = await Promise.all([first, second]);
	assert.equal(savedNotes.length, 1);
	assert.equal(secondResult.inFlightReuse, true);
	assert.equal(secondResult.repeatedContent, true);
	assert.equal(bridge.pendingNotes.size, 0);
}

{
	let shouldFail = true;
	const parent = regularItem({
		id: 3,
		key: 'PARENT-RETRY',
		DOI: '10.1000/retry-after-failure',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedNotes} = createHarness({
		items: [parent],
		beforeSave: async () => {
			if (shouldFail) {
				shouldFail = false;
				throw new Error('simulated save failure');
			}
		}
	});
	await assert.rejects(() => bridge.appendNote(parent, '<p>Retry me</p>', 'retry-event'));
	assert.equal(bridge.pendingNotes.size, 0);
	const retry = await bridge.appendNote(parent, '<p>Retry me</p>', 'retry-event');
	assert.equal(savedNotes.length, 1);
	assert.equal(retry.inFlightReuse, false);
	assert.equal(bridge.pendingNotes.size, 0);
}

{
	const parent = regularItem({
		id: 4,
		key: 'APPEND01',
		DOI: '10.1000/append-endpoint',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedNotes, endpoints} = createHarness({items: [parent]});
	bridge.register();
	assert.equal(endpoints['/connector/paperloop/resolve'], bridge.Endpoint);
	assert.equal(endpoints['/connector/paperloop/append-note'], bridge.AppendNoteEndpoint);
	assert.equal(endpoints['/connector/paperloop/search-items'], bridge.SearchItemsEndpoint);
	assert.equal(endpoints['/connector/paperloop/state'], bridge.StateEndpoint);
	assert.equal(endpoints['/connector/paperloop/add-pdf'], bridge.AddPDFEndpoint);
	const response = await bridge.AppendNoteEndpoint.prototype.init({
		data: {
			libraryID: 1,
			itemKey: 'append01',
			eventID: 'app-event-1',
			note: '<h1>PaperLoop thought</h1><p>Direct local note</p>'
		}
	});
	const body = JSON.parse(response[2]);
	assert.equal(response[0], 200);
	assert.equal(body.itemKey, 'APPEND01');
	assert.equal(body.noteKey, 'NOTE-1');
	assert.equal(savedNotes.length, 1);
	assert.equal(savedNotes[0].parentItemID, 4);
	assert.match(savedNotes[0].html, /paperloop-event:app-event-1/);
	bridge.unregister();
	assert.equal(endpoints['/connector/paperloop/resolve'], undefined);
	assert.equal(endpoints['/connector/paperloop/append-note'], undefined);
	assert.equal(endpoints['/connector/paperloop/search-items'], undefined);
	assert.equal(endpoints['/connector/paperloop/state'], undefined);
	assert.equal(endpoints['/connector/paperloop/add-pdf'], undefined);
}

{
	const editedNote = {
		id: 41,
		key: 'NOTE-EDITED',
		dateAdded: '2024-01-02',
		dateModified: '2026-08-01 07:31:34',
		getNote: () => '<!-- paperloop-event:old --><h1>PaperLoop 思考</h1><p>Zotero 手工更新<br>第二行</p>'
	};
	const deletedParent = regularItem({
		id: 40,
		key: 'DELETED1',
		DOI: '10.1000/deleted',
		dateAdded: '2024-01-01',
		dateModified: '2026-08-01 07:00:00',
		noteIDs: [41],
		deleted: true
	});
	const liveParent = regularItem({
		id: 42,
		key: 'LIVE0001',
		DOI: '10.1000/live',
		dateAdded: '2024-01-01'
	});
	const {bridge} = createHarness({items: [deletedParent, liveParent], notes: [editedNote]});
	const deletedResponse = await bridge.StateEndpoint.prototype.init({
		data: {libraryID: 1, itemKey: 'deleted1', doi: '10.1000/deleted'}
	});
	const deletedBody = JSON.parse(deletedResponse[2]);
	assert.equal(deletedResponse[0], 200);
	assert.equal(deletedBody.status, 'deleted');
	assert.equal(deletedBody.noteKey, 'NOTE-EDITED');
	assert.equal(deletedBody.noteModified, '2026-08-01 07:31:34');
	assert.equal(deletedBody.thought, 'Zotero 手工更新\n第二行');

	const cachelessResponse = await bridge.StateEndpoint.prototype.init({
		data: {libraryID: 1, doi: '10.1000/live'}
	});
	const cachelessBody = JSON.parse(cachelessResponse[2]);
	assert.equal(cachelessBody.status, 'existing');
	assert.equal(cachelessBody.itemKey, 'LIVE0001');
	assert.equal(cachelessBody.noteKey, null);
	assert.equal(cachelessBody.thought, '');
}

{
	const older = regularItem({
		id: 11,
		key: 'ITEMOLD1',
		DOI: '10.1000/older',
		dateAdded: '2024-01-01',
		dateModified: '2024-02-01',
		title: 'Older Paper',
		creator: 'A. Author',
		date: '2024'
	});
	const newer = regularItem({
		id: 12,
		key: 'ITEMNEW1',
		DOI: '10.1000/newer',
		dateAdded: '2025-01-01',
		dateModified: '2025-02-01',
		title: 'Newer Paper',
		creator: 'B. Author',
		date: '2025-06-01'
	});
	const {bridge} = createHarness({items: [older, newer]});
	const response = await bridge.SearchItemsEndpoint.prototype.init({
		data: {query: 'Paper', limit: 20}
	});
	const body = JSON.parse(response[2]);
	assert.equal(response[0], 200);
	assert.equal(body.version, '0.1.19');
	assert.deepEqual(body.items.map(item => item.itemKey), ['ITEMNEW1', 'ITEMOLD1']);
	assert.equal(body.items[0].title, 'Newer Paper');
	assert.equal(body.items[0].creator, 'B. Author');
	assert.equal(body.items[0].year, '2025');
	assert.equal(body.items[0].doi, '10.1000/newer');
	const doiResponse = await bridge.SearchItemsEndpoint.prototype.init({
		data: {query: 'https://doi.org/10.1000/older', limit: 20}
	});
	const doiBody = JSON.parse(doiResponse[2]);
	assert.deepEqual(doiBody.items.map(item => item.itemKey), ['ITEMOLD1']);
}

{
	const parent = regularItem({
		id: 31,
		key: 'MOVE0001',
		DOI: '10.1000/move',
		dateAdded: '2024-01-01'
	});
	const biology = zoteroCollection({id: 20, key: 'BIOLOGY2', name: '生物', itemIDs: [31]});
	const chemistry = zoteroCollection({id: 21, key: 'CHEM0001', name: '化学'});
	const manual = zoteroCollection({id: 22, key: 'MANUAL01', name: '手工保留', itemIDs: [31]});
	const {bridge} = createHarness({items: [parent], collections: [biology, chemistry, manual]});
	const response = await bridge.AppendNoteEndpoint.prototype.init({
		data: {
			libraryID: 1,
			itemKey: 'MOVE0001',
			eventID: 'multi-collection-event-1',
			note: '',
			mode: 'upsert',
			targetID: 'C21',
			previousTargetID: 'C20'
		}
	});
	const body = JSON.parse(response[2]);
	assert.equal(response[0], 200);
	assert.equal(body.collectionAdded, true);
	assert.equal(body.classifiedOnly, true);
	assert.equal(body.noteKey, null);
	assert.equal(body.previousCollectionRemoved, undefined);
	assert.equal(biology.hasItem(31), true);
	assert.equal(chemistry.hasItem(31), true);
	assert.equal(manual.hasItem(31), true);
}

{
	const existingPDF = pdfAttachment({id: 71, key: 'PDF-EXISTING', parentID: 70});
	const parent = regularItem({
		id: 70,
		key: 'HASPDF01',
		DOI: '10.1000/has-pdf',
		dateAdded: '2024-01-01',
		attachmentIDs: [71]
	});
	const {bridge, savedPDFs} = createHarness({items: [parent], attachments: [existingPDF]});
	const state = JSON.parse((await bridge.StateEndpoint.prototype.init({
		data: {libraryID: 1, itemKey: 'HASPDF01'}
	}))[2]);
	assert.equal(state.hasPDF, true);
	assert.equal(state.pdfAttachmentKey, 'PDF-EXISTING');
	const resolve = JSON.parse((await bridge.Endpoint.prototype.init({
		data: {
			eventID: 'has-pdf-resolve',
			note: '',
			items: [{id: 'incoming-has-pdf', DOI: '10.1000/has-pdf'}]
		}
	}))[2]);
	assert.equal(resolve.items[0].hasPDF, true);
	assert.equal(resolve.items[0].libraryID, 1);
	assert.equal(resolve.items[0].filesEditable, true);
	const add = JSON.parse((await bridge.AddPDFEndpoint.prototype.init({
		data: {
			libraryID: 1,
			itemKey: 'HASPDF01',
			base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64')
		}
	}))[2]);
	assert.equal(add.created, false);
	assert.equal(add.alreadyPresent, true);
	assert.equal(add.attachmentKey, 'PDF-EXISTING');
	assert.equal(savedPDFs.length, 0);
}

{
	const parent = regularItem({
		id: 80,
		key: 'MISSPDF1',
		DOI: '10.1000/missing-pdf',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedPDFs, temporaryFiles} = createHarness({items: [parent]});
	const request = {
		data: {
			libraryID: 1,
			itemKey: 'MISSPDF1',
			title: 'Authenticated Full Text PDF',
			url: 'https://example.com/paper.pdf',
			base64: Buffer.from('%PDF-1.7\nPaperLoop\n%%EOF').toString('base64')
		}
	};
	const firstResponse = await bridge.AddPDFEndpoint.prototype.init(request);
	const first = JSON.parse(firstResponse[2]);
	assert.equal(firstResponse[0], 200);
	assert.equal(first.created, true);
	assert.equal(first.hasPDF, true);
	assert.equal(first.attachmentKey, 'PDF-1');
	assert.equal(savedPDFs.length, 1);
	assert.equal(savedPDFs[0].title, 'Authenticated Full Text PDF');
	assert.equal(savedPDFs[0].url, 'https://example.com/paper.pdf');
	assert.equal(temporaryFiles.size, 0);
	const second = JSON.parse((await bridge.AddPDFEndpoint.prototype.init(request))[2]);
	assert.equal(second.created, false);
	assert.equal(second.alreadyPresent, true);
	assert.equal(second.attachmentKey, 'PDF-1');
	assert.equal(savedPDFs.length, 1);
}

{
	const parent = regularItem({
		id: 90,
		key: 'BADPDF01',
		DOI: '10.1000/bad-pdf',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedPDFs, temporaryFiles} = createHarness({items: [parent]});
	const response = await bridge.AddPDFEndpoint.prototype.init({
		data: {
			libraryID: 1,
			itemKey: 'BADPDF01',
			base64: Buffer.from('<html>not a PDF</html>').toString('base64')
		}
	});
	assert.equal(response[0], 400);
	assert.equal(JSON.parse(response[2]).error, 'INVALID_PDF_DATA');
	assert.equal(savedPDFs.length, 0);
	assert.equal(temporaryFiles.size, 0);
}

{
	const importStarted = await deferred();
	const allowImport = await deferred();
	const parent = regularItem({
		id: 100,
		key: 'RACEPDF1',
		DOI: '10.1000/race-pdf',
		dateAdded: '2024-01-01'
	});
	const {bridge, savedPDFs} = createHarness({
		items: [parent],
		beforePDFImport: async () => {
			importStarted.resolve();
			await allowImport.promise;
		}
	});
	const request = {
		data: {
			libraryID: 1,
			itemKey: 'RACEPDF1',
			base64: Buffer.from('%PDF-1.7\nConcurrent\n%%EOF').toString('base64')
		}
	};
	const firstPromise = bridge.AddPDFEndpoint.prototype.init(request);
	await importStarted.promise;
	const secondPromise = bridge.AddPDFEndpoint.prototype.init(request);
	allowImport.resolve();
	const [firstResponse, secondResponse] = await Promise.all([firstPromise, secondPromise]);
	const first = JSON.parse(firstResponse[2]);
	const second = JSON.parse(secondResponse[2]);
	assert.equal(first.created, true);
	assert.equal(second.alreadyPresent, true);
	assert.equal(first.attachmentKey, second.attachmentKey);
	assert.equal(savedPDFs.length, 1);
	assert.equal(bridge.pendingPDFs.size, 0);
}

console.log('PaperLoop DOI Bridge tests passed');
