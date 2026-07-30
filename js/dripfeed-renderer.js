(function (DF) {
  const $ = (root, selector) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
  const sizes = [
    'tile-feature', 'tile-square', 'tile-wide', 'tile-tall', 'tile-square',
    'tile-wide', 'tile-square', 'tile-feature', 'tile-square', 'tile-tall'
  ];

  function imageUrl(image, variant = 'display') {
    if (!image) return '';
    const urls = image.urls || {};
    if (variant === 'thumbnail') return urls.thumbnail || urls.thumb || image.url || '';
    if (variant === 'expanded') return urls.expanded || urls.regular || urls.full || image.url || '';
    return urls.display || urls.small || image.url || urls.expanded || '';
  }

  function imageCredit(image) {
    if (!image) return '';
    const credit = image.credit || {};
    const creatorName = credit.creatorName || image.photographer?.name || '';
    const creatorUrl = credit.creatorUrl || image.photographer?.url || '';
    const providerName = credit.providerName || (image.provider === 'unsplash' ? 'Unsplash' : image.provider === 'pexels' ? 'Pexels' : '');
    const providerUrl = credit.providerPageUrl || image.photoUrl || credit.providerUrl || image.unsplashUrl || '';
    if (!creatorName && !providerName) return '';

    const creator = creatorUrl
      ? `<a href="${esc(creatorUrl)}" target="_blank" rel="noopener">${esc(creatorName || 'Creator')}</a>`
      : esc(creatorName || 'Creator');
    const provider = providerName
      ? providerUrl
        ? `<a href="${esc(providerUrl)}" target="_blank" rel="noopener">${esc(providerName)}</a>`
        : esc(providerName)
      : '';
    return `Photo: ${creator}${provider ? ` / ${provider}` : ''}`;
  }

  function hasVisibleCredit(image) {
    if (!image) return false;
    const credit = image.credit || {};
    return Boolean(
      credit.attributionRequired ||
      credit.attributionRecommended ||
      ['unsplash', 'pexels'].includes(image.provider)
    );
  }

  function statusTokens(post) {
    const state = DF.model.effectiveState(post);
    return state === 'live' ? [] : [state.toUpperCase()];
  }

  function tile(post, index) {
    const category = DF.model.CATEGORIES[post.category];
    const type = DF.model.LISTING_TYPES[post.listingType];
    const article = document.createElement('article');
    const state = DF.model.effectiveState(post);
    article.className = `listing-tile ${sizes[index % sizes.length]} ${post.image ? 'has-image' : 'text-only'} ${state}`;
    article.tabIndex = 0;
    article.dataset.postId = post.id;

    article.innerHTML = `
      ${post.image ? `<div class="tile-media" style="background-image:url('${esc(imageUrl(post.image))}')"></div>` : ''}
      <div class="tile-shade"></div>
      <div class="tile-watermark">${esc(category.code)}</div>
      <div class="tile-content">
        <div class="tile-header"><span class="category-code">${esc(category.mark)} ${esc(category.code)}</span><span class="listing-id">${esc(post.id)}</span></div>
        <div class="tile-state-line"><span class="listing-type">${esc(type.short)}</span>${statusTokens(post).map(token => `<span class="state-token">${esc(token)}</span>`).join('')}</div>
        <div class="tile-copy"><div class="value-label">${esc(post.valueLabel)}</div><h2>${esc(post.title)}</h2><p>${esc(post.body)}</p></div>
        ${hasVisibleCredit(post.image) ? `<div class="photo-credit">${imageCredit(post.image)}</div>` : ''}
        <div class="tile-footer"><span>${esc(post.district)}</span><span>${DF.model.relativeTime(post.createdAt)} // ${DF.model.expiryLabel(post.expiresAt)}</span></div>
      </div>`;

    article.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', event => event.stopPropagation());
    });
    return article;
  }

  function reviewCard(post) {
    const category = DF.model.CATEGORIES[post.category];
    const type = DF.model.LISTING_TYPES[post.listingType];
    return `<article class="review-card ${post.image ? 'has-image' : 'text-only'}">
      ${post.image ? `<div class="review-image" style="background-image:url('${esc(imageUrl(post.image, 'expanded'))}')"></div>` : ''}
      <div class="review-body">
        <div class="review-top"><span>${esc(category.mark)} ${esc(category.code)}</span><span>${esc(type.short)}</span></div>
        <div class="review-value">${esc(post.valueLabel)}</div>
        <h3>${esc(post.title)}</h3>
        <p>${esc(post.body)}</p>
        <dl>
          <div><dt>DISTRICT</dt><dd>${esc(post.district)}</dd></div>
          <div><dt>CONTACT</dt><dd>${esc(post.contactMethod)}</dd></div>
          <div><dt>EXPIRES</dt><dd>${esc(DF.model.expiryLabel(post.expiresAt))}</dd></div>
        </dl>
        ${hasVisibleCredit(post.image) ? `<div class="photo-credit">${imageCredit(post.image)}</div>` : ''}
      </div>
    </article>`;
  }

  function readerMarkup(post) {
    const category = DF.model.CATEGORIES[post.category];
    const type = DF.model.LISTING_TYPES[post.listingType];
    return `<article class="reader-card">
      <button class="icon-close" data-action="close-reader" aria-label="Close">×</button>
      ${post.image
        ? `<div class="reader-image" style="background-image:url('${esc(imageUrl(post.image, 'expanded'))}')"></div>`
        : `<div class="reader-image reader-text-image"><span>${esc(category.code)}</span></div>`}
      <div class="reader-copy">
        <div class="reader-kicker">${esc(type.label)} // ${esc(category.label)} // ${esc(post.id)}</div>
        <div class="reader-value">${esc(post.valueLabel)}</div>
        <h2>${esc(post.title)}</h2>
        <p>${esc(post.body)}</p>
        <dl class="reader-details">
          <div><dt>POSTER</dt><dd>${esc(post.posterAlias)}</dd></div>
          <div><dt>DISTRICT</dt><dd>${esc(post.district)}</dd></div>
          <div><dt>CONTACT</dt><dd>${esc(post.contactMethod)}</dd></div>
          <div><dt>EXPIRES</dt><dd>${esc(DF.model.expiryLabel(post.expiresAt))}</dd></div>
        </dl>
        ${hasVisibleCredit(post.image) ? `<div class="reader-credit">${imageCredit(post.image)}</div>` : ''}
        <div class="reader-actions"><button class="button primary" data-action="close-reader">RETURN TO DRIPFEED</button></div>
      </div>
    </article>`;
  }

  DF.render = { $, esc, tile, reviewCard, readerMarkup, imageCredit, imageUrl, hasVisibleCredit };
})(window.Dripfeed = window.Dripfeed || {});
