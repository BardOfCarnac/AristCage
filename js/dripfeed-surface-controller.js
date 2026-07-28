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
  const originalOpenReader = App.prototype.openReader;
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

  function allAvailablePosts(app) {
    return app.store.posts.filter(post => DF.model.effectiveState(post) !== 'removed');
  }

  function ensureMinimumLive(filtered, selected, memory) {
    const target = Math.min(filtered.length, 6);
    if (selected.length >= target) return selected;
    const selectedIds = new Set(selected.map(post => post.id));
    const reserve = filtered
      .filter(post => !selectedIds.has(post.id) && !memory.get(post.id).dismissed)
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
    return [...selected, ...reserve.slice(0, target - selected.length)];
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

  function clearExposureTracking(app) {
    app.surface.exposureObserver?.disconnect();
    app.surface.exposureObserver = null;
    app.surface.exposureTimers.forEach(timer => clearTimeout(timer));
    app.surface.exposureTimers.clear();
  }

  function installExposureTracking(app) {
    clearExposureTracking(app);
    if (!('IntersectionObserver' in window) || app.root.hidden) return;
    const memory = app.surface.memory;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = entry.target.dataset.postId;
        if (!id || app.surface.sessionSeen.has(id)) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (app.surface.exposureTimers.has(id)) return;
          const timer = setTimeout(() => {
            if (!entry.target.isConnected || app.surface.sessionSeen.has(id)) return;
            app.surface.sessionSeen.add(id);
            memory.markSeen(id);
            entry.target.classList.add('seen');
            DF.mechanics.dispatch(app.root, 'seen', { postId: id });
            app.surface.exposureTimers.delete(id);
          }, 900);
          app.surface.exposureTimers.set(id, timer);
        } else if (app.surface.exposureTimers.has(id)) {
          clearTimeout(app.surface.exposureTimers.get(id));
          app.surface.exposureTimers.delete(id);
        }
      });
    }, { threshold: [0, 0.6, 1] });
    app.root.querySelectorAll('.live-wall [data-post-id]').forEach(element => observer.observe(element));
    app.surface.exposureObserver = observer;
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
      surfaces: Object.freeze({ live, latent, reading })
    });
  }

  function enhanceApp(app) {
    if (app.surface?.installed) return app;
    const memory = new DF.mechanics.ExposureStore();
    app.surface = {
      installed: true,
      memory,
      exposureObserver: null,
      exposureTimers: new Map(),
      sessionSeen: new Set(),
      lastLivePlan: null,
      lastLatentPlan: null
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
        memory.dismiss(post.id);
        await app.readerTransition.close({ immediate: true });
        app.render();
        app.toast('Transmission filed to the latent wall.');
        DF.mechanics.dispatch(app.root, 'dismiss', { postId: post.id });
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
    };
    app.restorePost = id => {
      memory.restore(id);
      app.render();
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
    const memory = this.surface.memory;
    const filtered = this.visiblePosts();
    let livePosts = filtered.filter(post => memory.shouldRemainLive(post.id));
    livePosts = ensureMinimumLive(filtered, livePosts, memory);
    const liveIds = new Set(livePosts.map(post => post.id));
    const latentPosts = allAvailablePosts(this).filter(post => !liveIds.has(post.id));
    const columns = columnsFor(this.root);
    const liveWall = this.root.querySelector('.live-wall');
    const latentWall = ensureLatentWall(this);
    if (!liveWall || !latentWall) return;

    const livePlan = new DF.mechanics.BoardPlanner({
      columns,
      seed: memory.state.seed,
      memory,
      role: 'live'
    }).plan(livePosts);
    const latentPlan = new DF.mechanics.BoardPlanner({
      columns,
      seed: memory.state.seed + 7919,
      memory,
      role: 'latent'
    }).plan(latentPosts);

    renderPlan(liveWall, livePlan);
    renderPlan(latentWall, latentPlan);
    if (!livePlan.placements.length) {
      liveWall.append(makeEmptyState('NO MATCHING TRANSMISSIONS', 'Change the category filter, search, or repack the wall.'));
    }
    if (!latentPlan.placements.length) {
      latentWall.append(makeEmptyState('LATENT WALL CLEAR', 'No transmissions are currently filed behind the live surface.'));
    }

    this.surface.lastLivePlan = livePlan;
    this.surface.lastLatentPlan = latentPlan;
    const count = this.root.querySelector('#result-count');
    if (count) count.textContent = livePlan.placements.length;
    this.depth.afterRender();
    requestAnimationFrame(() => installExposureTracking(this));
    DF.mechanics.dispatch(this.root, 'walls-change', surfaceSnapshot(this));
  };

  App.prototype.openReader = function (post, sourceElement) {
    if (!this.surface?.installed) enhanceApp(this);
    const sourceRect = sourceElement?.getBoundingClientRect?.();
    this.surface.memory.markOpened(post.id);
    DF.mechanics.dispatch(this.root, 'open-transmission', {
      postId: post.id,
      post,
      sourceElement,
      sourceRect: sourceRect ? Object.freeze({
        left: sourceRect.left,
        top: sourceRect.top,
        width: sourceRect.width,
        height: sourceRect.height
      }) : null,
      surfaces: this.getSpatialSurfaces?.()
    });
    return originalOpenReader.call(this, post, sourceElement);
  };

  App.prototype.destroy = function (...args) {
    if (this.surface?.installed) clearExposureTracking(this);
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
        '<div class="reader-actions"><button class="button" data-action="dismiss-post">FILE TO REAR</button><button class="button primary" data-action="close-reader">RETURN LIVE</button></div>'
      );
  };

  if (ReaderTransition && originalReaderClose) {
    ReaderTransition.prototype.close = async function (...args) {
      const post = this.app.state.active;
      const result = await originalReaderClose.apply(this, args);
      if (result && post) {
        DF.mechanics.dispatch(this.app.root, 'close-transmission', {
          postId: post.id,
          post,
          surfaces: this.app.getSpatialSurfaces?.()
        });
      }
      return result;
    };
  }

  DF.surface = Object.freeze({
    installed: true,
    version: '1.0.0',
    tile,
    enhanceApp
  });
})(window.Dripfeed = window.Dripfeed || {});
