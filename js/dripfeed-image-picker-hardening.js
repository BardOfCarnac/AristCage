/*==================================================
  DRIPFEED · IMAGE PICKER HARDENING

  Dripfeed-owned provider compliance and submit-lifecycle corrections. This
  publication does not enter Optical, Weather, Chamber Movement or frame paths.
==================================================*/
(function (DF) {
  'use strict';

  const SearchProvider = DF.images?.SearchProvider;
  const Registry = DF.images?.Registry;
  const SubmitController = DF.submit?.SubmitController;
  const App = DF.App;
  if (!SearchProvider || !Registry || !SubmitController || !App) return;

  const providerPrototype = SearchProvider.prototype;
  const registryPrototype = Registry.prototype;
  const submitPrototype = SubmitController.prototype;
  const appPrototype = App.prototype;
  const demoSearch = providerPrototype.search;
  const originalResetForm = submitPrototype.resetForm;
  const originalMount = appPrototype.mount;
  const originalDeactivate = appPrototype.deactivate;
  const originalDestroy = appPrototype.destroy;
  let selectionSequence = 0;

  function abortException() {
    try {
      return new DOMException('The operation was aborted.', 'AbortError');
    } catch (error) {
      const fallback = new Error('The operation was aborted.');
      fallback.name = 'AbortError';
      return fallback;
    }
  }

  function abortable(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortException());
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortException());
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(promise).then(
        value => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        error => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }

  function endpointUrl(endpoint) {
    const base = document?.baseURI || window.location?.href || 'http://localhost/';
    return new URL(String(endpoint || ''), base);
  }

  function providerHome(provider) {
    return provider === 'pexels' ? 'https://www.pexels.com/' : 'https://unsplash.com/';
  }

  function referralUrl(value, provider) {
    if (!value || value === '#') return value || '';
    try {
      const url = endpointUrl(value);
      if (provider === 'unsplash') {
        url.searchParams.set('utm_source', 'night_city_news');
        url.searchParams.set('utm_medium', 'referral');
      }
      return url.toString();
    } catch (error) {
      return '';
    }
  }

  function authoritativePhoto(provider, raw) {
    const photo = DF.images.normaliseRemotePhoto(provider, raw) || {};
    const unsplash = provider === 'unsplash';
    return {
      ...photo,
      provider,
      photographer: {
        name: String(photo.photographer?.name || 'Unknown creator'),
        url: referralUrl(photo.photographer?.url, provider)
      },
      photoUrl: referralUrl(photo.photoUrl, provider),
      providerUrl: referralUrl(providerHome(provider), provider),
      usage: {
        hotlinkRequired: unsplash,
        selectionTrackingRequired: unsplash,
        localCopyAllowed: !unsplash
      }
    };
  }

  function safeHref(value) {
    if (!value || value === '#') return '';
    try {
      const url = endpointUrl(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch (error) {
      return '';
    }
  }

  function linkOrText(url, label, className = '') {
    const safe = safeHref(url);
    const text = DF.render.esc(label || 'Unknown creator');
    if (!safe) return `<span class="${className}">${text}</span>`;
    return `<a class="${className}" href="${DF.render.esc(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  providerPrototype.search = async function search(request = {}) {
    const query = String(request.query || '');
    const page = Math.max(1, Number(request.page || 1));
    const orientation = String(request.orientation || '');
    const signal = request.signal;

    if (!this.live) {
      const payload = await abortable(
        demoSearch.call(this, { query, page, orientation }),
        signal
      );
      return {
        ...payload,
        provider: this.id,
        results: (payload.results || []).map(photo => authoritativePhoto(this.id, photo))
      };
    }

    const url = endpointUrl(this.searchEndpoint);
    url.searchParams.set('provider', this.id);
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    if (orientation) url.searchParams.set('orientation', orientation);

    const response = await fetch(url, {
      signal,
      headers: { accept: 'application/json' }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `${this.label} search failed`);

    return {
      provider: this.id,
      page: Number(payload.page || page),
      total: Number(payload.total || 0),
      totalPages: Math.max(1, Number(payload.totalPages || payload.total_pages || 1)),
      results: (payload.results || payload.photos || [])
        .map(photo => authoritativePhoto(this.id, photo))
        .filter(photo => photo.id && (photo.urls?.small || photo.urls?.regular)),
      mode: 'live'
    };
  };

  providerPrototype.registerSelection = function registerSelection(photo, context = {}) {
    const selected = authoritativePhoto(this.id, photo);
    if (!selected.id || selected.provider !== this.id || selected.demo) {
      return Promise.resolve({ tracked: false, reason: 'not-required' });
    }
    if (!selected.usage.selectionTrackingRequired) {
      return Promise.resolve({ tracked: false, reason: 'not-required' });
    }
    if (!this.trackEndpoint) {
      return Promise.resolve({ tracked: false, reason: 'not-configured' });
    }

    const eventKey = String(context.eventKey || '').trim();
    if (!eventKey) {
      return Promise.reject(new TypeError(`${this.label} selection tracking requires an event key.`));
    }

    this.selectionEvents ||= new Map();
    if (this.selectionEvents.has(eventKey)) return this.selectionEvents.get(eventKey);

    const operation = (async () => {
      const response = await fetch(endpointUrl(this.trackEndpoint), {
        method: 'POST',
        signal: context.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: this.id,
          providerImageId: selected.id,
          selectionTrackingUrl: selected.downloadLocation
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `${this.label} selection tracking failed`);
      return { tracked: true };
    })();

    this.selectionEvents.set(eventKey, operation);
    operation.catch(() => this.selectionEvents.delete(eventKey));
    if (this.selectionEvents.size > 256) {
      const oldest = this.selectionEvents.keys().next().value;
      if (oldest && oldest !== eventKey) this.selectionEvents.delete(oldest);
    }
    return operation;
  };

  providerPrototype.toStoryImage = function toStoryImage(photo) {
    const image = authoritativePhoto(this.id, photo);
    return {
      provider: this.id,
      providerImageId: image.id,
      id: image.id,
      url: image.urls.regular || image.urls.small,
      alt: image.alt,
      width: image.width,
      height: image.height,
      orientation: image.orientation,
      colour: image.colour,
      blurHash: image.blurHash,
      urls: {
        thumbnail: image.urls.thumb,
        display: image.urls.small || image.urls.regular,
        expanded: image.urls.regular || image.urls.full
      },
      credit: {
        creatorName: image.photographer.name,
        creatorUrl: image.photographer.url,
        providerName: this.label,
        providerUrl: image.providerUrl,
        providerPageUrl: image.photoUrl,
        attributionRequired: this.id === 'unsplash',
        attributionRecommended: true
      },
      usage: {
        hotlinkRequired: image.usage.hotlinkRequired,
        selectionTrackingRequired: image.usage.selectionTrackingRequired,
        localCopyAllowed: image.usage.localCopyAllowed,
        selectionTrackingUrl: image.downloadLocation
      },
      photographer: image.photographer,
      photoUrl: image.photoUrl,
      unsplashUrl: this.id === 'unsplash' ? image.providerUrl : '',
      downloadLocation: image.downloadLocation,
      selectedAt: new Date().toISOString()
    };
  };

  registryPrototype.registerSelection = function registerSelection(photo, context) {
    return this.get(photo.provider).registerSelection(photo, context);
  };

  function prepareSubmit(controller) {
    if (!Object.hasOwn(controller, 'searchAbortController')) controller.searchAbortController = null;
    if (!Object.hasOwn(controller, 'selectionEventKey')) controller.selectionEventKey = '';
    if (!Object.hasOwn(controller, 'commitPromise')) controller.commitPromise = null;
  }

  function selectionEventKey(photo) {
    selectionSequence += 1;
    return `dripfeed-use:${Date.now()}:${selectionSequence}:${photo.provider}:${photo.id}`;
  }

  submitPrototype.open = function open() {
    prepareSubmit(this);
    this.cancelSearch('overlay-open');
    this.step = 1;
    this.source = 'unsplash';
    this.selectedPhoto = null;
    this.committedPhotoKey = '';
    this.selectionEventKey = '';
    this.commitPromise = null;
    this.results = [];
    this.page = 1;
    this.totalPages = 1;
    this.update();
    this.app.openOverlay('submit');
    this.search();
  };

  submitPrototype.cancelSearch = function cancelSearch(reason = 'cancelled') {
    prepareSubmit(this);
    this.searchRequest += 1;
    this.searchAbortController?.abort?.(reason);
    this.searchAbortController = null;
    return true;
  };

  submitPrototype.close = function close() {
    this.cancelSearch('overlay-close');
    this.app.closeOverlay('submit');
  };

  submitPrototype.changeSource = function changeSource(source) {
    prepareSubmit(this);
    const changed = source !== this.source;
    if (changed) this.cancelSearch('source-change');
    this.source = source;
    if (changed) {
      this.selectedPhoto = null;
      this.committedPhotoKey = '';
      this.selectionEventKey = '';
      this.commitPromise = null;
      this.results = [];
      this.page = 1;
      this.totalPages = 1;
    }
    this.update();
    if (changed && this.isNetworkSource(source)) this.search();
  };

  submitPrototype.search = async function search() {
    prepareSubmit(this);
    if (!this.isNetworkSource()) return;
    const query = this.formValue('image-query');
    if (query.length < 2) {
      this.setPickerState('Enter at least two characters.');
      return;
    }

    this.cancelSearch('superseded');
    const requestId = ++this.searchRequest;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    this.searchAbortController = controller;
    const provider = this.source;
    this.setPickerState(`Searching ${this.providerLabel(provider)}…`);

    try {
      const payload = await this.app.images.search({
        provider,
        query,
        page: this.page,
        orientation: this.formValue('image-orientation'),
        signal: controller?.signal
      });
      if (requestId !== this.searchRequest || controller?.signal.aborted || provider !== this.source) return;
      this.results = payload.results || [];
      this.totalPages = Math.max(1, payload.totalPages || 1);
      this.renderResults();
      this.setPickerState(`${payload.mode === 'live' ? 'LIVE' : 'DEMO'} ${this.providerLabel(provider).toUpperCase()} // ${payload.total || this.results.length} RESULTS // PAGE ${this.page}/${this.totalPages}`);
      this.app.updateApiMode(provider, payload.mode);
    } catch (error) {
      if (error?.name === 'AbortError' || requestId !== this.searchRequest) return;
      this.setPickerState('IMAGE NETWORK ERROR // ' + error.message);
      this.app.toast(`${this.providerLabel(provider)} search failed.`);
    } finally {
      if (requestId === this.searchRequest) this.searchAbortController = null;
    }
  };

  submitPrototype.renderResults = function renderResults() {
    const container = this.app.root.querySelector('#photo-results');
    if (!container) return;
    container.innerHTML = this.results.map((photo, index) => {
      const selected = this.selectedPhoto?.id === photo.id && this.selectedPhoto?.provider === photo.provider;
      const provider = photo.provider === 'pexels' ? 'PEXELS' : 'UNSPLASH';
      const creator = linkOrText(photo.photographer?.url, photo.photographer?.name, 'photo-creator-link');
      const providerLink = linkOrText(photo.photoUrl || photo.providerUrl, `VIEW ON ${provider}`, 'photo-provider-link');
      return `<article class="photo-result-shell ${selected ? 'selected' : ''}">
        <button type="button" class="photo-result" data-photo-index="${index}" aria-pressed="${selected}">
          <img src="${DF.render.esc(photo.urls.small || photo.urls.thumb)}" alt="${DF.render.esc(photo.alt || `${provider} result`)}" loading="lazy">
        </button>
        <div class="photo-result-meta"><b>${provider}</b><span>Photo by ${creator}</span>${providerLink}</div>
      </article>`;
    }).join('');
    const previous = this.app.root.querySelector('[data-submit-action="prev"]');
    const next = this.app.root.querySelector('[data-submit-action="next-results"]');
    if (previous) previous.disabled = this.page <= 1;
    if (next) next.disabled = this.page >= this.totalPages;
  };

  submitPrototype.selectPhoto = function selectPhoto(photo) {
    prepareSubmit(this);
    this.selectedPhoto = photo;
    this.committedPhotoKey = '';
    this.selectionEventKey = selectionEventKey(photo);
    this.commitPromise = null;
    this.renderResults();
    this.updateSelectedPreview();
    const tracking = this.app.root.querySelector('#tracking-state');
    if (tracking) tracking.textContent = 'Selection staged. It will be committed when you continue to review.';
  };

  submitPrototype.commitSelection = function commitSelection() {
    prepareSubmit(this);
    const photo = this.selectedPhoto;
    if (!photo) return Promise.resolve(false);
    const key = `${photo.provider}:${photo.id}`;
    if (this.committedPhotoKey === key) return Promise.resolve(true);
    if (this.commitPromise) return this.commitPromise;
    if (!this.selectionEventKey) this.selectionEventKey = selectionEventKey(photo);

    const tracking = this.app.root.querySelector('#tracking-state');
    if (tracking) tracking.textContent = `Committing ${this.providerLabel(photo.provider)} selection…`;

    const operation = (async () => {
      try {
        const result = await this.app.images.registerSelection(photo, {
          eventKey: this.selectionEventKey
        });
        if (result.reason === 'not-configured' && photo.usage?.selectionTrackingRequired && !photo.demo) {
          if (tracking) tracking.textContent = 'Selection tracking endpoint is not configured.';
          this.app.toast('This live source cannot be used until its selection endpoint is connected.');
          return false;
        }
        this.committedPhotoKey = key;
        if (tracking) {
          tracking.textContent = result.tracked
            ? `Selection registered with ${this.providerLabel(photo.provider)}.`
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
    })();

    this.commitPromise = operation.finally(() => {
      if (this.commitPromise) this.commitPromise = null;
    });
    return this.commitPromise;
  };

  submitPrototype.resetForm = function resetForm() {
    prepareSubmit(this);
    this.cancelSearch('form-reset');
    const result = originalResetForm.call(this);
    this.selectionEventKey = '';
    this.commitPromise = null;
    return result;
  };

  appPrototype.mount = function mount() {
    const result = originalMount.call(this);
    if (!this.imageAttributionGuard) {
      this.imageAttributionGuard = event => {
        if (event.target.closest('.photo-credit a, .reader-credit a, .selected-image-preview a, .photo-result-meta a')) {
          event.stopPropagation();
        }
      };
      this.root.addEventListener('click', this.imageAttributionGuard, true);
    }
    return result;
  };

  appPrototype.deactivate = function deactivate() {
    this.submit?.cancelSearch?.('application-deactivate');
    return originalDeactivate.call(this);
  };

  appPrototype.destroy = function destroy() {
    this.submit?.cancelSearch?.('application-destroy');
    if (this.imageAttributionGuard) {
      this.root.removeEventListener('click', this.imageAttributionGuard, true);
      this.imageAttributionGuard = null;
    }
    return originalDestroy.call(this);
  };

  DF.images.authoritativePhoto = authoritativePhoto;
})(window.Dripfeed = window.Dripfeed || {});
