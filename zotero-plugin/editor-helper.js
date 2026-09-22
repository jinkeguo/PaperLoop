(() => {
	if (window.PaperLoopEditorHelper) return;

	function mentionContext(core, maxQueryLength, payload = null) {
		const state = core && core.view && core.view.state;
		if (state && payload) {
			const from = Number(payload.from);
			const to = Number(payload.to);
			if (Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from < to
					&& to <= state.doc.content.size) {
				const actual = state.doc.textBetween(from, to, "\n", "\uFFFC");
				const sourceText = String(payload.sourceText || "");
				if (actual.startsWith("@") && actual.length <= maxQueryLength + 1
						&& !/[\r\n@]/.test(actual.slice(1)) && (!sourceText || actual === sourceText)) {
					return { from, to };
				}
			}
		}
		const selection = state && state.selection;
		if (!selection || !selection.empty || !selection.$from || !selection.$from.parent) return null;
		const parentOffset = selection.$from.parentOffset;
		const textBefore = selection.$from.parent.textBetween(0, parentOffset, "\n", "\uFFFC");
		const atIndex = textBefore.lastIndexOf("@");
		if (atIndex < 0) return null;
		const query = textBefore.slice(atIndex + 1);
		if (query.length > maxQueryLength || /[\r\n@]/.test(query)) return null;
		return {
			from: selection.from - query.length - 1,
			to: selection.from
		};
	}

	window.PaperLoopEditorHelper = Object.freeze({
		getSelectionStateJSON() {
			try {
				const core = window._currentEditorInstance && window._currentEditorInstance._editorCore;
				const state = core && core.view && core.view.state;
				const selection = state && state.selection;
				if (!selection) return JSON.stringify({ ok: false, errorCode: "EDITOR_SELECTION_UNAVAILABLE" });
				return JSON.stringify({
					ok: true,
					empty: !!selection.empty,
					from: selection.from,
					to: selection.to
				});
			}
			catch (error) {
				return JSON.stringify({ ok: false, errorCode: "EDITOR_SELECTION_READ_FAILED" });
			}
		},

		applyTextStyleJSON(payloadJSON) {
			try {
				const payload = JSON.parse(String(payloadJSON || "{}"));
				const core = window._currentEditorInstance && window._currentEditorInstance._editorCore;
				const state = core && core.view && core.view.state;
				if (!state) return JSON.stringify({ ok: false, errorCode: "EDITOR_STATE_UNAVAILABLE" });
				const from = Number(payload.from);
				const to = Number(payload.to);
				if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= to
						|| to > state.doc.content.size) {
					return JSON.stringify({ ok: false, errorCode: "EDITOR_SELECTION_INVALID" });
				}
				let transaction = state.tr;
				if (payload.markName === "clearColors") {
					for (const name of ["textColor", "backgroundColor"]) {
						const markType = state.schema.marks && state.schema.marks[name];
						if (markType) transaction = transaction.removeMark(from, to, markType);
					}
				}
				else {
					const markName = String(payload.markName || "");
					if (!["textColor", "backgroundColor"].includes(markName)) {
						return JSON.stringify({ ok: false, errorCode: "EDITOR_MARK_NOT_ALLOWED" });
					}
					const markType = state.schema.marks && state.schema.marks[markName];
					if (!markType) return JSON.stringify({ ok: false, errorCode: "EDITOR_MARK_UNAVAILABLE" });
					const color = String(payload.color || "");
					if (!/^#[0-9a-f]{6}$/i.test(color)) {
						return JSON.stringify({ ok: false, errorCode: "EDITOR_COLOR_INVALID" });
					}
					transaction = transaction.removeMark(from, to, markType);
					transaction = transaction.addMark(from, to, markType.create({ color }));
				}
				core.view.dispatch(transaction.scrollIntoView());
				return JSON.stringify({ ok: true });
			}
			catch (error) {
				return JSON.stringify({ ok: false, errorCode: "EDITOR_FORMAT_DISPATCH_FAILED" });
			}
		},

		insertMentionJSON(payloadJSON) {
			try {
				const payload = JSON.parse(String(payloadJSON || "{}"));
				const core = window._currentEditorInstance && window._currentEditorInstance._editorCore;
				const state = core && core.view && core.view.state;
				if (!state) return JSON.stringify({ ok: false, errorCode: "EDITOR_STATE_UNAVAILABLE" });
				const context = mentionContext(core, Number(payload.maxQueryLength) || 80, payload);
				if (!context) return JSON.stringify({ ok: false, errorCode: "MENTION_CONTEXT_LOST" });
				const linkType = state.schema && state.schema.marks && state.schema.marks.link;
				if (!linkType) return JSON.stringify({ ok: false, errorCode: "LINK_MARK_UNAVAILABLE" });

				const linkMark = linkType.create({
					href: String(payload.selectURI || ""),
					title: String(payload.mentionTitle || "")
				});
				let contextMarks = [];
				try {
					const $context = state.doc.resolve(context.to);
					contextMarks = $context && typeof $context.marks === "function" ? $context.marks() : [];
				}
				catch (error) {}
				const cursorMarks = state.storedMarks || contextMarks;
				const inheritedMarks = Array.from(cursorMarks || []).filter(mark =>
					mark && mark.type !== linkType && (!mark.type || mark.type.name !== "link")
				);
				const label = String(payload.label || "");
				if (!label || !payload.selectURI) {
					return JSON.stringify({ ok: false, errorCode: "MENTION_PAYLOAD_INVALID" });
				}
				const node = state.schema.text(label, [...inheritedMarks, linkMark]);
				let transaction = state.tr.replaceWith(context.from, context.to, node);
				transaction = transaction.insertText(" ", context.from + node.nodeSize).scrollIntoView();
				core.view.dispatch(transaction);
				if (typeof core.view.focus === "function") core.view.focus();
				return JSON.stringify({ ok: true });
			}
			catch (error) {
				return JSON.stringify({ ok: false, errorCode: "MENTION_DISPATCH_FAILED" });
			}
		}
	});
})();
