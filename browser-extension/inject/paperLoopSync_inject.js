/* Semantic three-way reconciliation. Never treats layout HTML as a note revision. */
Zotero.PaperLoopSync = new function () {
	const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
	const generated = /^(paperloop-|pl-|flow-)/;
	function canonical(node) {
		const clone=node.cloneNode(true);
		for(const el of [clone,...clone.querySelectorAll('*')]){
			if(el.nodeType!==1)continue;
			for(const name of [...el.classList])if(generated.test(name))el.classList.remove(name);
			if(!el.className)el.removeAttribute('class');
			for(const attr of ['colspan','rowspan'])if(el.getAttribute(attr)==='1')el.removeAttribute(attr);
			if(el.tagName==='IMG')for(const attr of ['src','width','height','title'])el.removeAttribute(attr);
			if(el.hasAttribute('style')){
				const style=[...el.style].sort().map(name=>name+':'+el.style.getPropertyValue(name).trim()).join(';');
				if(style)el.setAttribute('style',style);else el.removeAttribute('style');
			}
			const attrs=[...el.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b));
			for(const a of [...el.attributes])el.removeAttribute(a.name);
			for(const [name,value] of attrs)el.setAttribute(name,value);
		}
		for(const el of [...clone.querySelectorAll('div,span')].reverse())if(!el.attributes.length)el.replaceWith(...el.childNodes);
		const block=node=>node?.nodeType===1&&/^(DIV|P|H[1-6]|TABLE|THEAD|TBODY|TR|TD|TH|UL|OL|LI|BLOCKQUOTE|PRE|HR)$/.test(node.tagName);
		for(const el of [clone,...clone.querySelectorAll('*')]){
			if(el.closest('pre,code'))continue;
			for(const node of [...el.childNodes])if(node.nodeType===3&&/^[\t\r\n ]*$/.test(node.textContent)&&(block(node.previousSibling)||block(node.nextSibling)))node.remove();
		}
		for(const p of clone.querySelectorAll('p'))if(p.innerHTML.toLowerCase()==='<br>')p.replaceChildren();
		return clone.innerHTML;
	}
	function model(html) {
		const doc=new DOMParser().parseFromString(String(html||''),'text/html');
		const root=doc.querySelector('body>div[data-schema-version]')||doc.body;
		if(root.firstElementChild?.matches('h1')&&/^PaperLoop 思考\s*$/.test(root.firstElementChild.textContent))root.firstElementChild.remove();
		const editor=document.createElement('div');editor.innerHTML=root.innerHTML;
		// Use the same import rules as the visible editor without mounting any UI.
		const flow=Object.create(Zotero.PaperLoopFlow.prototype);
		Object.assign(flow,{editor,store:document.createElement('div'),mapping:{}});
		flow.importColumns();flow.extract();
		editor.querySelectorAll('.pl-ui,.paperloop-ref-summary,.paperloop-image-source,.paperloop-image-caption,.paperloop-gallery-title,.paperloop-figure-title').forEach(n=>n.remove());
		const entries=[];
		for(const node of editor.childNodes){
			if(node.nodeType===3&&!node.textContent.trim())continue;
			const wrapper=document.createElement('div');
			const refs=node.nodeType===1?flow.refs(node).map(r=>r.id).sort():[];
			if(node.nodeType===1&&node.matches('.paperloop-entry'))wrapper.append(...[...node.childNodes].map(n=>n.cloneNode(true)));
			else wrapper.append(node.cloneNode(true));
			const content=canonical(wrapper);
			// Placeholder empty rows are inserted/removed by the native editor.
			if(!refs.length&&!wrapper.textContent.trim()&&!wrapper.querySelector('img,table,a,hr,[data-citation],[data-annotation]'))continue;
			entries.push({html:content,refs});
		}
		const images=flow.images().map(img=>{const wrapper=document.createElement('div');wrapper.append(img.cloneNode(true));return {key:img.dataset.attachmentKey,html:canonical(wrapper)};});
		return {entries,images};
	}
	function patches(base,next) {
		if(base.length*next.length>250000)throw new Error('merge-limit');
		const rows=Array.from({length:base.length+1},()=>new Uint16Array(next.length+1));
		for(let i=base.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--)rows[i][j]=same(base[i],next[j])?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1]);
		let i=0,j=0,start=0,from=0;const result=[];
		const flush=()=>{if(start!==i||from!==j)result.push({start,end:i,values:next.slice(from,j)});};
		while(i<base.length&&j<next.length){
			if(same(base[i],next[j])){flush();i++;j++;start=i;from=j;}
			else if(rows[i+1][j]>=rows[i][j+1])i++;else j++;
		}
		i=base.length;j=next.length;flush();return result;
	}
	function scalar(base,local,remote) {
		if(same(local,remote)||same(base,remote))return local;
		if(same(base,local))return remote;
		throw new Error('overlapping-edit');
	}
	function sequence(base,local,remote,merge=scalar) {
		if(same(local,remote)||same(base,remote))return local;
		if(same(base,local))return remote;
		const left=patches(base,local),right=patches(base,remote),all=[];
		let i=0,j=0;
		while(i<left.length||j<right.length){
			const a=left[i],b=right[j];
			if(!b||a&&(a.end<b.start||a.end===b.start&&a.start<b.start)){all.push(a);i++;continue;}
			if(!a||b.end<a.start||b.end===a.start&&b.start<a.start){all.push(b);j++;continue;}
			if(a.start!==b.start||a.end!==b.end)throw new Error('overlapping-edit');
			let values;
			if(same(a.values,b.values))values=a.values;
			else if(a.start===a.end)values=[...b.values,...a.values];
			else if(a.values.length===b.values.length&&a.values.length===a.end-a.start)values=a.values.map((v,n)=>merge(base[a.start+n],v,b.values[n]));
			else throw new Error('overlapping-edit');
			all.push({...a,values});i++;j++;
		}
		let offset=0;const result=[];
		for(const patch of all){result.push(...base.slice(offset,patch.start),...patch.values);offset=patch.end;}
		result.push(...base.slice(offset));return result;
	}
	function blocks(html){const root=document.createElement('div');root.innerHTML=html;return [...root.childNodes].map(n=>n.outerHTML||n.textContent);}
	function entry(base,local,remote){
		return {html:sequence(blocks(base.html),blocks(local.html),blocks(remote.html)).join(''),
			refs:[...new Set([...base.refs,...local.refs,...remote.refs])].filter(key=>scalar(base.refs.includes(key),local.refs.includes(key),remote.refs.includes(key))).sort()};
	}
	function output(value,templates){
		const root=document.createElement('div');root.setAttribute('data-schema-version','9');root.innerHTML='<h1>PaperLoop 思考</h1>';
		for(const entry of value.entries){const el=document.createElement('div');el.className='paperloop-entry';entry.refs.forEach(key=>el.classList.add('pl-ref-'+key));el.innerHTML=entry.html;root.append(el);}
		const originals=templates.map(html=>new DOMParser().parseFromString(html,'text/html'));
		for(const img of value.images){
			root.insertAdjacentHTML('beforeend',img.html);const node=root.lastElementChild;
			const source=originals.map(doc=>doc.querySelector('img[data-attachment-key="'+img.key+'"]')).find(Boolean);
			for(const attr of ['width','height'])if(/^\d{1,5}$/.test(source?.getAttribute(attr)||''))node.setAttribute(attr,source.getAttribute(attr));
		}
		return root.outerHTML;
	}
	this.equal=(a,b)=>same(model(a),model(b));
	this.merge=(baseHTML,localHTML,remoteHTML)=>{
		const base=model(baseHTML),local=model(localHTML),remote=model(remoteHTML);
		if(same(local,remote))return {ok:true,html:localHTML,localChanged:false};
		if(same(base,remote))return {ok:true,html:localHTML,localChanged:true};
		if(same(base,local))return {ok:true,html:remoteHTML,localChanged:false};
		try{
			const entries=sequence(base.entries,local.entries,remote.entries,entry);
			const images=[];
			for(const key of new Set([...remote.images,...local.images,...base.images].map(i=>i.key))){
				const find=list=>list.find(img=>img.key===key)||null;
				const image=scalar(find(base.images),find(local.images),find(remote.images));if(image)images.push(image);
			}
			const imageKeys=new Set(images.map(img=>img.key));
			// Removing an image while the other side adds a new reference needs a choice.
			for(const item of entries)for(const key of item.refs)if(/^[A-Z0-9]{8}$/.test(key)&&!imageKeys.has(key))throw new Error('removed-linked-image');
			return {ok:true,html:output({entries,images},[remoteHTML,localHTML,baseHTML]),localChanged:true,merged:true};
		}catch(error){return {ok:false,reason:error.message};}
	};
};
