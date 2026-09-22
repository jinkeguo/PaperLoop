/* The context-menu target is captured in the page; only explicit image resources
 * are candidates. No invented URL rewrites or external figure-page scraping. */
(() => {
	if (Zotero.PaperLoopImageContext) return;
	let last = null;
	function absolute(value) {
		try { const url = new URL(value, document.baseURI); return /^(https?:|data:|blob:)$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; }
	}
	function inspect(image) {
		const candidates = [];
		const add = (value, kind, width=0) => {
			const url = absolute(value);
			if (url && !candidates.some(c => c.url === url)) candidates.push({url, kind, width});
		};
		const link = image.closest('a[href]');
		if (link && /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(link.href)) add(link.href, 'original');
		for (const attr of ['data-original', 'data-full', 'data-fullsize', 'data-hi-res-src', 'data-large', 'data-zoom-image']) {
			if (image.getAttribute(attr)) add(image.getAttribute(attr), 'original');
		}
		const srcset = image.getAttribute('srcset') || '';
		if (!srcset.includes('data:')) {
			const variants = srcset.split(',').map(value => {
				const [url, size=''] = value.trim().split(/\s+/);
				return {url, width: size.endsWith('w') ? parseFloat(size) : parseFloat(size) * (image.clientWidth || image.naturalWidth)};
			}).filter(value => value.url).sort((a,b) => (b.width || 0) - (a.width || 0));
			for (const value of variants) add(value.url, 'responsive', value.width);
		}
		add(image.currentSrc || image.src, 'displayed', image.naturalWidth);
		add(image.src, 'displayed', image.naturalWidth);
		const figure = image.closest('figure');
		const caption = figure && figure.querySelector('figcaption');
		return {candidates: candidates.slice(0, 7), sourceURL: image.currentSrc || image.src,
			caption: String(caption && caption.textContent || image.alt || '').trim().slice(0, 2000),
			width: image.naturalWidth, height: image.naturalHeight, frameURL: location.href};
	}
	document.addEventListener('contextmenu', event => {
		const image = event.composedPath().find(node => node && node.tagName === 'IMG');
		last = image ? inspect(image) : null;
	}, true);
	Zotero.PaperLoopImageContext = {inspect};
	browser.runtime.onMessage.addListener(message => {
		if (!message || message.type !== 'paperloop:image-context') return;
		if (!last || (message.srcUrl !== last.sourceURL && !last.candidates.some(c => c.url === message.srcUrl))) return Promise.resolve(null);
		return Promise.resolve(last);
	});
})();
