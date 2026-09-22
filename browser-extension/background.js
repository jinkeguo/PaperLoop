/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009-2012 Center for History and New Media
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

if (!Zotero.isManifestV3) {
	browser.action = browser.browserAction;
}

Zotero.Connector_Browser = new function() {
	var _tabInfo = {};
	var _tabInjections = {};
	var _incompatibleVersionMessageShown;
	var _injectTranslationScripts = [
		"browser-polyfill.js",
			"zotero_config.js",
			"zotero.js",
			"translate/promise.js",
			"utilities/date.js",
			"utilities/openurl.js",
			"utilities/xregexp-all.js",
			"utilities/xregexp-unicode-zotero.js",
			"utilities/resource/zoteroTypeSchemaData.js",
			"utilities/utilities.js",
			"utilities/utilities_item.js",
			"utilities.js",
			"http.js",
			"proxy.js",
			"translate/debug.js",
			"utilities/schema.js",
			"translate/rdf/init.js",
			"translate/rdf/uri.js",
			"translate/rdf/term.js",
			"translate/rdf/identity.js",
			"translate/rdf/rdfparser.js",
			"translate/translation/translate.js",
			"translate/translation/translate_item.js",
			"translate/translator.js",
			"translate/utilities_translate.js",
			"paperloop-auto-display-policy.js",
			"inject/http.js",
			"inject/sandboxManager.js",
			"translateWeb.js",
			"itemSaver.js",
			"inject/pageSaving.js",
			"integration/connectorIntegration.js",
			"cachedTypes.js",
			"schema.js",
			"messages.js",
			"zoteroFrame.js",
			"messaging_inject.js",
			"inject/progressWindow_inject.js",
			"inject/modalPrompt_inject.js",
			"lib/dompurify.js",
			"inject/paperLoopImages_inject.js",
			"inject/paperLoopGallery_inject.js",
			"inject/paperLoopFlow_inject.js",
			"inject/paperLoopSidebar_inject.js",
			"messagingGeneric.js",
			"i18n.js",
			"singlefile.js",
			"api.js",
			"inject/virtualOffscreenTranslate.js",
			"inject/inject.js"
	];
	// Default: February 1, 2053 (so we don't have to deal with this when developing)
	var _betaBuildExpiration = new Date(2053, 0, 1, 0, 0, 0);
	var _isBetaBuildBeyondExpiration = false;
	this._tabInfo = _tabInfo;
	let buttonContext = ['browser_action'];
	
	// Set true for long-running tasks like a Google Docs integration HTTP request to Zotero
	// where MV3 otherwise would kill the service worker and break the integration session
	// requiring a Zotero restart
	this._keepServiceWorkerAlive = 0;
	
	this.shouldKeepServiceWorkerAlive = () => this._keepServiceWorkerAlive;
	// Parallel async functions may call this, so we use a counter to make sure
	// one keep-alive function finishing does not kill the service worker for other
	// still-running functions
	this.setKeepServiceWorkerAlive = (val) => this._keepServiceWorkerAlive += val ? 1 : -1;
	
	this.init = async function() {
		if (Zotero.isManifestV3) {
			if (Zotero.isChromium) {
				// Chrome recently stopped displaying context menus on button right-click
				// with 'browser_action' as context. It's supposed to work, so maybe a bug
				// in Chrome, but let's fix it on our side. Firefox, meanwhile, throws if 'action'
				// is included in the context list.
				buttonContext.push('action');
				await Zotero.OffscreenManager.init();
			}
			this._tabInfo = _tabInfo = await Zotero.Utilities.Connector.createMV3PersistentObject('tabInfo', {ignoreKeys: ['selectCallback']});
			setInterval(async () => {
				let tabs = await browser.tabs.query({});
				for (let tab of tabs) {
					// Remove cached tabInfo for tabs that are no longer open every 15 minutes
					if (!(tab.id in _tabInfo)) {
						_clearInfoForTab(tab.id)
					}
				}
			}, 15 * 60e3);
			this.isDev = (await browser.management.getSelf()).installType === 'development';
			_isBetaBuildBeyondExpiration = this.isDev && new Date > _betaBuildExpiration;
		}
		await _paperLoopLoadAutoDisplayCategories();
		// Loading an unpacked extension from a new directory gives it a new Chromium
		// extension ID. Manifest content scripts are not inserted into tabs that were
		// already open, so recover the active tab once initialization has completed.
		setTimeout(() => {
			browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
				for (const tab of tabs) {
					_paperLoopRecoverAutoDisplay(tab, tab.url || tab.pendingUrl)
						.catch(Zotero.logError);
				}
			}).catch(Zotero.logError);
		}, 0);
	}
	
	this._getNewTabInfo = function() {
		return {
			url: null,
			translators: null,
			selectCallback: null,
			frameChecked: false,
			isPDF: false,
			uninjectable: false,
			instanceID: null,
			paperLoopPinned: false,
			paperLoopPinnedByAuto: false,
			paperLoopMinimized: false,
			paperLoopDismissedDocumentKey: null,
			paperLoopPosition: null
		}
	}

	/**
	 * Resets and returns a mutable tabInfo object for a given tab
	 * @param tabId
	 * @returns {Object}
	 */
	 this.resetTabInfo = function (tabId) {
		_tabInfo[tabId] = this._getNewTabInfo();
		return _tabInfo[tabId];
	}

	/**
	 * Returns a mutable tabInfo object for a given tab
	 * @param tabId
	 * @returns {Object}
	 */
	this.getTabInfo = function(tabId) {
		if (_tabInfo[tabId]) return _tabInfo[tabId];
		return this.resetTabInfo(tabId);
	}

	/**
	 * Gets cookies from the store associated with a tab. In Safari, the default cookie store
	 * may differ from the store used by browser tabs, so it must be resolved at runtime. If
	 * no tab is provided, the active tab in the current window is used.
	 *
	 * @param {Object} details
	 * @param {Number} tabId
	 * @return {Promise<browser.cookies.Cookie[]>}
	 */
	this.getAllCookies = async function(details, tabId=null) {
		details = {...details};
		if (!Zotero.isSafari || details.storeId) {
			return browser.cookies.getAll(details);
		}

		if (tabId === null) {
			let tabs = await browser.tabs.query({active: true, currentWindow: true});
			tabId = tabs[0]?.id;
		}

		let stores = await browser.cookies.getAllCookieStores();
		let store = stores.find(store => store.tabIds.includes(tabId))
			|| stores.find(store => store.tabIds.length)
			|| stores[0];
		if (store) {
			details.storeId = store.id;
		}
		return browser.cookies.getAll(details);
	}

	this.executeScript = function(tabId, details) {
		if (Zotero.isManifestV3) {
			if (details.hasOwnProperty('code')) {
				Zotero.logError(`Attempting to inject script in MV3 with code string: ${details.code}`);
				return;
			}
			delete details.runAt;
			if (details.hasOwnProperty('file')) {
				details.files = [details.file];
				delete details.file;
			}
			if (!details.hasOwnProperty('target')) details.target = {};
			details.target.tabId = tabId;
			if (details.hasOwnProperty('frameId')) {
				details.target.frameIds = [details.frameId];
				delete details.frameId;
			}
			delete details.runAt;
			let executeScript = chrome ? chrome.scripting.executeScript : browser.scripting.executeScript;
			return executeScript(details);
		}
		else {
			return browser.tabs.executeScript(tabId, details);
		}
	};
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab, frameId) {
		_enableForTab(tab.id);
		let tabInfo = this.getTabInfo(tab.id);

		let existingTranslators = tabInfo.translators;
		// If translators already exist for tab we need to figure out if the new translators
		// are more important/higher priority
		if (existingTranslators) {
			if (!translators.length) return;
			
			if (existingTranslators.length) {
				let existingTranslatorsHaveHigherPriority = existingTranslators[0].priority < translators[0].priority;
				if (existingTranslatorsHaveHigherPriority) return;
				
				let priorityEqual = translators[0].priority == existingTranslators[0].priority;
				let newTranslatorsAreFromTopFrame = frameId == 0;
				if (priorityEqual && !newTranslatorsAreFromTopFrame) return;
			}	
		}
		
		var isPDF = contentType == 'application/pdf';
		_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {}, {translators, instanceID, isPDF});
		
		Zotero.Connector_Browser._updateExtensionUI(tab);
		if (tabInfo.paperLoopPinned && !tabInfo.paperLoopPinnedByAuto) {
			_paperLoopPublishState(tab, {open: true}).catch(Zotero.logError);
		}
		else if (frameId !== 0) {
			// Embedded-frame Translator matches must not auto-display a page-level sidebar.
			return;
		}
		else {
			_paperLoopMaybeAutoOpen(tab).catch(Zotero.logError);
		}
	}

	/**
	 * If there's a frame with a PDF mimeType this gets invoked
	 * @param frameURL
	 * @param tabId
	 */
	this.onPDFFrame = function(frameURL, frameId, tabId) {
		let tabInfo = this.getTabInfo(tabId);
		if (tabInfo.translators && tabInfo.translators.length) {
			return;
		}
		browser.tabs.get(tabId).then(function(tab) {
			_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {}, {translators: [], isPDF: true, frameId});
			Zotero.Connector_Browser.injectTranslationScripts(tab, frameId, frameURL);
			Zotero.Connector_Browser._updateExtensionUI(tab);
			if (tabInfo.paperLoopPinned && !tabInfo.paperLoopPinnedByAuto) {
				_paperLoopPublishState(tab, {open: true}).catch(Zotero.logError);
			}
			else {
				_paperLoopMaybeAutoOpen(tab).catch(Zotero.logError);
			}
		});
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = async function(items, tab) {
		await Zotero.Connector_Browser.openWindow(
			browser.runtime.getURL("itemSelector/itemSelector.html")
				+ "#" + encodeURIComponent(JSON.stringify([tab.id, items])),
			{width: 600, height: 325}, tab
		);
		try {
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
			return await new Promise((resolve) => {
				let tabInfo = this.getTabInfo(tab.id);
				tabInfo.selectCallback = resolve;
			});
		}
		finally {
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
		}
	};
	
	/**
	 * Called when a tab is removed or the URL has changed
	 */
	this.onPageLoad = function(url, tab) {
		if(tab) _updateInfoForTab(tab.id, url);
	}
	
	/**
	 * Called when Zotero goes online or offline
	 * @param [String|Boolean] version - either `false` or version string from X-Zotero-Version header
	 */
	this.onStateChange = function(version) {
		if (version) {
			Zotero.Prefs.set('firstSaveToServer', true);
			// TODO: Enable once 5.0 is out, so that ContentTypeHandlers show an upgradeClient message instead
			parseInt(version) >= 5 && Zotero.ContentTypeHandler.enable();
		} else {
			Zotero.ContentTypeHandler.disable();
		}
	}
	
	this.onTabActivated = function(tab) {
		Zotero.Connector_Browser._updateExtensionUI(tab);
	};
	
	/**
	 * Called if Zotero version is determined to be incompatible with Standalone
	 */
	this.onIncompatibleStandaloneVersion = function(zoteroVersion, standaloneVersion) {
		if(_incompatibleVersionMessageShown) return;
		alert('Zotero Connector for Chrome '+zoteroVersion+' is incompatible with the running '+
			'version of Zotero Standalone'+(standaloneVersion ? " ("+standaloneVersion+")" : "")+
			'. Zotero Connector will continue to operate, but functionality that relies upon '+
			'Zotero Standalone may be unavailable.\n\n'+
			'Please ensure that you have installed the latest version of these components. See '+
			'https://www.zotero.org/download for more details.');
		_incompatibleVersionMessageShown = true;
	}

	this.onZoteroButtonElementClick = function(tab) {
		return _browserAction(tab);
	}
	
	/**
	 * Called if Zotero version is determined to be incompatible with Standalone
	 */
	this.newerVersionRequiredPrompt = function() {
		let clientName = ZOTERO_CONFIG.CLIENT_NAME;
		let url = ZOTERO_CONFIG.CLIENT_DOWNLOAD_URL;
		let pageName = Zotero.getString('progressWindow_error_upgradeClient_latestVersion');
		let pageLink = `<a href="${url}">${pageName}</a>`;
		
		return Zotero.Messaging.sendMessage('confirm', {
			title: Zotero.getString("general_warning"),
			button2Text: "",
			message: Zotero.getString("progressWindow_error_upgradeClient", [clientName, pageLink])
		});
	}

	/**
	 * Checks whether a given frame has any matching translators. Injects translation code
	 * into the first frame on the page or if translators are found.
	 * 
	 * @param tab
	 * @param frameId
	 * @param url - url of the frame
	 */
	this.onFrameLoaded = async function(tab, frameId, url) {
		if (_isDisabledForURL(tab.url) && frameId == 0 || _isDisabledForURL(url)) {
			return;
		}
		Zotero.debug("Connector_Browser: onFrameLoaded for " + tab.url + "; " + url);
		if (frameId == 0) {
			// Injected via the manifest file
			return;
		} else {
			let tabInfo = this.getTabInfo(tab.id);
			if (!tabInfo.frameChecked) {
				// Also in the first frame detected
				// See https://github.com/zotero/zotero-connectors/issues/156
				tabInfo.frameChecked = true;
				return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId, url);
			}
		}
		// Frame url shouldn't ever match the tab url but sometimes it does and causes weird
		// injections. We explicitly ignore it here.
		if (url == tab.url) {
			Zotero.debug(`Ignoring frame ${frameId} with a tab matching url ${tab.url}`);
			return;
		}
		return Zotero.Translators.getWebTranslatorsForLocation(url, tab.url).then(function(translators) {
			if (translators[0].length == 0) {
				Zotero.debug("Not injecting. No translators found for [tab.url, url]: " + tab.url + " , " + url);
				return;
			}
			Zotero.debug(translators[0].length+  " translators found. Injecting into [tab.url, url]: " + tab.url + " , " + url);
			return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId, url);
		});
	};
		
	this.isIncognito = function(tab) {
		return tab.incognito;
	}

	this.isTabFocused = function(tab) {
		return tab.active;
	}
	
	/**
	 * Checks whether translation scripts are already injected into a frame and if not - injects
	 * @param tab {Object}
	 * @param [frameId=0] {Number} Defaults to top frame
	 * @param [url=null] {String} URL of the frame being injected
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectTranslationScripts = async function(tab, frameId=0, url=null) {
		// Prevent triggering multiple times
		let key = tab.id+'-'+frameId;
		let deferred = this.injectTranslationScripts[key];
		if (deferred) {
			Zotero.debug(`Translation Inject: Script injection already in progress for ${key}`);
			return deferred.promise;
		}
		deferred = Zotero.Promise.defer();
		this.injectTranslationScripts[key] = deferred;
		
		let response = await Zotero.Messaging.sendMessage('ping', null, tab, frameId)
		if (response && frameId == 0) return deferred.resolve();
		url = url ? `${url} - ${tab.url}` : tab.url
		Zotero.debug(`Injecting translation scripts into ${frameId} ${url}`);
		try {
			return await Zotero.Connector_Browser.injectScripts(_injectTranslationScripts, tab, frameId);
		} catch (e) {
			Zotero.debug(`Translation Inject: Script injection rejected ${key}`);
			Zotero.debug(e.message);
		} finally {
			delete Zotero.Connector_Browser.injectTranslationScripts[key];
		}
	};
	
	this.INJECTION_TIMEOUT = 10000;

	/**
	 * Injects custom scripts
	 * 
	 * @param scripts {Object[]} array of scripts to inject
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectScripts = async function(scripts, tab, frameId=0) {
		function* injectScripts() {
			if (! Array.isArray(scripts)) scripts = [scripts];
			// Make sure we're not changing the original list
			scripts = Array.from(scripts);
			Zotero.debug(`Inject: Injecting scripts into ${frameId} - ${tab.url} : ${scripts.join(', ')}`);
			
			for (let script of scripts) {
				// Firefox returns an error for unstructured data being returned from scripts
				// We are forced to catch these, even though when sometimes they may be legit errors
				yield Zotero.Connector_Browser.executeScript(tab.id, {file: script, frameId, runAt: 'document_end'})
					.catch(() => undefined);
			}
			
			// Send a ready message to confirm successful injection
			let readyMsg = `ready${Date.now()}`;
			if (Zotero.isManifestV3) {
				yield Zotero.Connector_Browser.executeScript(tab.id, {
					frameId,
					args: [readyMsg],
					func: (readyMsg) => {
						browser.runtime.onMessage.addListener(function awaitReady(request) {
							if (request == readyMsg) {
								browser.runtime.onMessage.removeListener(awaitReady);
								return Promise.resolve(true);
							}
						});
					}
				})
			} else {
				yield browser.tabs.executeScript(tab.id, {
					code: `browser.runtime.onMessage.addListener(function awaitReady(request) {
					if (request == '${readyMsg}') {
						browser.runtime.onMessage.removeListener(awaitReady);
						return Promise.resolve(true);
					}
				})`,
					frameId,
					runAt: 'document_end'
				});	
			}
			
			while (true) {
				try {
					var response = yield browser.tabs.sendMessage(tab.id, readyMsg, {frameId: frameId});
				} catch (e) {}
				if (!response) {
					yield Zotero.Promise.delay(100);
				} else {
					Zotero.debug(`Inject: Complete ${frameId} - ${tab.url}`);
					return true;
				}
			}		
		}
		var timedOut = Zotero.Promise.defer();
		let timeout = setTimeout(function() {
			timedOut.reject(new Error (`Inject: Timed out ${frameId} - ${tab.url} after ${this.INJECTION_TIMEOUT}ms`))
		}.bind(this), this.INJECTION_TIMEOUT);
		
		// Prevent triggering multiple times
		let injections = _tabInjections[tab.id] || (_tabInjections[tab.id] = {});
		let deferred;
		try {
			deferred = injections[frameId];
			if (deferred) {
				Zotero.debug(`Inject: Script injection already in progress for ${frameId} - ${tab.url}`);
				await deferred.promise;
			}
		} catch (e) {}
		deferred = Zotero.Promise.defer();
		injections[frameId] = deferred;
		
		function tabRemovedListener(tabID) {
			if (tabID != tab.id) return;
			deferred.reject(new Error(`Inject: Tab removed mid-injection into ${frameId} - ${tab.url}`))
		}
		browser.tabs.onRemoved.addListener(tabRemovedListener);

		// This is a bit complex, but we need to cut off script injection as soon as we notice an
		// interruption condition, such as a timeout or url change, otherwise we get partial injections
		try {
			var iter = injectScripts();
			var val = iter.next();
			while (true) {
				if (val.done) {
					return val.value;
				}
				if (val.value.then) {
					// Will either throw from the first two, or return from the third one
					let nextVal = await Promise.race([
						timedOut.promise,
						deferred.promise,
						val.value
					]);
					val = iter.next(nextVal);
				} else {
					val = iter.next(val.value);
				}
			}
		}
		catch(e) {
			Zotero.debug(e.message);
		} finally {
			browser.tabs.onRemoved.removeListener(tabRemovedListener);
			deferred.resolve();
			delete injections[frameId];
			clearTimeout(timeout);
		}
	};

	this.injectSingleFile = async function(tab, frameId) {
		Zotero.debug("SingleFile: injecting SingleFile into page");
		const singleFileScripts = ["lib/SingleFile/single-file-bootstrap.js", "lib/SingleFile/single-file.js"]
		await this.injectScripts(singleFileScripts, tab, frameId)
		// Also inject the config object
		await this.injectScripts('singlefile-config.js', tab, frameId);
	};
	
	this.openWindow = async function(url, options={}, tab=null) {
		if (!tab) {
			tab = await getCurrentTab();
		}
		options = Object.assign({
			width: 800,
			height: 600,
			type: "popup"
		}, options);
		let win = await browser.windows.get(tab.windowId, null);
		options.left = Math.floor(win.left + (win.width / 2) - (options.width / 2));
		options.top = Math.floor(win.top + (win.height / 2) - (options.height / 2));
			
		win = await browser.windows.create({
			url,
			type: options.type,
			width: options.width,
			height: options.height,
			left: options.left,
			top: options.top
		});
		
		// Fix positioning in Chrome when window is on second monitor
		// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
		if (win.left < options.left) {
			browser.windows.update(win.id, { left: options.left });
		}
		// Fix a Firefox bug where content does not appear before resize on linux
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1402110
		// this one might actually get fixed, unlike the one above
		if (Zotero.isFirefox) {
			await Zotero.Promise.delay(1000);
			browser.windows.update(win.id, {width: win.width+1});
		}
		if (typeof options.onClose == 'function') {
			browser.windows.onRemoved.addListener(function onClose(id) {
				if (id == win.id) options.onClose();
				browser.windows.onRemoved.removeListener(onClose);
			});
		}
		return win;
	};
	
	this.bringToFront = async function(drawAttention=false, tab) {
		var windowId;
		if (tab && tab.windowId) {
			windowId = tab.windowId;
		} else {
			let win = await browser.windows.getLastFocused();
			windowId = win.id;
		}
		browser.windows.update(windowId, {drawAttention, focused: true});
	}

	this.openTab = async function(url, tab) {
		if (!tab) {
			tab = await getCurrentTab();
		}
		let tabProps = { index: tab.index + 1 };
		// Firefox doesn't support openerTabId
		if (!Zotero.isFirefox) {
			tabProps.openerTabId = tab.id;
		}
		browser.tabs.create(Object.assign({url}, tabProps));
	};
	
	this.openPreferences = function(paneID, tab) {
		this.openTab(browser.runtime.getURL(`preferences/preferences.html#${paneID}`), tab);
	};
	
	this.openConfigEditor = function(tab) {
		this.openTab(browser.runtime.getURL(`preferences/config.html`), tab);
	};
	
	this.waitForTabToLoad = async function(tab) {
		if (typeof tab === 'number') {
			tab = await browser.tabs.get(tab);
		}
		if (tab.status == 'complete') {
			return;
		}
		return new Promise (async (resolve, reject) => {
			async function waitForLoad(tabId, changeInfo) {
				try {
					if (changeInfo.status == 'complete') {
						browser.tabs.onUpdated.removeListener(waitForLoad);
						resolve();
					}
				} catch (_) {}
			}
			browser.tabs.onUpdated.addListener(waitForLoad);
			setTimeout(() => {
				browser.tabs.onUpdated.removeListener(waitForLoad)
				reject(new Error('Timeout waiting for tab to load'));
			}, 5000);
		})
	}

	/**
	 * Display an old-school firefox notification by injecting HTML directly into DOM.
	 * This has a side-effect of navigation (user-initiated or JS-redirect-based) 
	 * removing the notification so we keep on re-injecting it into DOM.
	 * 
	 * The timeout argument specifies how long the notification has to be displayed for
	 * without navigation, before it is considered "seen" and further navigation on the tab
	 * will not make it re-appear.
	 * 
	 * @param {String} text
	 * @param {String[]} buttons - labels for buttons
	 * @param {Number} [seenTimeout=5000]
	 * @param {Tab} [tab=currentTab]
	 * @returns {Promise{Number}} button pressed idx or undefined if timed-out and navigated away from
	 */
	this.notify = async function(text, buttons, seenTimeout=5000, tab=null) {
		// Get current tab if not provided
		if (!tab) {
			tab = await getCurrentTab();
		} else if (typeof tab === 'number') {
			tab = await browser.tabs.get(tab);
		}
		let timedOut = false;
		seenTimeout && setTimeout(() => timedOut = true, seenTimeout);
		var response = await Zotero.Messaging.sendMessage('notify', [text, buttons, null, tab.status], tab)
		if (response != undefined || timedOut) return response;
		
		// Tab url changed or tab got removed, hence the undefined response
		// Wait half a sec to not run a busy-waiting loop
		await Zotero.Promise.delay(500)
		var tab = await browser.tabs.get(tab.id)
		if (!tab) return;
		// If it still exists try again
		return this.notify(text, buttons, seenTimeout, tab);
	};

	/**
	 * Update status and tooltip of Zotero button
	 */
	this._updateExtensionUI = async function (tab) {
		if (!tab) {
			tab = await getCurrentTab();
		}
		if (Zotero.Prefs.get('firstUse') || _isBetaBuildBeyondExpiration) return _showPaperLoopAction(tab);
		if (!tab.active || tab.id < 0) return;
		let url = tab.url || tab.pendingUrl;
		if (!url) {
			// A new fun bug from Chrome where the url is sometimes an empty string
			return;
		}
		browser.contextMenus.removeAll();
		if (!browser.contextMenus.onClicked.hasListener(_handleContextMenuClick)) {
			browser.contextMenus.onClicked.addListener(_handleContextMenuClick);
		}

		let isDisabled = _isDisabledForURL(url, true)
		if (isDisabled) {
			_showZoteroStatus(tab.id, isDisabled);
			return;
		} else {
			_enableForTab(tab.id);
		}

		let tabInfo = this.getTabInfo(tab.id);
		var isPDF = tabInfo.isPDF;
		var translators = tabInfo.translators;
		_showPaperLoopAction(tab);
		
		browser.contextMenus.create({
			id: 'paperloop-save-image', title: '添加图片到 PaperLoop', contexts: ['image'],
			documentUrlPatterns: ['http://*/*', 'https://*/*']
		});
		
		// Show the save menu if we have more than one save option to show, which is true in all cases
		// other than for PDFs with no translator
		var showSaveMenu = (translators && translators.length) || !isPDF;
		let unproxiedURL = Zotero.Proxies.proxyToProper(url, true);
		var showProxyMenu = !isPDF
			&& Zotero.Proxies.proxies.length > 0
			// Don't show proxy menu if already proxied
			&& !unproxiedURL;
		
		var saveMenuID;
		if (showSaveMenu) {
			saveMenuID = "zotero-context-menu-save-menu";
			browser.contextMenus.create({
				id: saveMenuID,
				title: `${Zotero.getString('general_saveTo', ZOTERO_CONFIG.CLIENT_NAME)}`,
				contexts: [...buttonContext, 'page', 'selection']
			});
		}
		
		if (translators && translators.length) {
			_showTranslatorContextMenuItem(translators, saveMenuID);
			_showNoteContextMenuItems(translators, saveMenuID);
		}
		
		if (isPDF) {
			_showPDFContextMenuItem(saveMenuID);
		} else {
			_showWebpageContextMenuItem(saveMenuID);
		}
		
		// If unproxied, show "Reload via Proxy" options
		if (showProxyMenu) {
			_showProxyContextMenuItems(url);
		}
		if (unproxiedURL && !(Zotero.isFirefox && isPDF)) {
			_showCopyUnproxiedURLCopyContextMenuItem(url);
		}
		
		if (!Zotero.isChromium) {
			_showPreferencesContextMenuItem();
			_showTabContextMenuItem();
		}
	}
	
	// context menu item onclick event not supported in event pages (i.e. MV3),
	// so we handle all clicks in a single handler
	const _contextMenuHandlers = {
		'paperloop-save-image': (info, tab) => Zotero.PaperLoopImages.capture(info, tab),
		"zotero-context-menu-translator-save-with-selection-note": function (info, tab) {
			Zotero.Connector_Browser.saveWithTranslator(
				tab,
				0,
				{
					note: '<blockquote>' + info.selectionText + '</blockquote>'
				}
			);
		},
		"zotero-context-menu-webpage-withSnapshot-save": function (info, tab) {
			Zotero.Connector_Browser.saveAsWebpage(tab, 0, { snapshot: true });
		},
		"zotero-context-menu-webpage-withoutSnapshot-save": function (info, tab) {
			Zotero.Connector_Browser.saveAsWebpage(tab, 0);
		},
		"zotero-context-menu-pdf-save": function (info, tab) {
			Zotero.Connector_Browser.saveAsWebpage(tab);
		},
		"zotero-context-menu-preferences": function () {
			browser.tabs.create({url: browser.runtime.getURL('preferences/preferences.html')});
		},
		"zotero-context-menu-copy-unproxied-url": async (info, tab) => {
			// navigator.clipboard.writeText doesn't work in the background page because it has no focus
			Zotero.Messaging.sendMessage('clipboardWrite', [Zotero.Proxies.proxyToProper(tab.url)], tab);
		},
		"zotero-context-menu-copy-unproxied-link": async (info, tab) => {
			// navigator.clipboard.writeText doesn't work in the background page because it has no focus
			Zotero.Messaging.sendMessage('clipboardWrite', [Zotero.Proxies.proxyToProper(info.linkUrl)], tab);
		},
		"zotero-context-menu-tabs": async () => {
			const tabs = await browser.tabs.query({highlighted: true, currentWindow: true});
			Zotero.debug(`Saving ${tabs.length} tabs`);
			for (let tab of tabs) {
				await _browserAction(tab);
			}
		}
	};
	
	async function _handleContextMenuClick(info, tab) {
		const id = info.menuItemId;
		if (id.startsWith("zotero-context-menu-copy-unproxied")) {
			// Request permissions before other async actions otherwise
			// it's not treated like we do it within a gesture
			await browser.permissions.request({permissions: ['clipboardWrite']});
		}
		const shouldContinue = await _checkPermissions(tab);
		if (!shouldContinue) {
			return;
		}

		// The PDF viewer in Chromium is apparently implemented as a special extension.
		// If you right-click on the pdf-reader UI and select a Zotero option, the handler
		// here gets passed a tab that has id == -1 and an internal extension URL.y
		if (Zotero.isChromium && tab.id === -1) {
			tab = await getCurrentTab();
		}
		const handler = _contextMenuHandlers[id];
		if (handler) {
			return handler(info, tab);
		}
		const parts = id.split('-');
		if (id.startsWith("zotero-context-menu-translator-save-")) {
			const translatorIdx = parts[parts.length-1];
			return Zotero.Connector_Browser.saveWithTranslator(tab, translatorIdx);
		}
		else if(id.startsWith("zotero-context-menu-proxy-reload-")) {
			const proxyIdx = parts[parts.length-1];
			const proxy = Zotero.Proxies.proxies[proxyIdx];
			const proxied = proxy.toProxy(tab.url);
			if (Zotero.Proxies.isPreventingRedirectLoops()) {
				Zotero.Proxies.toggleRedirectLoopPrevention(false)
			}
			browser.tabs.update({ url: proxied });
		}
	}
	
	function _showZoteroStatus(tabID, message) {
		Zotero.Connector.checkIsOnline().then(function(isOnline) {
			var icon, title;
			if (isOnline) {
				icon = "images/zotero-new-z-16px.png";
				title = "Zotero is Online";
			} else {
				icon = "images/zotero-z-16px-offline.png";
				title = "Zotero is Offline";
			}
			if (typeof message === 'string') {
				title = message;
			}
			browser.action.setIcon({
				tabId: tabID,
				path: icon
			});

			browser.action.setTitle({
				tabId: tabID,
				title
			});
		});
		browser.action.disable(tabID);
		browser.contextMenus.removeAll();
	}

	function _enableForTab(tabID) {
		if (tabID < 0) {
			Zotero.debug('Invalid attempt to enable browser button for tab ' + tabID);
			return;
		}
		browser.action.enable(tabID);
	}

	function _showPaperLoopAction(tab) {
		browser.action.setIcon({
			tabId: tab.id,
			path: {
				16: 'images/treeitem-webpage-gray.png',
				32: 'images/treeitem-webpage-gray@2x.png',
				48: 'images/treeitem-webpage-gray@48px.png'
			}
		});
		browser.action.setBadgeBackgroundColor({tabId: tab.id, color: '#4F6EA6'});
		browser.action.setBadgeText({tabId: tab.id, text: 'P'});
		browser.action.setTitle({tabId: tab.id, title: 'PaperLoop：打开/收起文献侧栏'});
		browser.action.enable(tab.id);
	}

	function _showTranslatorIcon(tab, translator) {
		var itemType = translator.itemType;

		browser.action.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
				? "images/treesource-collection.png"
				: Zotero.ItemTypes.getImageSrc(itemType))
		});

		browser.action.setTitle({
			tabId:tab.id,
			title: _getTranslatorLabel(translator)
		});
	}

	function _showWebpageIcon(tab) {
		browser.action.setIcon({
			tabId: tab.id,
			path: Zotero.ItemTypes.getImageSrc("webpage-gray")
		});
		let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.prefs.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		let title = `Save to Zotero (Web Page ${withSnapshot ? 'with' : 'without'} Snapshot)`;
		browser.action.setTitle({tabId: tab.id, title});
	}

	this._showPDFIcon = function(tab) {
		browser.action.setIcon({
			tabId: tab.id,
			path: browser.runtime.getURL('images/pdf.png')
		});
		browser.action.setTitle({
			tabId: tab.id,
			title: "Save to Zotero (PDF)"
		});
	}

	function _showTranslatorContextMenuItem(translators, parentID) {
		for (var i = 0; i < translators.length; i++) {
			browser.contextMenus.create({
				id: "zotero-context-menu-translator-save-" + i,
				title: _getTranslatorLabel(translators[i]),
				parentId: parentID,
				contexts: ['page', ...buttonContext]
			});
		}
	}

	function _showNoteContextMenuItems(translators, parentID) {
		if (translators[0].itemType == "multiple") return;
		browser.contextMenus.create({
			id: "zotero-context-menu-translator-save-with-selection-note",
			title: "Create Zotero Item and Note from Selection",
			parentId: parentID,
			contexts: ['selection']
		});
	}

	function _showWebpageContextMenuItem(parentID) {
		var fns = [];
		fns.push(() => browser.contextMenus.create({
			id: "zotero-context-menu-webpage-withSnapshot-save",
			title: "Save to Zotero (Web Page with Snapshot)",
			parentId: parentID,
			contexts: ['page', ...buttonContext]
		}));
		fns.push(() => browser.contextMenus.create({
			id: "zotero-context-menu-webpage-withoutSnapshot-save",
			title: "Save to Zotero (Web Page without Snapshot)",
			parentId: parentID,
			contexts: ['page', ...buttonContext]
		}));
		// Swap order if automatic snapshots disabled
		let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.prefs.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		if (!withSnapshot) {
			fns = [fns[1], fns[0]];
		}
		fns.forEach((fn) => fn());
	}

	function _showPDFContextMenuItem(parentID) {
		browser.contextMenus.create({
			id: "zotero-context-menu-pdf-save",
			title: "Save to Zotero (PDF)",
			parentId: parentID,
			contexts: ['all']
		});
	}

	function _showProxyContextMenuItems(url) {
		var parentID = "zotero-context-menu-proxy-reload-menu";
		browser.contextMenus.create({
			id: parentID,
			title: Zotero.getString("reloadViaProxy"),
			contexts: ['page', ...buttonContext]
		});

		var i = 0;
		for (let proxy of Zotero.Proxies.proxies) {
			let name = proxy.toDisplayName();
			browser.contextMenus.create({
				id: `zotero-context-menu-proxy-reload-${i++}`,
				title: Zotero.getString("reloadVia", name),
				parentId: parentID,
				contexts: ['page', ...buttonContext]
			});
		}
	}

	function _showCopyUnproxiedURLCopyContextMenuItem(url) {
		// No button context because clipboard API requires the document to be focused
		// and context-menu on the button moves the focus to browser chrome
		browser.contextMenus.create({
			id: `zotero-context-menu-copy-unproxied-url`,
			title: Zotero.getString('copyUnproxiedPageURL'),
			contexts: ['page', ...buttonContext]
		});
		for (let proxy of Zotero.Proxies.proxies) {
			let proxyHostname = proxy.toDisplayName();
			if (url.includes(proxyHostname)) {
				browser.contextMenus.create({
					id: `zotero-context-menu-copy-unproxied-link`,
					title: Zotero.getString('copyUnproxiedLink'),
					contexts: ['link'],
					targetUrlPatterns: [`*://*.${proxyHostname}/*`]
				});		
				break;
			}
		}
	}

	function _showTabContextMenuItem() {
		browser.contextMenus.create({
			id: "zotero-context-menu-tabs",
			title: `${Zotero.getString('general_saveTo', ZOTERO_CONFIG.CLIENT_NAME)}`,
			contexts: ['tab']
		});
	}
	function _showPreferencesContextMenuItem() {
		browser.contextMenus.create({
			type: "separator",
			id: "zotero-context-menu-pref-separator",
			contexts: ['page', ...buttonContext]
		});
		browser.contextMenus.create({
			id: "zotero-context-menu-preferences",
			title: "Preferences",
			contexts: ['page', ...buttonContext]
		});
	}
	

	function _showMessageButton(tab) {
		var icon = `${Zotero.platform}/zotero-z-32px-australis.png`;
		browser.action.setIcon({
			tabId: tab.id,
			path: `images/${icon}`
		});
		browser.action.setTitle({
			tabId: tab.id,
			title: "Zotero Connector"
		});
		browser.action.enable(tab.id);
	}
	
	/**
	 * Removes information about a specific tab
	 */
	function _clearInfoForTab(tabID) {
		delete _tabInfo[tabID];
		delete _tabInjections[tabID];
		_paperLoopSavesInFlight.delete(tabID);
		for (const key of _paperLoopAppendsInFlight.keys()) {
			if (key.startsWith(`${tabID}:`)) _paperLoopAppendsInFlight.delete(key);
		}
	}
	
	function _updateInfoForTab(tabId, url) {
		let tabInfo = Zotero.Connector_Browser.getTabInfo(tabId);
		// Manual pinning follows navigation. Automatic display is re-evaluated per page.
		const paperLoopPinned = !!tabInfo.paperLoopPinned && !tabInfo.paperLoopPinnedByAuto;
		const paperLoopMinimized = !!tabInfo.paperLoopMinimized;
		const paperLoopPosition = tabInfo.paperLoopPosition || null;
		// If URL changed reject running injections
		if (tabInfo.url !== null && tabInfo.url !== url) {
			Zotero.debug(`Connector_Browser: URL changed from ${tabInfo.url} to ${url}`);
			let injections = _tabInjections[tabId];
			if (injections) {
				for (let frameId in injections) {
					injections[frameId].reject(new Error(`URL changed for tab ${url}`));
				}
			}
		}
		// Reset tabInfo
		tabInfo = Zotero.Connector_Browser.resetTabInfo(tabId);
		tabInfo.url = url;
		tabInfo.paperLoopPinned = paperLoopPinned;
		tabInfo.paperLoopPinnedByAuto = false;
		tabInfo.paperLoopMinimized = paperLoopMinimized;
		tabInfo.paperLoopPosition = paperLoopPosition;
	}

	function _isDisabledForURL(url, excludeTests=false) {
		const isFileURL = url.startsWith('file:');
		const isExtensionPage = url.includes('-extension://');
		const isHttpPage = url.startsWith('http://') || url.startsWith('https://');
		const isZoteroExtensionPage = url.startsWith(browser.runtime.getURL(''));
		const isZoteroTestPage = isZoteroExtensionPage && url.includes('/test/data/');
		if (excludeTests && isZoteroTestPage) return false;
		if (isFileURL) {
			return Zotero.getString('extensionIsDisabled_fileURL', [ZOTERO_CONFIG.CLIENT_NAME])
		}
		if (isExtensionPage) {
			return Zotero.getString('extensionIsDisabled_extensionPage', [ZOTERO_CONFIG.CLIENT_NAME])
		}
		if (!isHttpPage) {
			return Zotero.getString('extensionIsDisabled', [ZOTERO_CONFIG.CLIENT_NAME])
		}
		return false;
	}
	
	/**
	 * Check if we have permission to run on all sites.
	 * Prompts the user if permissions are insufficient.
	 * @param {Object} tab - The current tab object
	 * @returns {Promise<boolean>} - Returns false if the action should not proceed 
	 */
	async function _checkPermissions(tab) {
		// Firefox doesn't have per-site permissions in MV2.
		if (Zotero.isFirefox) {
			return true;
		}

		try {
			const hasPermissions = await browser.permissions.contains({
				origins: ["https://*/*"]
			});

			if (hasPermissions) {
				return true;
			}

			const messageIntro = Zotero.getString("permissions_siteAccess_message_intro");
			let promptProps = {
				title: Zotero.getString("permissions_siteAccess_title"),
				button1Text: Zotero.getString("permissions_siteAccess_openPreferences"),
				button2Text: Zotero.getString("general_cancel"),
				button3Text: Zotero.getString("general_continueAnyway"),
				message: messageIntro + Zotero.getString("permissions_siteAccess_message")
			};
			if (Zotero.isSafari) {
				promptProps = {
					title: Zotero.getString("permissions_siteAccess_title"),
					button1Text: Zotero.getString("general_cancel"),
					button2Text: "",
					button3Text: Zotero.getString("general_continueAnyway"),
					message: messageIntro + Zotero.getString(
						"permissions_siteAccess_message_safari",
						Zotero.getString('appConnector', ZOTERO_CONFIG.CLIENT_NAME)
					)
				};
			}

			const result = await Zotero.Messaging.sendMessage('confirm', promptProps, tab);

			if (result) {
				if (!Zotero.isSafari && result.button === 1) {
					browser.tabs.create({
						url: `about:extensions/?id=${browser.runtime.id}`
					});
				}
				return result.button === 3;
			}
		} catch (e) {
			Zotero.debug('Error checking permissions: ' + e.message);
			return true;
		}
	}
	
	const _paperLoopSavesInFlight = new Map();
	const _paperLoopAppendsInFlight = new Map();
	const PAPERLOOP_AUTO_OPEN_KEY = 'paperloop:autoOpen:v1';
	const PAPERLOOP_AUTO_DISPLAY_KEY = 'paperloop:autoDisplayCategories:v2';
	const PAPERLOOP_TARGET_KEY = 'paperloop:target:v1';
	const PAPERLOOP_LEGACY_LINK_PREFIX = 'paperloop:link:v1:';
	const PAPERLOOP_LINK_PREFIX = 'paperloop:link:v2:';
	const PAPERLOOP_TRANSLATOR_REFRESH_TIMEOUT = 4000;
	let _paperLoopAutoDisplayCategories = PaperLoopAutoDisplayPolicy.normalizeCategories();

	async function _paperLoopRefreshTranslatorState(tab) {
		let tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		if (tabInfo.translators && tabInfo.translators.length) return tabInfo;

		try {
			// Reuse the Connector's existing pageModified listener. It calls the
			// supplied Translator engine's PageSaving.onPageLoad(true) path.
			await Zotero.Messaging.sendMessage('pageModified', null, tab, 0);
		}
		catch (error) {
			Zotero.debug(`PaperLoop translator refresh request failed: ${error.message}`);
		}

		const deadline = Date.now() + PAPERLOOP_TRANSLATOR_REFRESH_TIMEOUT;
		do {
			await Zotero.Promise.delay(250);
			tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
			if (tabInfo.translators && tabInfo.translators.length) return tabInfo;
		} while (Date.now() < deadline);

		return tabInfo;
	}

	async function _paperLoopLoadAutoDisplayCategories() {
		try {
			const stored = await browser.storage.local.get([
				PAPERLOOP_AUTO_DISPLAY_KEY,
				PAPERLOOP_AUTO_OPEN_KEY
			]);
			if (stored[PAPERLOOP_AUTO_DISPLAY_KEY]
				&& typeof stored[PAPERLOOP_AUTO_DISPLAY_KEY] === 'object') {
				_paperLoopAutoDisplayCategories = PaperLoopAutoDisplayPolicy.normalizeCategories(
					stored[PAPERLOOP_AUTO_DISPLAY_KEY]
				);
			}
			else {
				const legacyValue = stored[PAPERLOOP_AUTO_OPEN_KEY];
				_paperLoopAutoDisplayCategories = typeof legacyValue === 'boolean'
					? {literature: legacyValue, webpage: legacyValue}
					: PaperLoopAutoDisplayPolicy.normalizeCategories();
				await browser.storage.local.set({
					[PAPERLOOP_AUTO_DISPLAY_KEY]: _paperLoopAutoDisplayCategories
				});
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
		return {..._paperLoopAutoDisplayCategories};
	}

	function _paperLoopNoteHTML(text) {
		const raw = String(text || "");
		if (!raw.trim()) return "<h1>PaperLoop 思考</h1>";
		const escaped = raw
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
		const paragraphs = escaped
			.split(/\n{2,}/)
			.map(paragraph => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
			.join("");
		return paragraphs
			? `<h1>PaperLoop 思考</h1>${paragraphs}`
			: "<h1>PaperLoop 思考</h1>";
	}

	function _paperLoopDocumentKey(tab) {
		try {
			const url = new URL(tab.url || '');
			url.hash = '';
			return url.href;
		}
		catch (e) {
			return tab.url || `tab:${tab.id}`;
		}
	}

	function _paperLoopLegacyLinkKey(documentKey) {
		return PAPERLOOP_LEGACY_LINK_PREFIX + String(documentKey || '').slice(0, 1800);
	}

	function _paperLoopLinkKey(documentKey, libraryID) {
		return `${PAPERLOOP_LINK_PREFIX}${String(libraryID || '')}:`
			+ String(documentKey || '').slice(0, 1750);
	}

	async function _paperLoopReadLink(documentKey, libraryID) {
		const key = _paperLoopLinkKey(documentKey, libraryID);
		const legacyKey = _paperLoopLegacyLinkKey(documentKey);
		const stored = await browser.storage.local.get([key, legacyKey]);
		const link = stored[key];
		if (link && link.itemKey) return link;

		const legacy = stored[legacyKey];
		if (legacy && legacy.itemKey
			&& String(legacy.libraryID) === String(libraryID)) {
			await _paperLoopWriteLink(documentKey, legacy);
			return legacy;
		}
		return null;
	}

	async function _paperLoopWriteLink(documentKey, link) {
		if (!link || !link.itemKey) return;
		const key = _paperLoopLinkKey(documentKey, link.libraryID);
		await browser.storage.local.set({[key]: {
			libraryID: link.libraryID,
			itemKey: link.itemKey,
			noteKey: link.noteKey || null,
			doi: link.doi || '',
			targetID: link.targetID || ''
		}});
	}

	async function _paperLoopRemoveLink(documentKey, libraryID) {
		await browser.storage.local.remove([
			_paperLoopLinkKey(documentKey, libraryID),
			_paperLoopLegacyLinkKey(documentKey)
		]);
	}

	function _paperLoopIsMissingItemError(error) {
		let value = error && error.value;
		if (typeof value === 'string') {
			try {
				value = JSON.parse(value);
			}
			catch (e) {}
		}
		return !!(error && error.status === 404
			&& value && value.error === 'ITEM_NOT_FOUND');
	}

	function _paperLoopNormalizeDOI(value) {
		const match = String(value || '').match(/10\.\d{4,9}\/[^\s"'<>?#]+/i);
		return match ? match[0].replace(/[.,;:)}\]]+$/, '').toLowerCase() : '';
	}

	function _paperLoopFindResolution(items) {
		return (items || [])
			.map(item => item && item.paperLoop ? item.paperLoop : item)
			.find(result => result && result.status === 'existing' && result.itemKey);
	}

	async function _paperLoopRecoverResolution(savedItems, eventID, targetID, note) {
		const items = (savedItems || [])
			.filter(item => item && String(item.DOI || '').trim())
			.map(item => ({
				id: item.id || Zotero.Utilities.randomString(8),
				itemType: item.itemType || 'journalArticle',
				title: item.title || '',
				DOI: item.DOI
			}));
		if (!items.length) return null;
		const response = await Zotero.Connector.callMethod(
			{method: 'paperloop/resolve', timeout: 12000},
			{eventID, targetID, note, items}
		);
		return _paperLoopFindResolution(response && response.items);
	}

	function _paperLoopPanelState(tab, options={}) {
		const tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		const translators = tabInfo.translators || [];
		const pageCategory = PaperLoopAutoDisplayPolicy.classifyTabInfo(tabInfo);
		return {
			open: options.open !== false,
			pending: !!options.pending,
			documentKey: _paperLoopDocumentKey(tab),
			url: tab.url || '',
			title: tab.title || '当前文献',
			canSave: translators.length > 0,
			translatorLabel: translators.length
				? translators.map(translator => translator.label).filter(Boolean).join(' · ')
				: '',
			pageCategory,
			autoOpen: _paperLoopAutoDisplayCategories.literature
				&& _paperLoopAutoDisplayCategories.webpage,
			autoDisplayCategories: {..._paperLoopAutoDisplayCategories},
			minimized: !!tabInfo.paperLoopMinimized,
			position: tabInfo.paperLoopPosition || null
		};
	}

	async function _paperLoopMaybeAutoOpen(tab) {
		if (!tab || !tab.id) return {open: false};
		const tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		const pageCategory = PaperLoopAutoDisplayPolicy.classifyTabInfo(tabInfo);
		if (!PaperLoopAutoDisplayPolicy.shouldAutoDisplay(
			pageCategory,
			_paperLoopAutoDisplayCategories
		)) {
			if (tabInfo.paperLoopPinnedByAuto) {
				tabInfo.paperLoopPinned = false;
				tabInfo.paperLoopPinnedByAuto = false;
				await _paperLoopPublishState(tab, {open: false, pageCategory});
			}
			return {open: false, pageCategory};
		}
		const documentKey = _paperLoopDocumentKey(tab);
		if (tabInfo.paperLoopDismissedDocumentKey === documentKey) {
			return {open: false, dismissed: true, pageCategory};
		}
		tabInfo.paperLoopPinned = true;
		tabInfo.paperLoopPinnedByAuto = true;
		return _paperLoopPublishState(tab, {open: true, pageCategory});
	}

	async function _paperLoopAwaitTranslatorDetection(tab) {
		let tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		if (Array.isArray(tabInfo.translators)) return tabInfo;

		try {
			// Existing tabs do not run manifest content scripts when an unpacked
			// extension is first loaded. Once the scripts are present, explicitly
			// request detection instead of assuming that onTranslators already ran.
			await Zotero.Messaging.sendMessage('pageModified', null, tab, 0);
		}
		catch (error) {
			Zotero.debug(`PaperLoop automatic-display recovery failed to request detection: ${error.message}`);
			return tabInfo;
		}

		const deadline = Date.now() + PAPERLOOP_TRANSLATOR_REFRESH_TIMEOUT;
		do {
			await Zotero.Promise.delay(250);
			tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
			if (Array.isArray(tabInfo.translators)) return tabInfo;
		} while (Date.now() < deadline);
		return tabInfo;
	}

	async function _paperLoopRecoverAutoDisplay(tab, expectedURL) {
		if (!tab || !tab.id) return {open: false};
		const url = tab.url || tab.pendingUrl || expectedURL || '';
		if (!url || (expectedURL && url !== expectedURL) || _isDisabledForURL(url, true)) {
			return {open: false};
		}

		let ready = false;
		try {
			ready = await _paperLoopEnsureContentScript(tab);
		}
		catch (error) {
			Zotero.debug(`PaperLoop automatic-display recovery could not inject the page: ${error.message}`);
		}
		if (!ready) return {open: false};

		let current;
		try {
			current = await Zotero.Messaging.sendMessage('paperloop.sidebar.status', null, tab);
		}
		catch (error) {
			Zotero.debug(`PaperLoop automatic-display recovery could not read sidebar state: ${error.message}`);
		}
		if (current && current.open) return current;

		await _paperLoopAwaitTranslatorDetection(tab);
		try {
			tab = await browser.tabs.get(tab.id);
		}
		catch (error) {
			return {open: false};
		}
		if (!tab || (expectedURL && tab.url !== expectedURL)) return {open: false};
		return _paperLoopMaybeAutoOpen(tab);
	}

	async function _paperLoopPublishState(tab, options={}) {
		if (!tab || !tab.id) return;
		return Zotero.Messaging.sendMessage(
			'paperloop.sidebar.update',
			_paperLoopPanelState(tab, options),
			tab
		);
	}

	async function _paperLoopEnsureContentScript(tab) {
		let response = await Zotero.Messaging.sendMessage('ping', null, tab);
		if (response === 'pong') return true;

		await Zotero.Connector_Browser.injectTranslationScripts(tab, 0, tab.url);
		response = await Zotero.Messaging.sendMessage('ping', null, tab);
		return response === 'pong';
	}

	async function _paperLoopSetActionError(tab, message=null) {
		try {
			await browser.action.setBadgeText({tabId: tab.id, text: message ? '!' : 'P'});
			if (message) {
				await browser.action.setBadgeBackgroundColor({tabId: tab.id, color: '#C62828'});
				await browser.action.setTitle({tabId: tab.id, title: `PaperLoop：${message}`});
			}
			else {
				await browser.action.setBadgeBackgroundColor({tabId: tab.id, color: '#4F6EA6'});
				await browser.action.setTitle({tabId: tab.id, title: 'PaperLoop：打开/收起文献侧栏'});
			}
		}
		catch (e) {
			Zotero.debug(`PaperLoop action feedback failed: ${e.message}`);
		}
	}

	async function _paperLoopToggle(tab) {
		const tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		const ready = await _paperLoopEnsureContentScript(tab);
		if (!ready) {
			tabInfo.paperLoopPinned = false;
			tabInfo.paperLoopPinnedByAuto = false;
			await _paperLoopSetActionError(tab, '无法进入当前网页，请刷新页面或允许站点访问后重试');
			return {open: false, error: 'CONTENT_SCRIPT_UNAVAILABLE'};
		}

		const current = await Zotero.Messaging.sendMessage('paperloop.sidebar.status', null, tab);
		const open = current && current.open && current.minimized
			? true
			: !(current && current.open);
		if (open) tabInfo.paperLoopMinimized = false;
		tabInfo.paperLoopPinned = open;
		tabInfo.paperLoopPinnedByAuto = false;
		tabInfo.paperLoopDismissedDocumentKey = open ? null : _paperLoopDocumentKey(tab);
		await _paperLoopSetActionError(tab);
		return _paperLoopPublishState(tab, {
			open,
			pending: open && tabInfo.translators === null
		});
	}

	async function _browserAction(tab) {
		if (_isBetaBuildBeyondExpiration) {
			Zotero.Messaging.sendMessage('expiredBetaBuild')
		}
		else {
			if (Zotero.Prefs.get('firstUse')) {
				Zotero.Prefs.set('firstUse', false);
			}
			return _paperLoopToggle(tab);
		}
	}

	this.paperLoopSetPinned = async function(pinned, tab, frameId) {
		if (!tab || frameId !== 0) return {open: false};
		const tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		tabInfo.paperLoopPinned = !!pinned;
		tabInfo.paperLoopPinnedByAuto = false;
		if (!pinned) tabInfo.paperLoopMinimized = false;
		tabInfo.paperLoopDismissedDocumentKey = pinned ? null : _paperLoopDocumentKey(tab);
		return {open: !!pinned};
	};

	this.paperLoopSetMinimized = async function(minimized, tab, frameId) {
		if (!tab || frameId !== 0) return {minimized: false};
		const tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		tabInfo.paperLoopPinned = true;
		tabInfo.paperLoopPinnedByAuto = false;
		tabInfo.paperLoopMinimized = !!minimized;
		tabInfo.paperLoopDismissedDocumentKey = null;
		return {open: true, minimized: tabInfo.paperLoopMinimized};
	};

	this.paperLoopSetAutoDisplayCategories = async function(categories, tab, frameId) {
		if (!tab || frameId !== 0) {
			return {categories: {..._paperLoopAutoDisplayCategories}};
		}
		_paperLoopAutoDisplayCategories = PaperLoopAutoDisplayPolicy.normalizeCategories(
			categories,
			_paperLoopAutoDisplayCategories
		);
		await browser.storage.local.set({
			[PAPERLOOP_AUTO_DISPLAY_KEY]: _paperLoopAutoDisplayCategories
		});
		return {categories: {..._paperLoopAutoDisplayCategories}};
	};

	// Kept for compatibility with a sidebar that is still running during an extension update.
	this.paperLoopSetAutoOpen = async function(enabled, tab, frameId) {
		const categories = {literature: !!enabled, webpage: !!enabled};
		const result = await this.paperLoopSetAutoDisplayCategories(categories, tab, frameId);
		return {enabled: result.categories.literature && result.categories.webpage};
	};

	this.paperLoopSetPosition = async function(position, tab, frameId) {
		if (!tab || frameId !== 0) return {position: null};
		const tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		if (position && Number.isFinite(position.left) && Number.isFinite(position.top)) {
			tabInfo.paperLoopPosition = {
				left: Math.round(position.left),
				top: Math.round(position.top)
			};
		}
		else {
			tabInfo.paperLoopPosition = null;
		}
		return {position: tabInfo.paperLoopPosition};
	};

	function _paperLoopCollectionTargets(response) {
		const stack = [];
		let libraryName = '';
		let libraryID = '';
		return (response.targets || []).map(target => {
			const level = Number(target.level) || 0;
			if (level === 0) {
				libraryName = target.name || 'Zotero 文库';
				libraryID = String(target.id || '').replace(/^L/, '');
				stack.length = 0;
				stack[0] = libraryName;
			}
			else {
				stack.length = level;
				stack[level] = target.name || '未命名分类';
			}
			return {
				targetID: String(target.id || ''),
				name: target.name || (level === 0 ? 'Zotero 文库' : '未命名分类'),
				path: stack.slice(0, level + 1).filter(Boolean).join(' / '),
				libraryName,
				libraryID,
				level,
				type: level === 0 ? 'library' : 'collection',
				recent: !!target.recent
			};
		}).filter(target => target.targetID);
	}

	async function _paperLoopReadCollections() {
		const response = await Zotero.Connector.callMethod('getSelectedCollection', {});
		const targets = _paperLoopCollectionTargets(response || {});
		const stored = await browser.storage.local.get(PAPERLOOP_TARGET_KEY);
		let selectedTargetID = String(stored[PAPERLOOP_TARGET_KEY] || '');
		if (!targets.some(target => target.targetID === selectedTargetID)) {
			selectedTargetID = response && response.id
				? `C${response.id}`
				: ((targets.find(target => target.level === 0
					&& target.name === response.libraryName) || targets[0] || {}).targetID || '');
			if (selectedTargetID) {
				await browser.storage.local.set({[PAPERLOOP_TARGET_KEY]: selectedTargetID});
			}
		}
		return {targets, selectedTargetID};
	}

	this.paperLoopGetCollections = async function(payload={}, tab, frameId) {
		if (!tab || frameId !== 0) {
			throw new Error('PaperLoop 只能从当前页面选择 Zotero 分类');
		}
		const {targets, selectedTargetID} = await _paperLoopReadCollections();
		const query = String(payload.query || '').trim().toLocaleLowerCase();
		return {
			ok: true,
			targets: query
				? targets.filter(target => target.path.toLocaleLowerCase().includes(query))
				: targets,
			selectedTargetID
		};
	};

	this.paperLoopGetDocumentState = async function(payload={}, tab, frameId) {
		if (!tab || frameId !== 0) {
			throw new Error('PaperLoop 只能从当前论文主页面读取 Zotero 状态');
		}
		const documentKey = _paperLoopDocumentKey(tab);
		if (payload.documentKey && payload.documentKey !== documentKey) {
			throw new Error('页面已切换，请等待 PaperLoop 刷新后重试');
		}
		const targetID = String(payload.targetID || '').trim();
		const {targets} = await _paperLoopReadCollections();
		const target = targets.find(candidate => candidate.targetID === targetID);
		if (!target || !target.libraryID) {
			throw new Error('请先选择要查询的 Zotero 文库或分类');
		}
		const link = await _paperLoopReadLink(documentKey, target.libraryID);
		const response = await Zotero.Connector.callMethod(
			{method: 'paperloop/state', timeout: 12000},
			{
				targetID,
				libraryID: target.libraryID,
				itemKey: link && link.itemKey || '',
				doi: link && link.doi || payload.doi || ''
			}
		);
		if (response && response.status === 'existing' && response.itemKey) {
			await _paperLoopWriteLink(documentKey, {
				libraryID: response.libraryID || target.libraryID,
				itemKey: response.itemKey,
				noteKey: response.noteKey || null,
				doi: response.doi || payload.doi || '',
				targetID
			});
		}
		else if (response && response.status === 'missing' && link) {
			await _paperLoopRemoveLink(documentKey, target.libraryID);
		}
		return {ok: true, target, ...response};
	};

	this.paperLoopSetTarget = async function(payload={}, tab, frameId) {
		if (!tab || frameId !== 0) {
			throw new Error('PaperLoop 只能从当前页面选择 Zotero 分类');
		}
		const targetID = String(payload.targetID || '').trim();
		const {targets} = await _paperLoopReadCollections();
		const target = targets.find(candidate => candidate.targetID === targetID);
		if (!target) throw new Error('所选 Zotero 分类不存在或不可编辑');
		await browser.storage.local.set({[PAPERLOOP_TARGET_KEY]: targetID});
		return {ok: true, target};
	};

	this.paperLoopAppendThought = async function(payload={}, tab, frameId) {
		if (!tab || frameId !== 0) {
			throw new Error('PaperLoop 只能从当前页面追加思考');
		}
		const itemKey = String(payload.itemKey || '').trim().toUpperCase();
		if (!String(payload.thought || '').trim()) throw new Error('请输入要同步的思考');
		const note = _paperLoopNoteHTML(payload.thought);
		if (!itemKey) throw new Error('请先选择 Zotero 条目');
		const operationKey = `${tab.id}:${payload.libraryID || ''}:${itemKey}`;
		if (_paperLoopAppendsInFlight.has(operationKey)) {
			return _paperLoopAppendsInFlight.get(operationKey);
		}
		const operation = (async () => {
			const response = await Zotero.Connector.callMethod(
				{method: 'paperloop/append-note', timeout: 12000},
				{
					libraryID: payload.libraryID,
					itemKey,
					eventID: Zotero.Utilities.randomString(24),
					note,
					mode: payload.mode || 'append',
					targetID: payload.targetID || ''
				}
			);
			return {ok: true, ...response};
		})();
		_paperLoopAppendsInFlight.set(operationKey, operation);
		try {
			return await operation;
		}
		finally {
			_paperLoopAppendsInFlight.delete(operationKey);
		}
	};

	this.paperLoopSaveThought = async function(payload={}, tab, frameId) {
		if (!tab || frameId !== 0) {
			throw new Error('PaperLoop 只能从当前论文主页面保存');
		}
		if (payload.documentKey && payload.documentKey !== _paperLoopDocumentKey(tab)) {
			throw new Error('页面已切换，请等待 PaperLoop 刷新后重试');
		}
		const documentKey = _paperLoopDocumentKey(tab);
		let tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		const targetID = String(payload.targetID || '').trim();
		if (!targetID) {
			throw new Error('请先选择保存到哪个 Zotero 分类');
		}
		if (_paperLoopSavesInFlight.has(tab.id)) {
			return _paperLoopSavesInFlight.get(tab.id);
		}

		const savePromise = (async () => {
			const note = _paperLoopNoteHTML(payload.thought);
			const {targets} = await _paperLoopReadCollections();
			const target = targets.find(candidate => candidate.targetID === targetID);
			if (!target || !target.libraryID) {
				throw new Error('所选 Zotero 文库或分类不存在，请重新选择');
			}
			let existingLink = await _paperLoopReadLink(documentKey, target.libraryID);
			let translateForMissingPDF = false;
			if (existingLink && !payload.noteOnly && tabInfo.translators && tabInfo.translators.length) {
				try {
					const remote = await Zotero.Connector.callMethod(
						{method: 'paperloop/state', timeout: 12000},
						{
							targetID,
							libraryID: existingLink.libraryID,
							itemKey: existingLink.itemKey,
							doi: payload.doi || ''
						}
					);
					const pageDOI = _paperLoopNormalizeDOI(payload.doi);
					translateForMissingPDF = remote
						&& remote.status === 'existing'
						&& remote.hasPDF === false
						&& pageDOI
						&& pageDOI === _paperLoopNormalizeDOI(remote.doi);
				}
				catch (e) {
					// Bridge <=0.1.15 has no PDF state. Keep the proven direct-sync path.
				}
			}
			if (existingLink && !translateForMissingPDF) {
				try {
					const response = await Zotero.Connector.callMethod(
						{method: 'paperloop/append-note', timeout: 12000},
						{
							libraryID: existingLink.libraryID,
							itemKey: existingLink.itemKey,
							eventID: Zotero.Utilities.randomString(24),
							note,
							mode: 'upsert',
							targetID
						}
					);
					await _paperLoopWriteLink(documentKey, {
						...existingLink,
						noteKey: response.noteKey || existingLink.noteKey,
						targetID
					});
					return {
						ok: true,
						mode: note ? 'sync' : 'classify',
						...response
					};
				}
				catch (error) {
					if (!_paperLoopIsMissingItemError(error)) throw error;
					await _paperLoopRemoveLink(documentKey, target.libraryID);
					existingLink = null;
				}
			}
			const linkedBeforeTranslator = !!existingLink;
			if (!tabInfo.translators || !tabInfo.translators.length) {
				tabInfo = await _paperLoopRefreshTranslatorState(tab);
			}
			if (!tabInfo.translators || !tabInfo.translators.length) {
				throw new Error('当前页面尚未被 Zotero Translator 识别');
			}
			const eventID = Zotero.Utilities.randomString(24);
			const savedItems = await Zotero.Connector_Browser.saveWithTranslator(
				tab,
				0,
				{
					fallbackOnFailure: true,
					// A prior standard Connector save must not donate its session/options.
					resave: true,
					paperLoop: {
						eventID,
						targetID,
						note
					}
				}
			);
			let resolution = _paperLoopFindResolution(
				(savedItems || []).map(item => item && item.paperLoop)
			);
			if (!resolution) {
				resolution = await _paperLoopRecoverResolution(
					savedItems,
					eventID,
					targetID,
					note
				);
			}
			if (resolution) {
				await _paperLoopWriteLink(documentKey, {
					...resolution,
					libraryID: resolution.libraryID || target.libraryID,
					targetID
				});
			}
			else if ((savedItems || []).some(item => item && String(item.DOI || '').trim())) {
				throw new Error('Zotero 已收到文献，但 PaperLoop 未能确认对应条目或思考笔记；请重试');
			}
			return {
				ok: true,
				mode: linkedBeforeTranslator && resolution ? 'sync' : 'save',
				translatorLabel: tabInfo.translators[0].label || '',
				itemCount: Array.isArray(savedItems) ? savedItems.length : null,
				...(resolution || {})
			};
		})();

		_paperLoopSavesInFlight.set(tab.id, savePromise);
		try {
			return await savePromise;
		}
		finally {
			_paperLoopSavesInFlight.delete(tab.id);
		}
	};

	/**
	 * @param tab <Tab>
	 * @param i <Integer> the index of translator to save with
	 * @param options <Object>
	 * 		- fallbackOnFailure <Boolean> if translation fails, attempt to save with lower priority translators
	 * 		- note <String> add string as a note to the saved item
	 * @returns {Promise<*>}
	 */
	this.saveWithTranslator = function(tab, i, options={}) {
		let tabInfo = this.getTabInfo(tab.id);
		var translator = tabInfo.translators[i];
		
		// Set frameId to null - send message to all frames
		// There is code to figure out which frame should translate with instanceID.
		return Zotero.Messaging.sendMessage(
			"translate",
			[
				tabInfo.instanceID,
				translator.translatorID,
				options
			],
			tab,
			null
		);
	}
	
	this.saveAsWebpage = async function(tab, frameId, options={}) {
		let tabInfo = this.getTabInfo(tab.id);
		if (tabInfo.uninjectable) {
			return Zotero.Utilities.saveWithoutProgressWindow(tab, frameId);
		}
	
		if (tab.id != -1) {
			return Zotero.Messaging.sendMessage("saveAsWebpage", [tab.title, options], tab, frameId);
		}
		// Handle right-click on PDF overlay, which exists in a weird non-tab state
		else {
			let tab = await getCurrentTab();
			return Zotero.Messaging.sendMessage("saveAsWebpage", tab.title, tab);
		}
	}
	
	function _getTranslatorLabel(translator) {
		var translatorName = translator.label;
		return "Save to Zotero (" + translatorName + ")";
	}
	
	Zotero.Messaging.addMessageListener("selectDone", function(data) {
		let tabInfo = Zotero.Connector_Browser.getTabInfo(data[0]);
		tabInfo.selectCallback(data[1]);
	});

	async function getCurrentTab() {
		let window = await browser.windows.getCurrent();
		let tabs = await browser.tabs.query({ active: true, windowId: window.id });
		if (tabs.length === 0) {
			throw new Error("No active tab found");
		}
		return tabs[0];
	}
	
	function logListenerErrors(listener) {
		return function() {
			try {
				var returnValue = listener.apply(this, arguments);
				if (returnValue && returnValue.then) {
					returnValue.catch(function(e) {
						if (e && e.message && e.message.startsWith('No tab with id:')) {
							Zotero.debug(e);
							return;
						}
						Zotero.logError(e);
						throw (e);
					});
				}
			} catch (e) {
				Zotero.logError(e);
				throw e;
			}
		}
	}
	
	function waitForInit(fn) {
		return async function() {
			await Zotero.initDeferred.promise;
			return fn.apply(this, arguments);
		}
	}
	
	async function onNavigation(details, historyChange=false) {
		// Ignore developer tools, item selector
		if (details.tabId <= 0
			|| details.url.indexOf(browser.runtime.getURL("itemSelector/itemSelector.html")) === 0) return;

		let tabInfo = Zotero.Connector_Browser.getTabInfo(details.tabId);

		// Ignore a history change that doesn't change URL (fired for all normal navigation)
		if (historyChange && tabInfo.url == details.url) {
			return;
		}

		let tab;
		
		// Only update button for disabled pages
		if (_isDisabledForURL(details.url, true)) {
			tab = await browser.tabs.get(details.tabId);
			return Zotero.Connector_Browser._updateExtensionUI(tab);
		}

		// If you try to inject scripts into a frame here in Firefox it claims we don't have
		// host permissions for the frame (false/bug), so we do it in onDOMContentLoaded
		// (but it makes frame translator detection slower in Firefox)
		if (!Zotero.isFirefox) {
			if (!tab) tab = await browser.tabs.get(details.tabId);
			await Zotero.Connector_Browser.onFrameLoaded(tab, details.frameId, details.url);
		}
		
		if (details.frameId !== 0) return;
		
		const wasPaperLoopAutoPinned = !!tabInfo.paperLoopPinnedByAuto;
		_updateInfoForTab(details.tabId, details.url);
		if (!tab) tab = await browser.tabs.get(details.tabId);
		if (historyChange && wasPaperLoopAutoPinned) {
			// Keep the panel visible while a single-page literature site changes
			// routes. The next Translator result either confirms the detail page or
			// closes it through the result-list policy.
			const nextTabInfo = Zotero.Connector_Browser.getTabInfo(details.tabId);
			nextTabInfo.paperLoopPinned = true;
			nextTabInfo.paperLoopPinnedByAuto = true;
			await _paperLoopPublishState(tab, {open: true, pending: true});
		}
		Zotero.Connector_Browser._updateExtensionUI(tab);
		Zotero.Connector.reportActiveURL(tab.url);
		if (Zotero.Connector_Browser.getTabInfo(tab.id).paperLoopPinned) {
			await _paperLoopPublishState(tab, {open: true, pending: true});
		}
		
		if (historyChange) {
			Zotero.Messaging.sendMessage('historyChanged');
		}
	}
	
	async function onDOMContentLoaded(details) {
		if (Zotero.isFirefox) {
			let tab = await browser.tabs.get(details.tabId);
			await Zotero.Connector_Browser.onFrameLoaded(tab, details.frameId, details.url);
		}
		if (details.frameId !== 0) return;
		// onTranslators remains the primary trigger. This is a recovery path for
		// Chromium service-worker restarts and pages that missed the first message.
		await Zotero.Promise.delay(350);
		const tab = await browser.tabs.get(details.tabId);
		await _paperLoopRecoverAutoDisplay(tab, details.url);
	}

	browser.action.onClicked.addListener(waitForInit(logListenerErrors(_browserAction)));
	
	browser.tabs.onRemoved.addListener(waitForInit(logListenerErrors(_clearInfoForTab)));
	
	browser.tabs.onActivated.addListener(waitForInit(logListenerErrors(async function(details) {
		var tab = await browser.tabs.get(details.tabId);
		if (!tab) return;
		const url = tab.url || tab.pendingUrl;
		// ??? I am seeing logged errors with url === undefined. Either way, if a tab with
		// no url gets activated, there's nothing for us to do.
		if (!url) return;
		// Ignore item selector
		if (url.indexOf(browser.runtime.getURL("itemSelector/itemSelector.html")) === 0) return;
		Zotero.debug("Connector_Browser: onActivated for " + url);
		Zotero.Connector_Browser.onTabActivated(tab);
		Zotero.Connector.reportActiveURL(url);
		await _paperLoopRecoverAutoDisplay(tab, url);
	})));
	
	browser.webNavigation.onCommitted.addListener(waitForInit(logListenerErrors(onNavigation)));
	browser.webNavigation.onDOMContentLoaded.addListener(waitForInit(logListenerErrors(onDOMContentLoaded)))
	// Safari doesn't implement webNavigation.onHistoryStateUpdated, so feature-detect it. Where it's
	// missing, the historyMonitor content script reports same-document navigations instead.
	if (browser.webNavigation.onHistoryStateUpdated) {
		browser.webNavigation.onHistoryStateUpdated.addListener(waitForInit(logListenerErrors(details => onNavigation(details, true))));
	}
	else {
		this.onHistoryStateUpdated = waitForInit(logListenerErrors(
			(url, tab) => onNavigation({url, tabId: tab.id, frameId: 0}, true)
		));
	}
}

Zotero.initGlobal();
