var PaperLoopZoteroCompat = new function () {
	this.productVersion = "0.5.4";
	this.minHostMajor = 7;
	this.maxHostMajor = 9;

	this.getHostVersion = function () {
		if (typeof Zotero !== "undefined" && Zotero.version) {
			return String(Zotero.version);
		}
		if (typeof Services !== "undefined" && Services.appinfo && Services.appinfo.version) {
			return String(Services.appinfo.version);
		}
		return "unknown";
	};

	this.getHostMajor = function () {
		const match = /^(\d+)/.exec(this.getHostVersion());
		return match ? Number(match[1]) : 0;
	};

	this.capabilities = function () {
		return {
			hostVersion: this.getHostVersion(),
			hostMajor: this.getHostMajor(),
			serverEndpoints: !!(Zotero.Server && Zotero.Server.Endpoints),
			readerEvents: !!(Zotero.Reader
				&& typeof Zotero.Reader.registerEventListener === "function"),
			readerPluginCleanup: !!(Zotero.Reader
				&& typeof Zotero.Reader._unregisterEventListenerByPluginID === "function"),
			scriptLoader: !!(typeof Services !== "undefined"
				&& Services.scriptloader
				&& typeof Services.scriptloader.loadSubScript === "function"),
			noteEditorInstances: !!(Zotero.Notes && Array.isArray(Zotero.Notes._editorInstances))
		};
	};

	this.assertSupported = function () {
		const report = this.capabilities();
		if (report.hostMajor < this.minHostMajor || report.hostMajor > this.maxHostMajor) {
			throw new Error(`UNSUPPORTED_ZOTERO_VERSION_${report.hostVersion}`);
		}
		const required = ["serverEndpoints", "readerEvents", "scriptLoader"];
		for (const capability of required) {
			if (!report[capability]) {
				throw new Error(`MISSING_ZOTERO_CAPABILITY_${capability}`);
			}
		}
		return report;
	};

	this.loadSubScript = function (uri, scope) {
		if (typeof Services === "undefined"
				|| !Services.scriptloader
				|| typeof Services.scriptloader.loadSubScript !== "function") {
			throw new Error("MISSING_ZOTERO_CAPABILITY_scriptLoader");
		}
		return Services.scriptloader.loadSubScript(uri, scope);
	};

	this.registerEndpoint = function (path, endpoint) {
		if (!Zotero.Server || !Zotero.Server.Endpoints) {
			throw new Error("MISSING_ZOTERO_CAPABILITY_serverEndpoints");
		}
		const existing = Zotero.Server.Endpoints[path];
		if (existing && existing !== endpoint) {
			throw new Error(`PAPERLOOP_ENDPOINT_CONFLICT_${path}`);
		}
		Zotero.Server.Endpoints[path] = endpoint;
	};

	this.unregisterEndpoint = function (path, endpoint) {
		if (!Zotero.Server || !Zotero.Server.Endpoints) return false;
		if (Zotero.Server.Endpoints[path] !== endpoint) return false;
		delete Zotero.Server.Endpoints[path];
		return true;
	};

	this.registerReaderListener = function (type, handler, pluginID) {
		if (!Zotero.Reader || typeof Zotero.Reader.registerEventListener !== "function") {
			throw new Error("MISSING_ZOTERO_CAPABILITY_readerEvents");
		}
		Zotero.Reader.registerEventListener(type, handler, pluginID);
	};

	this.unregisterReaderListener = function (type, handler, pluginID) {
		if (!Zotero.Reader) return false;
		// The public implementation is incorrect through Zotero 9.0.6. Prefer the
		// same plugin-ID cleanup path Zotero invokes during plugin shutdown.
		if (typeof Zotero.Reader._unregisterEventListenerByPluginID === "function") {
			Zotero.Reader._unregisterEventListenerByPluginID(pluginID);
			return true;
		}
		if (typeof Zotero.Reader.unregisterEventListener === "function") {
			Zotero.Reader.unregisterEventListener(type, handler);
			return true;
		}
		return false;
	};
};
