(function (DF) {
  const $ = (root, selector) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const sizes = ['tile-feature','tile-square','tile-wide','tile-tall','tile-square','tile-wide','tile-square','tile-feature','tile-square','tile-tall'];

  function imageCredit(image) {
    if (!image || image.provider!=='unsplash') return '';
    return `Photo: <a href="${esc(image.photographer.url)}" target="_blank" rel="noopener">${esc(image.photographer.name)}</a> / <a href="${esc(image.unsplashUrl)}" target="_blank" rel="noopener">Unsplash</a>`;
  }

  function statusTokens(post,store) {
    const tokens=[];
    const state=DF.model.effectiveState(post);
    if (state!=='live') tokens.push(state.toUpperCase());
    if (store.terminal.savedIds.has(post.id)) tokens.push('SAVED');
    if (store.terminal.seenIds.has(post.id)) tokens.push('SEEN');
    return tokens;
  }

  function tile(post,index,store,plane='live') {
    const category=DF.model.CATEGORIES[post.category];
    const type=DF.model.LISTING_TYPES[post.listingType];
    const article=document.createElement('article');
    article.className=`listing-tile ${sizes[index%sizes.length]} ${post.image?'has-image':'text-only'} ${DF.model.effectiveState(post)}`;
    article.tabIndex=0;
    article.dataset.postId=post.id;
    const tokens=statusTokens(post,store);
    article.innerHTML=`
      ${post.image?`<div class="tile-media" style="background-image:url('${esc(post.image.url)}')"></div>`:''}
      <div class="tile-shade"></div><div class="tile-watermark">${esc(category.code)}</div>
      <div class="tile-content">
        <div class="tile-header"><span class="category-code">${esc(category.mark)} ${esc(category.code)}</span><span class="listing-id">${esc(post.id)}</span></div>
        <div class="tile-state-line"><span class="listing-type">${esc(type.short)}</span>${tokens.map(t=>`<span class="state-token">${esc(t)}</span>`).join('')}</div>
        <div class="tile-copy"><div class="value-label">${esc(post.valueLabel)}</div><h2>${esc(post.title)}</h2><p>${esc(post.body)}</p></div>
        ${post.image?.provider==='unsplash'?`<div class="photo-credit">${imageCredit(post.image)}</div>`:''}
        <div class="tile-footer"><span>${esc(post.district)}</span><span>${plane==='rear'?'SEEN':DF.model.relativeTime(post.createdAt)} // ${DF.model.expiryLabel(post.expiresAt)}</span></div>
      </div>`;
    article.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>event.stopPropagation()));
    return article;
  }

  function reviewCard(post) {
    const category=DF.model.CATEGORIES[post.category];
    const type=DF.model.LISTING_TYPES[post.listingType];
    return `<article class="review-card ${post.image?'has-image':'text-only'}">
      ${post.image?`<div class="review-image" style="background-image:url('${esc(post.image.url)}')"></div>`:''}
      <div class="review-body"><div class="review-top"><span>${esc(category.mark)} ${esc(category.code)}</span><span>${esc(type.short)}</span></div><div class="review-value">${esc(post.valueLabel)}</div><h3>${esc(post.title)}</h3><p>${esc(post.body)}</p><dl><div><dt>DISTRICT</dt><dd>${esc(post.district)}</dd></div><div><dt>CONTACT</dt><dd>${esc(post.contactMethod)}</dd></div><div><dt>EXPIRES</dt><dd>${esc(DF.model.expiryLabel(post.expiresAt))}</dd></div></dl>${post.image?.provider==='unsplash'?`<div class="photo-credit">${imageCredit(post.image)}</div>`:''}</div>
    </article>`;
  }

  function readerMarkup(post,store) {
    const category=DF.model.CATEGORIES[post.category];
    const type=DF.model.LISTING_TYPES[post.listingType];
    const saved=store.terminal.savedIds.has(post.id);
    const seen=store.terminal.seenIds.has(post.id);
    return `<article class="reader-card">
      <button class="icon-close" data-action="close-reader" aria-label="Close">×</button>
      ${post.image?`<div class="reader-image" style="background-image:url('${esc(post.image.url)}')"></div>`:'<div class="reader-image reader-text-image"><span>'+esc(category.code)+'</span></div>'}
      <div class="reader-copy"><div class="reader-kicker">${esc(type.label)} // ${esc(category.label)} // ${esc(post.id)}</div><div class="reader-value">${esc(post.valueLabel)}</div><h2>${esc(post.title)}</h2><p>${esc(post.body)}</p>
      <dl class="reader-details"><div><dt>POSTER</dt><dd>${esc(post.posterAlias)}</dd></div><div><dt>DISTRICT</dt><dd>${esc(post.district)}</dd></div><div><dt>CONTACT</dt><dd>${esc(post.contactMethod)}</dd></div><div><dt>EXPIRES</dt><dd>${esc(DF.model.expiryLabel(post.expiresAt))}</dd></div></dl>
      ${post.image?.provider==='unsplash'?`<div class="reader-credit">${imageCredit(post.image)}</div>`:''}
      <div class="reader-actions"><button class="button" data-action="toggle-save">${saved?'UNSAVE':'SAVE'}</button><button class="button primary" data-action="toggle-seen">${seen?'RETURN TO LIVE':'MARK SEEN'}</button></div></div>
    </article>`;
  }

  DF.render = { $, esc, tile, reviewCard, readerMarkup, imageCredit };
})(window.Dripfeed = window.Dripfeed || {});
