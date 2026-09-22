(function (root, factory) {
	const policy = factory();
	root.PaperLoopAutoDisplayPolicy = policy;
	if (typeof module === 'object' && module.exports) {
		module.exports = policy;
	}
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
	'use strict';

	const DEFAULT_CATEGORIES = Object.freeze({
		literature: true,
		webpage: true
	});

	const WEBPAGE_ITEM_TYPES = new Set([
		'webpage',
		'blogPost',
		'forumPost',
		'newspaperArticle',
		'magazineArticle'
	]);

	function normalizeCategories(value, fallback=DEFAULT_CATEGORIES) {
		const source = value && typeof value === 'object' ? value : {};
		return {
			literature: typeof source.literature === 'boolean'
				? source.literature
				: fallback.literature !== false,
			webpage: typeof source.webpage === 'boolean'
				? source.webpage
				: fallback.webpage !== false
		};
	}

	function classifyURL(value) {
		let url;
		try {
			url = new URL(String(value || ''));
		}
		catch (error) {
			return null;
		}
		const path = url.pathname.toLowerCase();
		if (/\.pdf$/.test(path)) return 'literature';
		// A detail route wins over a temporary `multiple` detection caused by
		// recommendation lists or incremental metadata on literature sites.
		if (/(?:^|\/)(?:article|abstract|chapter|paper|document|detail)(?:\/|$)/.test(path)
			|| /(?:^|\/)doi(?:\/|$)/.test(path)
			|| /\/10\.\d{4,9}\//.test(path)
			|| /\/kcms2?\/article\/abstract/.test(path)
			|| /\/science\/article\/(?:pii|abs)/.test(path)
			|| /\/content\/journals\/10\./.test(path)) {
			return 'literature';
		}
		if (/(?:^|\/)(?:defaultresult|search|results?|starter|advsearch)(?:\/|$)/.test(path)) {
			return 'result-list';
		}
		return null;
	}

	function classifyTabInfo(tabInfo={}) {
		const translators = Array.isArray(tabInfo.translators)
			? tabInfo.translators.filter(Boolean)
			: [];
		if (tabInfo.isPDF) return 'literature';
		const urlCategory = classifyURL(tabInfo.url);
		if (urlCategory) return urlCategory;
		if (translators.some(translator => translator.itemType === 'multiple')) {
			return 'result-list';
		}

		const concreteTranslator = translators.find(translator => translator.itemType);
		if (!concreteTranslator) return 'webpage';
		return WEBPAGE_ITEM_TYPES.has(concreteTranslator.itemType)
			? 'webpage'
			: 'literature';
	}

	function shouldAutoDisplay(category, categories) {
		const normalized = normalizeCategories(categories);
		if (category === 'literature') return normalized.literature;
		if (category === 'webpage') return normalized.webpage;
		return false;
	}

	return {
		DEFAULT_CATEGORIES,
		normalizeCategories,
		classifyURL,
		classifyTabInfo,
		shouldAutoDisplay
	};
});
