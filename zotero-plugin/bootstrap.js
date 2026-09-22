var PaperLoopDOIBridge;
var PaperLoopReaderQuotes;
var PaperLoopLiteratureMentions;
var PaperLoopZoteroCompat;
var PaperLoopNotebook;

function log(message) {
	Zotero.debug(`PaperLoop for Zotero: ${message}`);
}

async function startup({ id, version, rootURI }) {
	try {
		if (Zotero.initializationPromise) {
			await Zotero.initializationPromise;
		}
		Services.scriptloader.loadSubScript(rootURI + "zotero-compat.js");
		const compatibility = PaperLoopZoteroCompat.assertSupported();
		PaperLoopZoteroCompat.loadSubScript(rootURI + "paperloop.js");
		PaperLoopZoteroCompat.loadSubScript(rootURI + "notebook.js");
		PaperLoopZoteroCompat.loadSubScript(rootURI + "reader-quotes.js");
		PaperLoopZoteroCompat.loadSubScript(rootURI + "literature-mentions.js");
		PaperLoopDOIBridge.register();
		PaperLoopNotebook.register();
		PaperLoopReaderQuotes.register(id);
		PaperLoopLiteratureMentions.register(id, rootURI);
		log(`started ${version} (${id}) on Zotero ${compatibility.hostVersion}`);
	}
	catch (error) {
		try {
			shutdown();
		}
		catch (cleanupError) {
			Zotero.logError(cleanupError);
		}
		Zotero.logError(error);
	}
}

function shutdown() {
	if (typeof PaperLoopNotebook !== "undefined") {
		PaperLoopNotebook.unregister();
		PaperLoopNotebook = undefined;
	}
	if (typeof PaperLoopLiteratureMentions !== "undefined") {
		PaperLoopLiteratureMentions.unregister();
		PaperLoopLiteratureMentions = undefined;
	}
	if (typeof PaperLoopReaderQuotes !== "undefined") {
		PaperLoopReaderQuotes.unregister();
		PaperLoopReaderQuotes = undefined;
	}
	if (typeof PaperLoopDOIBridge !== "undefined") {
		PaperLoopDOIBridge.unregister();
		PaperLoopDOIBridge = undefined;
	}
	PaperLoopZoteroCompat = undefined;
	log("stopped");
}

function install() {}
function uninstall() {}
