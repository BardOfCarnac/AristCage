(function (DF) {
  class SubmitController {
    constructor(app) {
      this.app = app;
      this.step = 1;
      this.source = 'unsplash';
      this.selectedPhoto = null;
      this.committedPhotoKey = '';
      this.results = [];
      this.page = 1;
      this.totalPages = 1;
      this.searchRequest = 0;
    }

    open() {
      this.step = 1;
      this.source = 'unsplash';
      this.update();
      this.app.openOverlay('submit');
      if (!this.results.length) this.search();
    }

    close() { this.app.closeOverlay('submit'); }

    isNetworkSource(source = this.source) {
      return ['unsplash', 'pexels'].includes(source);
    }

    providerLabel(source = this.source) {
      if (!this.isNetworkSource(source)) return '';
      try {
        return this.app.images.get(source).label;
      } catch (error) {
        return source;
      }
    }

    bind() {
      const root = this.app.root;
      root.addEventListener('click', event => {
        const action = event.target.closest('[data-submit-action]')?.dataset.submitAction;
        if (!action) return;
        if (action === 'close') this.close();
        if (action === 'next') this.next();
        if (action === 'back') { this.step = Math.max(1, this.step - 1); this.update(); }
        if (action === 'search') { this.page = 1; this.search(); }
        if (action === 'prev' && this.page > 1) { this.page -= 1; this.search(); }
        if (action === 'next-results' && this.page < this.totalPages) { this.page += 1; this.search(); }
        if (action === 'transmit') this.transmit();
        if (action === 'reset-form') this.resetForm();

        const source = event.target.closest('[data-image-source]')?.dataset.imageSource;
        if (source) this.changeSource(source);

        const photoButton = event.target.closest('[data-photo-index]');
        if (photoButton) this.selectPhoto(this.results[Number(photoButton.dataset.photoIndex)]);
      });

      root.addEventListener('keydown', event => {
        if (event.target.matches('#image-query') && event.key === 'Enter') {
          event.preventDefault();
          this.page = 1;
          this.search();
        }
      });

      root.addEventListener('input', event => {
        if (event.target.matches('#custom-image-url')) this.updateSelectedPreview();
        if (this.step === 3) this.updateReview();
      });

      root.addEventListener('change', event => {
        if (this.step === 3 || event.target.matches('[name="image-source"]')) this.updateReview();
      });
    }

    formValue(id) { return this.app.root.querySelector('#' + id)?.value.trim() || ''; }

    changeSource(source) {
      const changed = source !== this.source;
      this.source = source;
      if (changed && this.isNetworkSource(source)) {
        this.selectedPhoto = null;
        this.committedPhotoKey = '';
        this.results = [];
        this.page = 1;
        this.totalPages = 1;
      }
      this.update();
      if (changed && this.isNetworkSource(source)) this.search();
    }

    validateDetails() {
      const required = ['poster-alias', 'listing-title', 'listing-body', 'district', 'value-label', 'contact-method'];
      const missing = required.find(id => !this.formValue(id));
      if (missing) {
        this.app.toast('Complete every transmission detail first.');
        this.app.root.querySelector('#' + missing)?.focus();
        return false;
      }
      return true;
    }

    async next() {
      if (this.step === 1 && !this.validateDetails()) return;
      if (this.step === 2) {
        if (this.isNetworkSource() && !this.selectedPhoto) {
          this.app.toast(`Choose a ${this.providerLabel()} image or select text only.`);
          return;
        }
        if (this.source === 'url' && !this.formValue('custom-image-url').startsWith('https://')) {
          this.app.toast('Enter a public HTTPS image URL.');
          return;
        }
        if (this.isNetworkSource()) {
          const committed = await this.commitSelection();
          if (!committed) return;
        }
      }
      this.step = Math.min(3, this.step + 1);
      this.update();
    }

    update() {
      this.app.root.querySelectorAll('[data-wizard-step]').forEach(panel => {
        panel.classList.toggle('active', Number(panel.dataset.wizardStep) === this.step);
      });
      this.app.root.querySelectorAll('[data-step-indicator]').forEach(indicator => {
        const number = Number(indicator.dataset.stepIndicator);
        indicator.classList.toggle('active', number === this.step);
        indicator.classList.toggle('complete', number < this.step);
      });
      this.app.root.querySelectorAll('[data-image-source]').forEach(button => {
        button.classList.toggle('active', button.dataset.imageSource === this.source);
      });
      this.app.root.querySelectorAll('[data-source-panel]').forEach(panel => {
        const expected = this.isNetworkSource() ? 'network' : this.source;
        panel.classList.toggle('active', panel.dataset.sourcePanel === expected);
      });
      this.updateProviderNotice();
      if (this.step === 3) this.updateReview();
      this.updateSelectedPreview();
      this.renderResults();
    }

    updateProviderNotice() {
      const element = this.app.root.querySelector('#provider-note');
      if (!element || !this.isNetworkSource()) return;
      if (this.source === 'unsplash') {
        element.innerHTML = '<strong>Unsplash images stay hotlinked.</strong> Dripfeed stores the returned image URL, source ID and attribution metadata. Selection is registered only when you continue to review.';
      } else {
        element.innerHTML = '<strong>Pexels is a separate source.</strong> Dripfeed preserves its photographer and provider links, and never presents the picker as a replacement stock library.';
      }
    }

    async search() {
      if (!this.isNetworkSource()) return;
      const query = this.formValue('image-query');
      if (query.length < 2) { this.setPickerState('Enter at least two characters.'); return; }
      const requestId = ++this.searchRequest;
      this.setPickerState(`Searching ${this.providerLabel()}…`);
      try {
        const payload = await this.app.images.search({
          provider: this.source,
          query,
          page: this.page,
          orientation: this.formValue('image-orientation')
        });
        if (requestId !== this.searchRequest || payload.provider !== this.source) return;
        this.results = payload.results || [];
        this.totalPages = Math.max(1, payload.totalPages || 1);
        this.renderResults();
        this.setPickerState(`${payload.mode === 'live' ? 'LIVE' : 'DEMO'} ${this.providerLabel().toUpperCase()} // ${payload.total || this.results.length} RESULTS // PAGE ${this.page}/${this.totalPages}`);
        this.app.updateApiMode(this.source, payload.mode);
      } catch (error) {
        if (requestId !== this.searchRequest) return;
        this.setPickerState('IMAGE NETWORK ERROR // ' + error.message);
        this.app.toast(`${this.providerLabel()} search failed.`);
      }
    }

    setPickerState(text) {
      const element = this.app.root.querySelector('#picker-state');
      if (element) element.textContent = text;
    }

    renderResults() {
      const container = this.app.root.querySelector('#photo-results');
      if (!container) return;
      container.innerHTML = this.results.map((photo, index) => {
        const selected = this.selectedPhoto?.id === photo.id && this.selectedPhoto?.provider === photo.provider;
        const provider = photo.provider === 'pexels' ? 'PEXELS' : 'UNSPLASH';
        return `<button type="button" class="photo-result ${selected ? 'selected' : ''}" data-photo-index="${index}" aria-pressed="${selected}"><img src="${DF.render.esc(photo.urls.small || photo.urls.thumb)}" alt="${DF.render.esc(photo.alt || `${provider} result`)}" loading="lazy"><span class="photo-result-meta"><b>${provider}</b><span>${DF.render.esc(photo.photographer.name)}</span></span></button>`;
      }).join('');
      const previous = this.app.root.querySelector('[data-submit-action="prev"]');
      const next = this.app.root.querySelector('[data-submit-action="next-results"]');
      if (previous) previous.disabled = this.page <= 1;
      if (next) next.disabled = this.page >= this.totalPages;
    }

    selectPhoto(photo) {
      this.selectedPhoto = photo;
      this.committedPhotoKey = '';
      this.renderResults();
      this.updateSelectedPreview();
      const tracking = this.app.root.querySelector('#tracking-state');
      if (tracking) tracking.textContent = 'Selection staged. It will be committed when you continue to review.';
    }

    async commitSelection() {
      const photo = this.selectedPhoto;
      if (!photo) return false;
      const key = `${photo.provider}:${photo.id}`;
      if (this.committedPhotoKey === key) return true;
      const tracking = this.app.root.querySelector('#tracking-state');
      if (tracking) tracking.textContent = `Committing ${this.providerLabel(photo.provider)} selection…`;
      try {
        const result = await this.app.images.registerSelection(photo);
        if (result.reason === 'not-configured' && photo.usage?.selectionTrackingRequired && !photo.demo) {
          if (tracking) tracking.textContent = 'Selection tracking endpoint is not configured.';
          this.app.toast('This live source cannot be used until its selection endpoint is connected.');
          return false;
        }
        this.committedPhotoKey = key;
        if (tracking) {
          tracking.textContent = result.tracked
            ? `Selection registered with ${this.providerLabel(photo.provider)}.`
            : result.reason === 'already-tracked'
              ? 'Selection already registered.'
              : photo.demo
                ? 'Demo selection: no provider event required.'
                : 'Selection committed: no provider event required.';
        }
        return true;
      } catch (error) {
        if (tracking) tracking.textContent = 'Selection error: ' + error.message;
        this.app.toast('The image could not be committed.');
        return false;
      }
    }

    selectedImage() {
      if (this.source === 'none') return null;
      if (this.source === 'url') {
        const url = this.formValue('custom-image-url');
        return DF.model.normaliseStoryImage({
          provider: 'custom',
          url,
          alt: '',
          urls: { thumbnail: url, display: url, expanded: url },
          usage: { hotlinkRequired: false, selectionTrackingRequired: false, localCopyAllowed: false }
        });
      }
      if (!this.selectedPhoto) return null;
      return DF.model.normaliseStoryImage(this.app.images.toStoryImage(this.selectedPhoto));
    }

    draft() {
      const days = Number(this.formValue('expiry-days') || 3);
      const now = new Date(DF.config.worldNow);
      return {
        listingType: this.formValue('listing-type') || 'offer',
        category: this.formValue('listing-category') || 'items',
        title: this.formValue('listing-title'),
        body: this.formValue('listing-body'),
        posterAlias: this.formValue('poster-alias'),
        district: this.formValue('district'),
        valueLabel: this.formValue('value-label'),
        contactMethod: this.formValue('contact-method'),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + days * 86400000).toISOString(),
        publicationState: 'live',
        image: this.selectedImage()
      };
    }

    cropPreviews(image) {
      const url = DF.render.imageUrl(image, 'expanded');
      if (!url) return '';
      return `<div class="crop-preview-grid" aria-label="Dripfeed tile crop previews">
        <figure class="crop-preview crop-square"><div style="background-image:url('${DF.render.esc(url)}')"></div><figcaption>1×1</figcaption></figure>
        <figure class="crop-preview crop-wide"><div style="background-image:url('${DF.render.esc(url)}')"></div><figcaption>2×1</figcaption></figure>
        <figure class="crop-preview crop-tall"><div style="background-image:url('${DF.render.esc(url)}')"></div><figcaption>1×2</figcaption></figure>
        <figure class="crop-preview crop-feature"><div style="background-image:url('${DF.render.esc(url)}')"></div><figcaption>2×2</figcaption></figure>
      </div>`;
    }

    updateSelectedPreview() {
      const box = this.app.root.querySelector('#selected-image-preview');
      if (!box) return;
      const image = this.selectedImage();
      if (!image) {
        box.classList.remove('active');
        box.innerHTML = '';
        return;
      }
      const credit = DF.render.imageCredit(image) || (image.provider === 'custom' ? 'User-supplied image URL' : 'Dripfeed demo image');
      const providerLabel = image.credit?.providerName || image.provider;
      box.classList.add('active');
      box.innerHTML = `<img src="${DF.render.esc(DF.render.imageUrl(image, 'thumbnail'))}" alt=""><div class="selected-image-copy"><strong>${DF.render.esc(providerLabel.toUpperCase())} IMAGE STAGED</strong><p>${credit}</p><p id="tracking-state">${this.committedPhotoKey ? 'Selection committed.' : 'Selection staged. Continue to review to commit it.'}</p>${this.cropPreviews(image)}</div>`;
    }

    updateReview() {
      const target = this.app.root.querySelector('#review-target');
      if (target) target.innerHTML = DF.render.reviewCard(this.draft());
    }

    transmit() {
      const draft = this.draft();
      if (draft.image && !this.app.root.querySelector('#image-safeguard')?.checked) {
        this.app.toast('Confirm the image-use safeguard first.');
        return;
      }
      if (!this.app.root.querySelector('#review-confirm')?.checked) {
        this.app.toast('Confirm that the listing is ready to publish.');
        return;
      }
      this.app.store.add(draft);
      this.app.state.category = 'all';
      this.app.state.query = '';
      const search = this.app.root.querySelector('#feed-search');
      if (search) search.value = '';
      this.app.render();
      this.close();
      this.resetForm();
      this.app.toast('Transmission added to Dripfeed.');
    }

    resetForm() {
      this.app.root.querySelector('#submit-form')?.reset();
      this.step = 1;
      this.source = 'unsplash';
      this.selectedPhoto = null;
      this.committedPhotoKey = '';
      this.results = [];
      this.page = 1;
      this.totalPages = 1;
      this.update();
    }
  }

  DF.submit = { SubmitController };
})(window.Dripfeed = window.Dripfeed || {});
