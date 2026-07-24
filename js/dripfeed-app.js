/*==================================================
  DRIPFEED APPLICATION

  Own renderer and interaction model. The terminal supplies the chamber and
  shared camera; RedWire's article renderer is not involved.
==================================================*/

(function (DF) {
  function categoryButtons() {
    return Object.entries(DF.model.CATEGORIES)
      .map(([key, value]) => `<button class="filter-chip" data-category="${key}">${value.mark} ${value.label}</button>`)
      .join('');
  }

  function shell() {
    return `<div class="dripfeed-app">
      <nav class="dripfeed-filter-rail" aria-label="Classified categories">
        <div class="filter-chips">
          <button class="filter-chip active" data-category="all">ALL SIGNALS</button>
          ${categoryButtons()}
        </div>
        <button class="button primary filter-transmit" data-action="open-submit">+ TRANSMIT</button>
      </nav>

      <section class="dripfeed-utility-rail">
        <div class="system-line">
          <span class="online">● SYSTEM ONLINE</span>
          <span>TERMINAL ${DF.render.esc(DF.config.terminalId)}</span>
          <span id="clock">--:--:--</span>
          <span id="api-mode">UNSPLASH DEMO</span>
        </div>
        <label class="search-box">⌕ <input id="feed-search" type="search" placeholder="Search classified transmissions…"></label>
        <div class="display-note"><strong id="result-count">0</strong> TRANSMISSIONS</div>
        <button class="button reset-local" data-action="reset">RESET LOCAL</button>
      </section>

      <main class="demo-stage" data-depth-host>
        <section class="listing-wall live-wall" data-depth-plane="live"></section>
      </main>

      <footer class="drip-footer">
        <div><strong>DRIPFEED:</strong> Public classified transmissions routed through terminal ${DF.render.esc(DF.config.terminalId)}.</div>
        <div>DRIP™ reminds you that dissatisfaction is a treatable market condition.</div>
      </footer>

      <section class="overlay reader-overlay" data-overlay="reader" aria-hidden="true"><div data-reader-target></div></section>
      <section class="overlay submit-overlay" data-overlay="submit" aria-hidden="true">
        <article class="submit-card">
          <button class="icon-close" data-submit-action="close" aria-label="Close">×</button>
          <header class="submit-header">
            <div class="eyebrow">DRIPFEED PUBLIC TRANSMISSION</div>
            <h2>Place a classified</h2>
            <p>Three steps. No account. Your terminal identity remains visible only to you.</p>
          </header>
          <div class="stepper">
            <div data-step-indicator="1" class="active"><span>01</span> DETAILS</div>
            <div data-step-indicator="2"><span>02</span> IMAGE</div>
            <div data-step-indicator="3"><span>03</span> REVIEW</div>
          </div>
          <form id="submit-form" novalidate>
            <section class="wizard-panel active" data-wizard-step="1">
              <div class="form-columns">
                <div class="field"><label>POSTER NAME / HANDLE</label><input id="poster-alias" maxlength="40" required placeholder="WrenchWitch"></div>
                <div class="field"><label>TRANSMISSION TYPE</label><select id="listing-type"><option value="offer">Offering</option><option value="wanted">Wanted</option><option value="event">Public notice / event</option></select></div>
                <div class="field full"><label>HEADLINE</label><input id="listing-title" maxlength="90" required placeholder="What are you offering or looking for?"></div>
                <div class="field"><label>CATEGORY</label><select id="listing-category">${Object.entries(DF.model.CATEGORIES).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}</select></div>
                <div class="field"><label>DISTRICT</label><input id="district" maxlength="45" required placeholder="Watson"></div>
                <div class="field"><label>PRICE / COMPENSATION</label><input id="value-label" maxlength="30" required placeholder="€$200 / NEGOTIABLE / FREE"></div>
                <div class="field"><label>CONTACT METHOD</label><input id="contact-method" maxlength="55" required placeholder="PING DF-706 / dead drop / venue"></div>
                <div class="field"><label>EXPIRES AFTER</label><select id="expiry-days"><option value="1">24 hours</option><option value="3" selected>3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></div>
                <div class="field full"><label>DETAILS</label><textarea id="listing-body" maxlength="520" required placeholder="Condition, requirements, collection point, restrictions…"></textarea></div>
              </div>
              <div class="wizard-actions"><span></span><button type="button" class="button primary" data-submit-action="next">IMAGE →</button></div>
            </section>

            <section class="wizard-panel" data-wizard-step="2">
              <div class="image-source-tabs">
                <button type="button" class="source-tab active" data-image-source="unsplash">SEARCH UNSPLASH</button>
                <button type="button" class="source-tab" data-image-source="url">IMAGE URL</button>
                <button type="button" class="source-tab" data-image-source="none">TEXT ONLY</button>
              </div>
              <div class="source-panel active" data-source-panel="unsplash">
                <div class="unsplash-bar"><input id="unsplash-query" type="search" value="neon city" maxlength="80"><select id="unsplash-orientation"><option value="">Any shape</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="squarish">Square</option></select><button type="button" class="button primary" data-submit-action="search">SEARCH</button></div>
                <p class="network-note"><strong>The image stays on Unsplash.</strong> Dripfeed stores its URL, photo ID and attribution metadata—not a copy of the file.</p>
                <div id="picker-state" class="picker-state">Search to choose an image.</div>
                <div id="photo-results" class="photo-results"></div>
                <div class="result-pager"><button type="button" class="button" data-submit-action="prev">PREV</button><button type="button" class="button" data-submit-action="next-results">NEXT</button></div>
              </div>
              <div class="source-panel" data-source-panel="url"><div class="field"><label>PUBLIC HTTPS IMAGE URL</label><input id="custom-image-url" type="url" placeholder="https://…"></div><p class="network-note">Only publish an image you own or have permission to use. Dripfeed does not re-host it.</p></div>
              <div class="source-panel" data-source-panel="none"><div class="text-only-sample"><strong>TEXT-ONLY PLATE</strong><span>The category code becomes the visual anchor.</span></div></div>
              <div id="selected-image-preview" class="selected-image-preview"></div>
              <div class="wizard-actions"><button type="button" class="button" data-submit-action="back">← DETAILS</button><button type="button" class="button primary" data-submit-action="next">REVIEW →</button></div>
            </section>

            <section class="wizard-panel" data-wizard-step="3">
              <div id="review-target"></div>
              <label class="confirm-row"><input id="image-safeguard" type="checkbox"><span>I will not use an identifiable person’s photograph to falsely imply criminal, sexual, medical or defamatory conduct.</span></label>
              <label class="confirm-row"><input id="review-confirm" type="checkbox"><span>I have checked the price, district, contact method and expiry.</span></label>
              <div class="wizard-actions"><button type="button" class="button" data-submit-action="back">← IMAGE</button><button type="button" class="button primary" data-submit-action="transmit">TRANSMIT</button></div>
            </section>
          </form>
        </article>
      </section>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>`;
  }

  class App {
    constructor(root, options = {}) {
      this.root = root;
      this.store = options.store || new DF.model.Store();
      this.unsplash = options.unsplash || new DF.unsplash.UnsplashClient(DF.config);
      this.state = { category: 'all', query: '', active: null };
      this.depth = options.depthAdapter || new DF.depth.SharedDepthAdapter(this);
      this.readerTransition = options.readerTransition || new DF.readerTransition.ReaderTransition(this);
      this.submit = new DF.submit.SubmitController(this);
    }

    mount() {
      if (this.mounted) return this;
      this.mounted = true;
      this.root.innerHTML = shell();
      this.bind();
      this.submit.bind();
      this.depth.bind();
      this.render();
      this.updateClock();
      this.clockTimer = setInterval(() => this.updateClock(), 1000);
      return this;
    }

    bind() {
      this.root.addEventListener('click', event => {
        const category = event.target.closest('[data-category]')?.dataset.category;
        if (category) {
          this.state.category = category;
          this.render();
          return;
        }

        const tile = event.target.closest('[data-post-id]');
        if (tile) {
          const post = this.store.posts.find(candidate => candidate.id === tile.dataset.postId);
          if (post) this.openReader(post, tile);
          return;
        }

        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'open-submit') this.submit.open();
        if (action === 'reset') {
          this.store.clearLocal();
          this.state = { category: 'all', query: '', active: null };
          const search = this.root.querySelector('#feed-search');
          if (search) search.value = '';
          this.render();
          this.toast('Local classified posts cleared.');
        }
        if (action === 'close-reader') this.readerTransition.close();
      });

      this.root.addEventListener('keydown', event => {
        const tile = event.target.closest('[data-post-id]');
        if (!tile || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        tile.click();
      });

      this.root.querySelector('#feed-search')?.addEventListener('input', event => {
        this.state.query = event.target.value;
        this.renderWall();
      });

      this.root.querySelector('[data-overlay="reader"]')?.addEventListener('click', event => {
        if (event.target === event.currentTarget) this.readerTransition.close();
      });
      this.root.querySelector('[data-overlay="submit"]')?.addEventListener('click', event => {
        if (event.target === event.currentTarget) this.submit.close();
      });
    }

    visiblePosts() {
      const query = this.state.query.trim().toLowerCase();
      return this.store.posts.filter(post => {
        if (DF.model.effectiveState(post) === 'removed') return false;
        const categoryMatch = this.state.category === 'all' || post.category === this.state.category;
        const text = `${post.title} ${post.body} ${post.posterAlias} ${post.district} ${post.valueLabel}`.toLowerCase();
        return categoryMatch && (!query || text.includes(query));
      });
    }

    render() {
      this.root.querySelectorAll('[data-category]').forEach(button => {
        button.classList.toggle('active', button.dataset.category === this.state.category);
      });
      this.renderWall();
    }

    renderWall() {
      const visible = this.visiblePosts();
      const wall = this.root.querySelector('.live-wall');
      wall.replaceChildren(...visible.map((post, index) => DF.render.tile(post, index)));

      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<strong>NO MATCHING TRANSMISSIONS</strong><span>Change the category filter or search.</span>';
        wall.append(empty);
      }

      const count = this.root.querySelector('#result-count');
      if (count) count.textContent = visible.length;
      this.depth.afterRender();
    }

    openReader(post, sourceElement) {
      return this.readerTransition.open(post, sourceElement);
    }

    openOverlay(name) {
      const overlay = this.root.querySelector(`[data-overlay="${name}"]`);
      overlay?.classList.add('open');
      overlay?.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    closeOverlay(name) {
      if (name === 'reader') {
        this.readerTransition.close({ immediate: true });
        return;
      }
      const overlay = this.root.querySelector(`[data-overlay="${name}"]`);
      overlay?.classList.remove('open');
      overlay?.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    toast(message) {
      const element = this.root.querySelector('.toast');
      if (!element) return;
      element.textContent = message;
      element.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
    }

    updateClock() {
      const element = this.root.querySelector('#clock');
      if (element) element.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    }

    updateApiMode(mode) {
      const element = this.root.querySelector('#api-mode');
      if (element) element.textContent = mode === 'live' ? 'UNSPLASH LIVE' : 'UNSPLASH DEMO';
    }

    activate() {
      this.root.hidden = false;
      this.depth.resume?.();
      this.render();
    }

    deactivate() {
      this.depth.pause?.();
      this.readerTransition.close({ immediate: true });
      this.closeOverlay('submit');
    }

    destroy() {
      clearInterval(this.clockTimer);
      this.readerTransition.destroy?.();
      this.depth.destroy?.();
      this.root.replaceChildren();
      this.mounted = false;
    }

    getDepthPlaneDefinitions() {
      return this.depth.getPlaneDefinitions?.() || [];
    }
  }

  DF.App = App;
  DF.mount = (root, options = {}) => {
    if (!root) return null;
    if (root.__dripfeedApp) return root.__dripfeedApp;
    const app = new App(root, options).mount();
    root.__dripfeedApp = app;
    return app;
  };
})(window.Dripfeed = window.Dripfeed || {});
