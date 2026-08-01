import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Tab, delay } from '../support/utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotPath = path.resolve(
	__dirname,
	'../../../../demo/paperloop_sidebar.png'
);

describe('PaperLoop persistent reading sidebar', function() {
	let tab = new Tab();

	before(async function() {
		await tab.init();
		await tab.page.setViewport({width: 1280, height: 800});
	});

	after(async function() {
		await tab.close();
	});

	it('keeps the host article scrollable and restores per-document drafts', async function() {
		this.timeout(20000);
		const initial = await tab.run(async function() {
			document.body.innerHTML = `
				<main style="width:760px;margin:0 auto;font:18px/1.8 serif">
					<h1>A realistic long research article</h1>
					${'<p>Long article paragraph used to verify that PaperLoop never locks host-page scrolling.</p>'.repeat(80)}
				</main>`;
			const before = {
				htmlOverflow: document.documentElement.style.overflow,
				bodyOverflow: document.body.style.overflow
			};
			await Zotero.PaperLoopSidebar.show({
				open: true,
				documentKey: 'https://example.com/paper-a',
				title: 'A realistic long research article',
				canSave: true,
				translatorLabel: 'Embedded Metadata',
				selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
			});
			return {
				before,
				viewportWidth: document.documentElement.clientWidth,
				after: Zotero.PaperLoopSidebar.debugState()
			};
		});

		assert.approximately(initial.after.width, 420, 2);
		assert.approximately(initial.after.height, 760, 2);
		assert.approximately(initial.after.right, initial.viewportWidth - 12, 2);
		assert.equal(initial.after.htmlOverflow, initial.before.htmlOverflow);
		assert.equal(initial.after.bodyOverflow, initial.before.bodyOverflow);

		await tab.page.evaluate(() => window.scrollTo(0, 1000));
		await delay(100);
		const scrollY = await tab.page.evaluate(() => window.scrollY);
		assert.isAbove(scrollY, 500, 'host article must remain scrollable');

		await tab.run(function() {
			Zotero.PaperLoopSidebar.debugSetThought(
				'该方法可用于讨论部分。\n与基线模型比较时需注意样本偏差。'
			);
			return true;
		});
		await delay(400);
		const closed = await tab.run(function() {
			Zotero.PaperLoopSidebar.debugClickClose();
			return Zotero.PaperLoopSidebar.status();
		});
		assert.isFalse(closed.open, 'the visible close button must remove the sidebar');
		await tab.run(function() {
			return Zotero.PaperLoopSidebar.show({
				open: true,
				documentKey: 'https://example.com/paper-a',
				title: 'A realistic long research article',
				canSave: true,
				translatorLabel: 'Embedded Metadata',
				selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
			});
		});
		const restored = await tab.run(function() {
			return Zotero.PaperLoopSidebar.debugState();
		});
		assert.include(restored.thought, '样本偏差');
		await fs.mkdir(path.dirname(screenshotPath), {recursive: true});
		await tab.page.screenshot({path: screenshotPath});

		await tab.run(function() {
			return Zotero.PaperLoopSidebar.show({
				open: true,
				documentKey: 'https://example.com/paper-b',
				title: 'A different paper',
				canSave: false,
				translatorLabel: '',
				selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
			});
		});
		const switched = await tab.run(function() {
			return Zotero.PaperLoopSidebar.debugState();
		});
		assert.equal(switched.documentKey, 'https://example.com/paper-b');
		assert.equal(switched.thought, '');
		assert.isFalse(switched.canSave);
	});

	it('drags within the viewport and resets safely to the right edge', async function() {
		const moved = await tab.run(async function() {
			await Zotero.PaperLoopSidebar.show({
				open: true,
				documentKey: 'https://example.com/draggable-paper',
				title: 'Draggable PaperLoop panel',
				canSave: true,
				translatorLabel: 'Embedded Metadata',
				selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
			});
			const before = Zotero.PaperLoopSidebar.debugState();
			Zotero.PaperLoopSidebar.debugDragBy(-300, 200);
			await new Promise(resolve => setTimeout(resolve, 30));
			return {before, after: Zotero.PaperLoopSidebar.debugState()};
		});
		assert.isBelow(moved.after.left, moved.before.left - 250);
		assert.equal(moved.after.top, 40, 'vertical drag must clamp to the viewport');

		const reset = await tab.run(async function() {
			Zotero.PaperLoopSidebar.debugResetPosition();
			await new Promise(resolve => setTimeout(resolve, 30));
			return {
				state: Zotero.PaperLoopSidebar.debugState(),
				viewportWidth: document.documentElement.clientWidth
			};
		});
		assert.approximately(reset.state.right, reset.viewportWidth - 12, 2);
		assert.approximately(reset.state.top, 12, 2);
	});

	it('minimizes to a right-edge tab and restores without the browser toolbar', async function() {
		const states = await tab.run(async function() {
			const original = Zotero.Connector_Browser.paperLoopGetDocumentState;
			Zotero.Connector_Browser.paperLoopGetDocumentState = async () => null;
			try {
				await Zotero.PaperLoopSidebar.show({
					open: true,
					documentKey: 'https://example.com/minimize-paper',
					title: 'Minimize Paper',
					canSave: true,
					translatorLabel: 'Embedded Metadata',
					selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
				});
				Zotero.PaperLoopSidebar.debugClickMinimize();
				await new Promise(resolve => setTimeout(resolve, 30));
				const minimized = Zotero.PaperLoopSidebar.debugState();
				Zotero.PaperLoopSidebar.debugClickMiniTab();
				await new Promise(resolve => setTimeout(resolve, 30));
				return {minimized, restored: Zotero.PaperLoopSidebar.debugState()};
			}
			finally {
				Zotero.Connector_Browser.paperLoopGetDocumentState = original;
			}
		});
		assert.isTrue(states.minimized.minimized);
		assert.approximately(states.minimized.width, 36, 2);
		assert.approximately(states.minimized.height, 72, 2);
		assert.isFalse(states.restored.minimized);
		assert.approximately(states.restored.width, 420, 2);
	});

	it('syncs newer Zotero notes and preserves both sides on a legacy draft conflict', async function() {
		const result = await tab.run(async function() {
			const original = Zotero.Connector_Browser.paperLoopGetDocumentState;
			let remoteThought = 'Zotero 思考 A';
			let remoteModified = '2026-08-01 08:00:00';
			Zotero.Connector_Browser.paperLoopGetDocumentState = async () => ({
				ok: true,
				status: 'existing',
				itemKey: 'REMOTE01',
				noteKey: 'REMOTEN1',
				noteModified: remoteModified,
				thought: remoteThought
			});
			try {
				const documentKey = 'https://example.com/remote-sync';
				await browser.storage.local.remove([
					`paperloop:draft:v1:${documentKey}`,
					`paperloop:sync:v1:${documentKey}`
				]);
				await Zotero.PaperLoopSidebar.show({
					open: true,
					documentKey,
					title: 'Remote Sync',
					canSave: true,
					translatorLabel: 'Embedded Metadata',
					selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
				});
				const first = Zotero.PaperLoopSidebar.debugState();
				remoteThought = 'Zotero 思考 B（桌面端已修改）';
				remoteModified = '2026-08-01 08:05:00';
				await Zotero.PaperLoopSidebar.debugRefreshZotero();
				const autoUpdated = Zotero.PaperLoopSidebar.debugState();

				const legacyKey = 'https://example.com/legacy-conflict';
				await browser.storage.local.set({
					[`paperloop:draft:v1:${legacyKey}`]: '浏览器本地未确认草稿'
				});
				await browser.storage.local.remove(`paperloop:sync:v1:${legacyKey}`);
				await Zotero.PaperLoopSidebar.show({
					open: true,
					documentKey: legacyKey,
					title: 'Legacy Conflict',
					canSave: true,
					translatorLabel: 'Embedded Metadata',
					selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
				});
				const conflict = Zotero.PaperLoopSidebar.debugState();
				Zotero.PaperLoopSidebar.debugLoadRemote();
				await new Promise(resolve => setTimeout(resolve, 30));
				return {
					first,
					autoUpdated,
					conflict,
					loaded: Zotero.PaperLoopSidebar.debugState()
				};
			}
			finally {
				Zotero.Connector_Browser.paperLoopGetDocumentState = original;
			}
		});
		assert.equal(result.first.thought, 'Zotero 思考 A');
		assert.equal(result.autoUpdated.thought, 'Zotero 思考 B（桌面端已修改）');
		assert.equal(result.conflict.thought, '浏览器本地未确认草稿');
		assert.isTrue(result.conflict.remoteConflict);
		assert.isTrue(result.conflict.remoteLoadVisible);
		assert.equal(result.loaded.thought, 'Zotero 思考 B（桌面端已修改）');
		assert.isFalse(result.loaded.remoteConflict);
	});

	it('shows Zotero collection selection and auto-open controls inline', async function() {
		await tab.run(function() {
			return Zotero.PaperLoopSidebar.show({
				open: true,
				documentKey: 'https://example.com/paper-picker',
				title: 'Page not recognized by a translator',
				canSave: false,
				autoOpen: true,
				selectedTarget: {
					targetID: 'C11',
					name: '化学',
					path: '我的文库 / 化学',
					type: 'collection'
				}
			});
		});
		const selected = await tab.run(function() {
			Zotero.PaperLoopSidebar.debugSetThought('保存到化学分类的思考');
			return Zotero.PaperLoopSidebar.debugState();
		});
		assert.equal(selected.selectedTargetID, 'C11');
		assert.equal(selected.selectedTargetPath, '我的文库 / 化学');
		assert.isTrue(selected.autoOpen);
	});

	it('routes a real visible Save-button click to the sidebar controller', async function() {
		const result = await tab.run(async function() {
			const original = Zotero.Connector_Browser.paperLoopSaveThought;
			let payload = null;
			Zotero.Connector_Browser.paperLoopSaveThought = async data => {
				payload = data;
				return {ok: true, mode: 'save'};
			};
			try {
				await Zotero.PaperLoopSidebar.show({
					open: true,
					documentKey: 'https://example.com/button-click',
					title: 'Button click paper',
					canSave: true,
					translatorLabel: 'Embedded Metadata',
					selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
				});
				Zotero.PaperLoopSidebar.debugSetThought('真实按钮点击');
				Zotero.PaperLoopSidebar.debugClickSave();
				await new Promise(resolve => setTimeout(resolve, 30));
				return {payload, state: Zotero.PaperLoopSidebar.debugState()};
			}
			finally {
				Zotero.Connector_Browser.paperLoopSaveThought = original;
			}
		});
		assert.equal(result.payload.targetID, 'C10');
		assert.equal(result.payload.thought, '真实按钮点击');
		assert.include(result.state.status, '已写入');
		assert.include(result.state.status, '生物');
		assert.equal(result.state.status.includes('已识别'), false,
			'terminal save feedback must not be overwritten by generic ready state');
	});

	it('reports that a missing PDF was attached while preserving thought-sync success', async function() {
		const result = await tab.run(async function() {
			const originalSave = Zotero.Connector_Browser.paperLoopSaveThought;
			Zotero.Connector_Browser.paperLoopSaveThought = async () => ({
				ok: true,
				mode: 'sync',
				updated: true,
				pdfAdded: true,
				pdfAttachmentKey: 'PDF-NEW-1'
			});
			try {
				await Zotero.PaperLoopSidebar.show({
					open: true,
					documentKey: 'https://example.com/pdf-backfill',
					title: 'PDF backfill paper',
					canSave: true,
					translatorLabel: 'Embedded Metadata',
					selectedTarget: {targetID: 'C10', name: '生物', path: '我的文库 / 生物', type: 'collection'}
				});
				Zotero.PaperLoopSidebar.debugSetThought('再次同步并补充 PDF');
				Zotero.PaperLoopSidebar.debugClickSave();
				await new Promise(resolve => setTimeout(resolve, 30));
				return Zotero.PaperLoopSidebar.debugState();
			}
			finally {
				Zotero.Connector_Browser.paperLoopSaveThought = originalSave;
			}
		});
		assert.include(result.status, '思考已同步');
		assert.include(result.status, '补充 PDF');
	});

	it('preserves the nested PaperLoop thought through PageSaving into ItemSaver', async function() {
		const captured = await tab.run(async function() {
			const originalDetails = Zotero.PageSaving.sessionDetails;
			const originalInitTranslate = Zotero.PageSaving._initTranslate;
			const originalTranslate = Zotero.TranslateWeb.translate;
			const OriginalItemSaver = Zotero.ItemSaver;
			let saverOptions = null;
			try {
				Zotero.PageSaving.sessionDetails = {
					id: 'paperloop-note-propagation',
					saveOptions: {
						paperLoop: {
							eventID: 'paperloop-note-event',
							targetID: 'C10',
							note: '<h1>PaperLoop 思考</h1><p>必须保留的嵌套思考</p>'
						}
					}
				};
				Zotero.PageSaving._initTranslate = async () => ({getProxy: async () => null});
				Zotero.TranslateWeb.translate = async () => ({
					items: [{
						id: 'paperloop-note-item',
						itemType: 'journalArticle',
						title: 'Nested note propagation',
						attachments: []
					}],
					proxy: null
				});
				Zotero.ItemSaver = function(options) {
					saverOptions = options;
					this.saveItems = async items => items;
				};
				await Zotero.PageSaving.translateAndSave([{
					itemType: 'journalArticle',
					label: 'Embedded Metadata'
				}]);
				return saverOptions && saverOptions.paperLoop;
			}
			finally {
				Zotero.PageSaving.sessionDetails = originalDetails;
				Zotero.PageSaving._initTranslate = originalInitTranslate;
				Zotero.TranslateWeb.translate = originalTranslate;
				Zotero.ItemSaver = OriginalItemSaver;
			}
		});
		assert.equal(captured.targetID, 'C10');
		assert.include(captured.note, '必须保留的嵌套思考');
	});

	it('ignores standard progress-window target changes during a PaperLoop session', async function() {
		const calls = await tab.run(async function() {
			const originalDetails = Zotero.PageSaving.sessionDetails;
			let callCount = 0;
			const originalCallMethod = Zotero.Connector.callMethod;
			Zotero.Connector.callMethod = async () => { callCount++; };
			Zotero.PageSaving.sessionDetails = {
				id: 'paperloop-authoritative-target',
				saveOptions: {paperLoop: {targetID: 'C10'}}
			};
			try {
				await Zotero.PageSaving.onUpdateSession({
					target: 'C11',
					tags: [],
					note: ''
				});
				return callCount;
			}
			finally {
				Zotero.PageSaving.sessionDetails = originalDetails;
				Zotero.Connector.callMethod = originalCallMethod;
			}
		});
		assert.equal(calls, 0, 'only the PaperLoop sidebar target may update its save session');
	});
});
