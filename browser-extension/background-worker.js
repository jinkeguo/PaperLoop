/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Center for History and New Media
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

// This is the Chrome MV3 background worker entrypoint script

// No way to inspect service-worker startup issues
// See https://groups.google.com/a/chromium.org/g/chromium-extensions/c/lLb3EJzjw0o
try {
	var scriptsToImport = [
		"browser-polyfill.js",
			"zotero_config.js",
			"zotero.js",
			"i18n.js",
			"translate/promise.js",
			"utilities/date.js",
			"utilities/openurl.js",
			"utilities/xregexp-all.js",
			"utilities/xregexp-unicode-zotero.js",
			"utilities/resource/zoteroTypeSchemaData.js",
			"utilities/utilities.js",
			"utilities/utilities_item.js",
			"utilities/resource/zoteroTypeSchemaData.js",
			"utilities.js",
			"prefs.js",
			"api.js",
			"http.js",
			"oauthsimple.js",
			"proxy.js",
			"connector.js",
			"updaterFix.js",
			"repo.js",
			"translate/debug.js",
			"translate/tlds.js",
			"translate/translator.js",
			"botBypass.js",
			"itemSaver_background.js",
			"translators.js",
			"cachedTypes.js",
			"errors_webkit.js",
			"zotero-google-docs-integration/api.js",
			"messages.js",
			"messaging.js",
			"webRequestIntercept.js",
			"contentTypeHandler.js",
			"saveWithoutProgressWindow.js",
			"messagingGeneric.js",
			"browserAttachmentMonitor/browserAttachmentMonitor.js",
		"offscreen/offscreenFunctionOverrides.js",
		"background/offscreenManager.js",
		"keep-mv3-alive.js",
		"paperloop-auto-display-policy.js",
		"background.js",
		"paperloop-images.js"
	];

	for (let script of scriptsToImport) {
		self.importScripts('./'+script);
	}
} catch (e) {
	console.error(e);
}
