/*==================================================
  DRIPFEED SURFACE CONTROLLER

  Installs the approved Dripfeed mechanics onto the existing independent app.
  This file deliberately stops at the renderer boundary: it publishes coherent
  live, latent and reading surfaces, while the production integration owns their
  chamber positions, occlusion and spatial transitions.
==================================================*/
(function (DF) {
  'use strict';

  if (!DF.App || !DF.mechanics || DF.surface?.installed) return;

  const App = DF.App;
  const Store = DF.model?.Store;
  const SubmitController = DF.submit?.SubmitController;
  const ReaderTransition = DF.readerTransition?.ReaderTransition;
  const originalMount = App.prototype.mount;
  const originalActivate = App.prototype.activate;
  const originalDeactivate = App.prototype.deactivate;
  const originalDestroy = App.prototype.destroy;
  const originalReaderMarkup = DF.render.readerMarkup;
  const originalReviewCard = DF.render.reviewCard;
  const originalStoreAdd = Store?.prototype.add;
  const originalDraft = SubmitController?.prototype.draft;
  const originalReaderClose = ReaderTransition?.prototype.close;

  function category(post) {
    return DF.model.CATEGORIES[post.category] || DF.model.CATEGORIES.items;
  }

  function listingType(post) {
    return DF.model.LISTING_TYPES[post.listingType] || DF.model.LISTING_TYPES.offer;
  }

  function statusTokens(post) {
    const state = DF.model.effectiveState(post);
    return state === 'live' ? [] : [state.toUpperCase()];
  }

  function fontClass(voice) {
    return DF.mechanics.FONT_VOICES[voice]?.className || DF.mechanics.FONT_VOICES.wire.className;
  }

  function treatmentClass(treatment) {
    return DF.mechanics.IMAGE_TREATMENTS[treatment]?.className || '';
  }

  function imageCredit(image) {
    return DF.render.imageCredit(image);
  }

  function tile(post, assignment) {
    const meta = category(post);
    const type = listingType(post);
    const article = document.createElement('article');
    const state = DF.model.effectiveState(post);
    const classes = [
      'listing-tile',
      assignment.className,
      post.image ? 'has-image' : 'text-only',
      state,
      fontClass(assignment.fontVoice),
      treatmentClass(assignment.imageTreatment),
      assignment.role === 'latent' ? 'latent-tile' : 'live-tile'
    ].filter(Boolean);

    article.className = classes.join(' ');
    article.tabIndex = assignment.role === 'live' ? 0 : -1;
    article.dataset.postId = post.id;
    article.dataset.shape = assignment.shape;
    article.dataset.fontVoice = assignment.fontVoice;
    article.dataset.imageTreatment = assignment.imageTreatment;
    article.dataset.surfaceRole = assignment.role;
    article.style.gridColumn = `${assignment.column + 1} / span ${assignment.width}`;
    article.style.gridRow = `${assignment.row + 1} / span ${assignment.height}`;
    article.style.setProperty('--headline-lines', String(assignment.textBudget.headlineLines));
    article.style.setProperty('--body-lines', String(assignment.textBudget.bodyLines));
    article.setAttribute('aria-label', `${type.label}: ${post.title}`);

    article.innerHTML = `
      ${post.image ? `<div class="tile-media" style="background-image:url('${DF.render.esc(post.image.url)}')"></div>` : ''}
      <div class="tile-shade"></div>
      <div class="tile-watermark">${DF.render.esc(meta.code)}</div>
      <div class="tile-content">
        <div class="tile-header"><span class="category-code">${DF.render.esc(meta.mark)} ${DF.render.esc(meta.code)}</span><span class="listing-id">${DF.render.esc(post.id)}</span></div>
        <div class="tile-state-line"><span class="listing-type">${DF.render.esc(type.short)}</span>${statusTokens(post).map(token => `<span class="state-token">${DF.render.esc(token)}</span>`).join('')}</div>
        <div class="tile-copy"><div class="value-label">${DF.render.esc(post.valueLabel)}</div><h2>${DF.render.esc(post.title)}</h2><p>${DF.render.esc(post.body)}</p></div>
        ${post.image?.provider === 'unsplash' ? `<div class="photo-credit">${imageCredit(post.image)}</div>` : ''}
        <div class="tile-footer"><span>${DF.render.esc(post.district)}</span><span>${DF.model.relativeTime(post.createdAt)} // ${DF.model.expiryLabel(post.expiresAt)}</span></div>
      </div>`;

    article.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', event => event.stopPropagation());
    });
    return article;
  }

  function columnsFor(root) {
    const computed = getComputedStyle(root);
    const value = Number(computed.getPropertyValue('--cols')) || 3;
    return Math.max(1, Math.min(6, Math.floor(value)));
  }

  function partition(filtered, memory) {
    const live = [];
    const latent = [];
    const excluded = [];
    filtered.forEach(post => {
      const record = memory.get(post.id);
      if (record.dismissed) {
        excluded.push(post);
        return;
      }
      (memory.shouldRemainLive(post.id) ? live : latent).push(post);
    });
    return Object.freeze({ live, latent, excluded });
  }

  function makeEmptyState(message, detail) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<strong>${DF.render.esc(message)}</strong><span>${DF.render.esc(detail)}</span>`;
    return empty;
  }

  function renderPlan(wall, plan) {
    const nodes = plan.placements.map(assignment => tile(assignment.post, assignment));
    wall.replaceChildren(...nodes);
    wall.style.setProperty('--surface-rows', String(plan.rows));
    wall.dataset.surfaceRows = String(plan.rows);
    return nodes;
  }

  function ensureSurfaceState(app) {
    if (!app.surface) return;
    if (!Object.hasOwn(app.surface, 'active')) app.surface.active = !app.root.hidden;
    if (!Object.hasOwn(app.surface, 'destroyed')) app.surface.destroyed = false;
    if (!Object.hasOwn(app.surface, 'exposureFrame')) app.surface.exposureFrame = null;
    if (!Object.hasOwn(app.surface, 'openSequence')) app.surface.openSequence = 0;
    if (!Object.hasOwn(app.surface, 'pendingOpen')) app.surface.pendingOpen = null;
    if (!Object.hasOwn(app.surface, 'readyPublication')) app.surface.readyPublication = null;
    if (!Object.hasOwn(app.surface, 'lastExcludedCount')) app.surface.lastExcludedCount = 0;
  }

  function clearExposureTracking(app) {
    if (!app.surface) return;
    if (app.surface.exposureFrame != null) cancelAnimationFrame(app.surface.exposureFrame);
    app.surface.exposureFrame = null;
    app.surface.exposureObserver?.disconnect?.();
    app.surface.exposureObserver = null;
    app.surface.exposureTimers?.forEach(timer => clearTimeout(timer));
    app.surface.exposureTimers?.clear?.();
  }

  function installExposureTracking(app) {
    clearExposureTracking(app);
    if (!app.surface?.installed || app.surface.destroyed || !app.surface.active || app.root.hidden) return;
    if (!('IntersectionObserver' in window)) return;
    const memory = app.surface.memory;
    const observer = new IntersectionObserver(entries => {
      if (app.surface.destroyed || !app.surface.active) return;
      entries.forEach(entry => {
        const id = entry.target.dataset.postId;
        if (!id || app.surface.sessionSeen.has(id)) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (app.surface.exposureTimers.has(id)) return;
          const timer = setTimeout(() => {
            app.surface.exposureTimers.delete(id);
            if (app.surface.destroyed || !app.surface.active || !entry.target.isConnected || app.surface.sessionSeen.has(id)) return;
            app.surface.sessionSeen.add(id);
            memory.markSeen(id);
            entry.target.classList.add('seen');
            DF.mechanics.dispatch(app.root, 'seen', { postId: id });
          }, 900);
          app.surface.exposureTimers.set(id, timer);
        } else if (app.surface.exposureTimers.has(id)) {
          clearTimeout(app.surface.exposureTimers.get(id));
          app.surface.exposureTimers.delete(id);
        }
      });
    }, { threshold: [0, 0.6, 1] });
    app.root.querySelectorAll('.live-wall [data-post-id]').forEach(element => observer.observe(element));
    if (!app.surface.destroyed && app.surface.active) app.surface.exposureObserver = observer;
    else observer.disconnect();
  }

  function scheduleExposureTracking(app) {
    clearExposureTracking(app);
    if (!app.surface?.installed || app.surface.destroyed || !app.surface.active || app.root.hidden) return;
    app.surface.exposureFrame = requestAnimationFrame(() => {
      app.surface.exposureFrame = null;
      installExposureTracking(app);
    });
  }

  function addFontChoice(app) {
    const headlineField = app.root.querySelector('#listing-title')?.closest('.field');
    if (!headlineField || app.root.querySelector('#listing-font-voice')) return;
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `<label for="listing-font-voice">HEADLINE VOICE</label><select id="listing-font-voice">${Object.values(DF.mechanics.FONT_VOICES).map(voice => `<option value="${voice.key}">${voice.label}</option>`).join('')}</select><small class="font-choice-note">Headline only; system text remains terminal-standard.</small>`;
    headlineField.after(field);
  }

  function addSurfaceControls(app) {
    const rail = app.root.querySelector('.dripfeed-utility-rail');
    const reset = rail?.querySelector('[data-action="reset"]');
    if (!rail || app.root.querySelector('[data-action="repack"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button repack-wall';
    button.dataset.action = 'repack';
    button.textContent = 'REPACK';
    rail.insertBefore(button, reset || null);
  }

  function ensureLatentWall(app) {
    const stage = app.root.querySelector('[data-depth-host]');
    const live = stage?.querySelector('.live-wall');
    if (!stage || !live) return null;
    live.dataset.spatialSurface = 'live';
    let latent = stage.querySelector('.rear-wall');
    if (!latent) {
      latent = document.createElement('section');
      latent.className = 'listing-wall rear-wall';
      latent.dataset.depthPlane = 'latent';
      latent.dataset.spatialSurface = 'latent';
      latent.setAttribute('aria-hidden', 'true');
      stage.insertBefore(latent, live);
    }
    return latent;
  }

  function surfaceSnapshot(app) {
    const live = app.root.querySelector('.live-wall');
    const latent = app.root.querySelector('.rear-wall');
    const reading = app.root.querySelector('[data-reader-target] .reader-card');
    return Object.freeze({
      seed: app.surface.memory.state.seed,
      cycle: app.surface.memory.state.cycle,
      columns: app.surface.lastLivePlan?.columns || columnsFor(app.root),
      liveCount: app.surface.lastLivePlan?.placements.length || 0,
      latentCount: app.surface.lastLatentPlan?.placements.length || 0,
      excludedCount: app.surface.lastExcludedCount || 0,
      surfaces: Object.freeze({ live, latent, reading })
    });
  }

  function sourceRectangle(sourceElement) {
    try {
      const rect = sourceElement?.getBoundingClientRect?.();
      if (!rect || !rect.width || !rect.height) return null;
      return Object.freeze({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      });
    } catch (error) {
      return null;
    }
  }

  function publishCancellation(app, post, token, reason, error = null) {
    if (app.surface.pendingOpen?.token === token) app.surface.pendingOpen = null;
    DF.mechanics.dispatch(app.root, 'open-transmission-cancelled', {
      token,
      postId: post.id,
      post,
      reason,
      error: error || undefined,
      surfaces: app.getSpatialSurfaces?.()
    });
  }

  async function resetPartialReader(app, transition, sourceElement) {
    try {
      await transition.close({ immediate: true });
    } catch (closeError) {
      console.warn('Dripfeed reader cleanup failed; applying final local reset.', closeError);
    }

    transition.sequence = Number(transition.sequence || 0) + 1;
    transition.clearFlight?.();
    transition.revealSource?.();
    sourceElement?.classList?.remove?.('reader-transition-source');
    transition.sourceElement?.classList?.remove?.('reader-transition-source');
    transition.sourceElement = null;
    transition.flightStage?.remove?.();
    transition.flightStage = null;
    transition.opened = false;
    transition.busy = false;

    const overlay = transition.overlay || app.root.querySelector('[data-overlay="reader"]');
    overlay?.classList?.remove?.('open', 'reader-transitioning', 'reader-opening', 'reader-closing', 'reader-resolved');
    overlay?.setAttribute?.('aria-hidden', 'true');
    if (document.body?.style) document.body.style.overflow = '';

    app.depth?.setReading?.(false);
    app.state.active = null;
    const target = transition.target || app.root.querySelector('[data-reader-target]');
    target?.replaceChildren?.();
  }

  function enhanceApp(app) {
    if (app.surface?.installed) {
      ensureSurfaceState(app);
      return app;
    }
    const memory = new DF.mechanics.ExposureStore();
    app.surface = {
      installed: true,
      memory,
      exposureObserver: null,
      exposureTimers: new Map(),
      exposureFrame: null,
      sessionSeen: new Set(),
      lastLivePlan: null,
      lastLatentPlan: null,
      lastExcludedCount: 0,
      active: !app.root.hidden,
      destroyed: false,
      openSequence: 0,
      pendingOpen: null,
      readyPublication: null
    };
    DF.surfaceMemory = memory;
    ensureLatentWall(app);
    addSurfaceControls(app);
    addFontChoice(app);

    app.root.addEventListener('click', async event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'repack') {
        memory.bumpSeed();
        app.render();
        app.toast('Dripfeed wall repacked.');
        DF.mechanics.dispatch(app.root, 'repack', { seed: memory.state.seed, cycle: memory.state.cycle });
      }
      if (action === 'dismiss-post') {
        const post = app.state.active;
        if (!post) return;
        const closed = await app.readerTransition.close({ immediate: true });
        if (!closed) return;
        memory.dismiss(post.id);
        app.render();
        app.toast('Transmission dismissed from published walls.');
        DF.mechanics.dispatch(app.root, 'dismiss', { postId: post.id, post, excluded: true });
      }
    });

    app.root.addEventListener('click', event => {
      const categoryButton = event.target.closest('[data-category]');
      if (!categoryButton) return;
      queueMicrotask(() => DF.mechanics.dispatch(app.root, 'filter-change', {
        category: app.state.category,
        query: app.state.query
      }));
    });

    app.getSpatialSurfaces = () => Object.freeze({
      live: app.root.querySelector('.live-wall'),
      latent: app.root.querySelector('.rear-wall'),
      reading: app.root.querySelector('[data-reader-target] .reader-card'),
      controls: Object.freeze([
        app.root.querySelector('.dripfeed-filter-rail'),
        app.root.querySelector('.dripfeed-utility-rail')
      ].filter(Boolean))
    });
    app.getSurfaceSnapshot = () => surfaceSnapshot(app);
    app.repack = () => {
      memory.bumpSeed();
      app.render();
      return surfaceSnapshot(app);
    };
    app.dismissPost = id => {
      memory.dismiss(id);
      app.render();
      DF.mechanics.dispatch(app.root, 'dismiss', { postId: id, excluded: true });
      return surfaceSnapshot(app);
    };
    app.restorePost = id => {
      memory.restore(id);
      app.render();
      DF.mechanics.dispatch(app.root, 'restore', { postId: id });
      return surfaceSnapshot(app);
    };

    return app;
  }

  App.prototype.mount = function (...args) {
    const result = originalMount.apply(this, args);
    enhanceApp(this);
    this.render();
    return result;
  };

  App.prototype.renderWall = function () {
    if (!this.surface?.installed) enhanceApp(this);
    ensureSurfaceState(this);
    const memory = this.surface.memory;
    const members = partition(this.visiblePosts(), memory);
    const columns = columnsFor(this.root);
    const liveWall = this.root.querySelector('.live-wall');
    const latentWall = ensureLatentWall(this);
    if (!liveWall || !latentWall) return;

    const livePlan = new DF.mechanics.BoardPlanner({
      columns,
      seed: memory.state.seed,
      memory,
      role: 'live'
    }).plan(members.live);
    const latentPlan = new DF.mechanics.BoardPlanner({
      columns,
      seed: memory.state.seed + 7919,
      memory,
      role: 'latent'
    }).plan(members.latent);

    renderPlan(liveWall, livePlan);
    renderPlan(latentWall, latentPlan);
    if (!livePlan.placements.length) {
      liveWall.append(makeEmptyState('NO MATCHING TRANSMISSIONS', 'Change the filter, search, or restore a dismissed transmission.'));
    }
    if (!latentPlan.placements.length) {
      latentWall.append(makeEmptyState('LATENT WALL CLEAR', 'No matching opened transmissions are currently behind the live surface.'));
    }

    this.surface.lastLivePlan = livePlan;
    this.surface.lastLatentPlan = latentPlan;
    this.surface.lastExcludedCount = members.excluded.length;
    const count = this.root.querySelector('#result-count');
    if (count) count.textContent = livePlan.placements.length;
    this.depth.afterRender();
    scheduleExposureTracking(this);
    DF.mechanics.dispatch(this.root, 'walls-change', surfaceSnapshot(this));
  };

  App.prototype.openReader = async function (post, sourceElement) {
    if (!this.surface?.installed) enhanceApp(this);
    ensureSurfaceState(this);
    if (this.surface.destroyed || !this.surface.active || this.root.hidden) return false;

    const token = ++this.surface.openSequence;
    const sourceRect = sourceRectangle(sourceElement);
    this.surface.pendingOpen = Object.freeze({ token, postId: post.id });
    DF.mechanics.dispatch(this.root, 'open-transmission-start', {
      token,
      postId: post.id,
      post,
      sourceElement,
      sourceRect,
      surfaces: this.getSpatialSurfaces?.()
    });

    if (this.surface.readyPublication || this.readerTransition.busy || this.readerTransition.opened) {
      publishCancellation(this, post, token, 'rejected');
      return false;
    }

    let accepted;
    try {
      accepted = await this.readerTransition.open(post, sourceElement);
    } catch (error) {
      await resetPartialReader(this, this.readerTransition, sourceElement);
      publishCancellation(this, post, token, 'error', error);
      throw error;
    }

    const readingSurface = this.root.querySelector('[data-reader-target] .reader-card');
    const ready = Boolean(
      accepted
      && this.surface.pendingOpen?.token === token
      && readingSurface?.isConnected
      && !this.surface.destroyed
      && this.surface.active
      && !this.root.hidden
      && this.readerTransition.opened === true
      && this.readerTransition.busy === false
    );
    if (!ready) {
      if (accepted || this.readerTransition.busy || this.readerTransition.opened || this.state.active === post) {
        await resetPartialReader(this, this.readerTransition, sourceElement);
      }
      const interrupted = this.surface.destroyed || !this.surface.active || this.root.hidden
        || this.surface.pendingOpen?.token !== token || Boolean(accepted);
      publishCancellation(this, post, token, interrupted ? 'interrupted' : 'rejected');
      return false;
    }

    this.surface.memory.markOpened(post.id);
    this.surface.pendingOpen = null;
    this.surface.readyPublication = Object.freeze({ token, postId: post.id, post });
    const detail = {
      token,
      postId: post.id,
      post,
      sourceElement,
      sourceRect,
      readingSurface,
      surfaces: this.getSpatialSurfaces?.()
    };
    DF.mechanics.dispatch(this.root, 'open-transmission-ready', detail);
    DF.mechanics.dispatch(this.root, 'open-transmission', detail);
    return true;
  };

  App.prototype.activate = function (...args) {
    if (!this.surface?.installed) enhanceApp(this);
    ensureSurfaceState(this);
    this.surface.destroyed = false;
    this.surface.active = true;
    const result = originalActivate.apply(this, args);
    scheduleExposureTracking(this);
    return result;
  };

  App.prototype.deactivate = function (...args) {
    if (!this.surface?.installed) enhanceApp(this);
    ensureSurfaceState(this);
    this.surface.active = false;
    clearExposureTracking(this);
    return originalDeactivate.apply(this, args);
  };

  App.prototype.destroy = function (...args) {
    if (this.surface?.installed) {
      ensureSurfaceState(this);
      this.surface.active = false;
      this.surface.destroyed = true;
      this.surface.pendingOpen = null;
      clearExposureTracking(this);
    }
    return originalDestroy.apply(this, args);
  };

  if (Store && originalStoreAdd) {
    Store.prototype.add = function (raw) {
      originalStoreAdd.call(this, raw);
      const created = this.posts[0];
      if (!created) return;
      if (raw.fontVoice) created.fontVoice = raw.fontVoice;
      if (raw.imageTreatment) created.imageTreatment = raw.imageTreatment;
      DF.surfaceMemory?.setProfile(created.id, {
        fontVoice: raw.fontVoice,
        imageTreatment: raw.imageTreatment
      });
    };
  }

  if (SubmitController && originalDraft) {
    SubmitController.prototype.draft = function () {
      const draft = originalDraft.call(this);
      draft.fontVoice = this.formValue('listing-font-voice') || 'wire';
      return draft;
    };
  }

  DF.render.reviewCard = function (post) {
    const markup = originalReviewCard(post);
    const voice = post.fontVoice || DF.surfaceMemory?.profileFor(post).fontVoice || 'wire';
    return markup.replace('class="review-card ', `class="review-card ${fontClass(voice)} `);
  };

  DF.render.readerMarkup = function (post) {
    const markup = originalReaderMarkup(post);
    const voice = DF.surfaceMemory?.profileFor(post).fontVoice || post.fontVoice || 'wire';
    return markup
      .replace('class="reader-card"', `class="reader-card ${fontClass(voice)}" data-spatial-surface="reading"`)
      .replace(
        '<div class="reader-actions"><button class="button primary" data-action="close-reader">RETURN TO DRIPFEED</button></div>',
        '<div class="reader-actions"><button class="button" data-action="dismiss-post">DISMISS</button><button class="button primary" data-action="close-reader">RETURN LIVE</button></div>'
      );
  };

  if (ReaderTransition && originalReaderClose) {
    ReaderTransition.prototype.close = async function (...args) {
      const publication = this.app.surface?.readyPublication || null;
      const result = await originalReaderClose.apply(this, args);
      if (result && publication && this.app.surface?.readyPublication?.token === publication.token) {
        this.app.surface.readyPublication = null;
        DF.mechanics.dispatch(this.app.root, 'close-transmission', {
          token: publication.token,
          postId: publication.postId,
          post: publication.post,
          surfaces: this.app.getSpatialSurfaces?.()
        });
      }
      return result;
    };
  }

  const publication = Object.freeze({
    installed: true,
    version: '1.2.0',
    tile,
    enhanceApp,
    partition,
    clearExposure: clearExposureTracking,
    scheduleExposure: scheduleExposureTracking,
    resetPartialReader
  });
  DF.surface = publication;
  DF.surfaceContract = publication;
})(window.Dripfeed = window.Dripfeed || {});
