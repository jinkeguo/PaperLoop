var PaperLoopDOIBridge;

function log(message) {
	Zotero.debug(`PaperLoop DOI Bridge: ${message}`);
}

async function startup({ id, version, rootURI }) {
	try {
		Services.scriptloader.loadSubScript(rootURI + "paperloop.js");
		PaperLoopDOIBridge.register();
		log(`started ${version} (${id})`);
	}
	catch (error) {
		Zotero.logError(error);
	}
}

function shutdown() {
	if (typeof PaperLoopDOIBridge !== "undefined") {
		PaperLoopDOIBridge.unregister();
		PaperLoopDOIBridge = undefined;
	}
	log("stopped");
}

function install() {}
function uninstall() {}
