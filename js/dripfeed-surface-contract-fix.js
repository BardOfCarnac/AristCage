/*==================================================
  DRIPFEED MOUNTED SURFACE CONTRACT

  Corrects publication lifecycle semantics while leaving chamber coordinates,
  occlusion and article-scroll mapping to the integration host.
==================================================*/
(function (DF) {
  'use strict';

  if (!DF.App || !DF.mechanics || !DF.surface?.installed || DF.surfaceContract?.installed) return;

  const App = DF.App;
  const priorActivate = App.prototype.activate;
  const priorDeactivate = App.prototype.deactivate;
  const priorDestroy = App.prototype.destroy;

  const columnsFor = root => Math.max(1, Math.min(6,
    Math.floor(Number(getComputedStyle(root).getPropertyValue('--cols')) || 3)));

  function ensureState(app) {
    if (!app.surface) return;
    if (!Object.hasOwn(app.surface, 'active')) app.surface.active = !app.root.hidden;
    if (!Object.hasOwn(app.surface, 'destroyed')) app.surface.destroyed = false;
    if (!Object.hasOwn(app.surface, 'exposureFrame')) app.surface.exposureFrame = null;
  }

  function partition(filtered, memory) {
    const live = [];
    const latent = [];
    filtered.forEach(post => (memory.shouldRemainLive(post.id) ? live : latent).push(post));
    return { live, latent };
  }

  function clearExposure(app) {
    if (!app.surface) return;
    if (app.surface.exposureFrame != null) cancelAnimationFrame(app.surface.exposureFrame);
    app.surface.exposureFrame = null;
    app.surface.exposureObserver?.disconnect?.();
    app.surface.exposureObserver = null;
    app.surface.exposureTimers?.forEach(timer => clearTimeout(timer));
    app.surface.exposureTimers?.clear?.();
  }

  function installExposure(app) {
    if (!app.surface?.installed || app.surface.destroyed || !app.surface.active || app.root.hidden) return;
    app.surface.exposureObserver?.disconnect?.();
    app.surface.exposureObserver = null;
    app.surface.exposureTimers.forEach(timer => clearTimeout(timer));
    app.surface.exposureTimers.clear();
    if (!('IntersectionObserver' in window)) return;

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
            app.surface.memory.markSeen(id);
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

    app.root.querySelectorAll('.live-wall [data-post-id]').forEach(node => observer.observe(node));
    if (!app.surface.destroyed && app.surface.active) app.surface.exposureObserver = observer;
    else observer.disconnect();
  }

  function scheduleExposure(app) {
    clearExposure(app);
    if (!app.surface?.installed || app.surface.destroyed || !app.surface.active || app.root.hidden) return;
    app.surface.exposureFrame = requestAnimationFrame(() => {
      app.surface.exposureFrame = null;
      installExposure(app);
    });
  }

  function empty(message, detail) {
    const node = document.createElement('div');
    node.className = 'empty-state';
    node.innerHTML = `<strong>${DF.render.esc(message)}</strong><span>${DF.render.esc(detail)}</span>`;
    return node;
  }

  function snapshotFor(app) {
    if (typeof app.getSurfaceSnapshot === 'function') return app.getSurfaceSnapshot();
    return Object.freeze({
      seed: app.surface.memory.state.seed,
      cycle: app.surface.memory.state.cycle,
      columns: app.surface.lastLivePlan?.columns || columnsFor(app.root),
      liveCount: app.surface.lastLivePlan?.placements.length || 0,
      latentCount: app.surface.lastLatentPlan?.placements.length || 0,
      surfaces: Object.freeze({
        live: app.root.querySelector('.live-wall'),
        latent: app.root.querySelector('.rear-wall'),
        reading: app.root.querySelector('[data-reader-target] .reader-card')
      })
    });
  }

  function renderPlan(wall, plan) {
    wall.replaceChildren(...plan.placements.map(item => DF.surface.tile(item.post, item)));
    wall.style.setProperty('--surface-rows', String(plan.rows));
    wall.dataset.surfaceRows = String(plan.rows);
  }

  App.prototype.renderWall = function () {
    if (!this.surface?.installed) DF.surface.enhanceApp(this);
    ensureState(this);
    const memory = this.surface.memory;
    const members = partition(this.visiblePosts(), memory);
    const columns = columnsFor(this.root);
    const liveWall = this.root.querySelector('.live-wall');
    const latentWall = this.root.querySelector('.rear-wall');
    if (!liveWall || !latentWall) return;

    const livePlan = new DF.mechanics.BoardPlanner({ columns, seed: memory.state.seed, memory, role: 'live' }).plan(members.live);
    const latentPlan = new DF.mechanics.BoardPlanner({ columns, seed: memory.state.seed + 7919, memory, role: 'latent' }).plan(members.latent);
    renderPlan(liveWall, livePlan);
    renderPlan(latentWall, latentPlan);
    if (!livePlan.placements.length) liveWall.append(empty('NO MATCHING TRANSMISSIONS', 'Change the filter, search, or restore a filed transmission.'));
    if (!latentPlan.placements.length) latentWall.append(empty('LATENT WALL CLEAR', 'No matching transmissions are filed behind the live surface.'));

    this.surface.lastLivePlan = livePlan;
    this.surface.lastLatentPlan = latentPlan;
    const count = this.root.querySelector('#result-count');
    if (count) count.textContent = livePlan.placements.length;
    this.depth.afterRender();
    scheduleExposure(this);
    DF.mechanics.dispatch(this.root, 'walls-change', snapshotFor(this));
  };

  App.prototype.openReader = async function (post, sourceElement) {
    if (!this.surface?.installed) DF.surface.enhanceApp(this);
    ensureState(this);
    if (this.surface.destroyed || !this.surface.active || this.root.hidden) return false;

    const rect = sourceElement?.getBoundingClientRect?.();
    const sourceRect = rect && rect.width && rect.height ? Object.freeze({
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height
    }) : null;
    DF.mechanics.dispatch(this.root, 'open-transmission-start', {
      postId: post.id, post, sourceElement, sourceRect, surfaces: this.getSpatialSurfaces?.()
    });

    let accepted;
    try {
      accepted = await this.readerTransition.open(post, sourceElement);
    } catch (error) {
      DF.mechanics.dispatch(this.root, 'open-transmission-cancelled', { postId: post.id, post, reason: 'error' });
      throw error;
    }

    const readingSurface = this.root.querySelector('[data-reader-target] .reader-card');
    const ready = Boolean(accepted && readingSurface?.isConnected && !this.surface.destroyed
      && this.surface.active && !this.root.hidden && this.readerTransition.opened !== false);
    if (!ready) {
      if (accepted) await this.readerTransition.close({ immediate: true });
      DF.mechanics.dispatch(this.root, 'open-transmission-cancelled', {
        postId: post.id, post, reason: accepted ? 'interrupted' : 'rejected'
      });
      return false;
    }

    this.surface.memory.markOpened(post.id);
    const detail = { postId: post.id, post, sourceElement, sourceRect, readingSurface, surfaces: this.getSpatialSurfaces?.() };
    DF.mechanics.dispatch(this.root, 'open-transmission-ready', detail);
    DF.mechanics.dispatch(this.root, 'open-transmission', detail);
    return true;
  };

  App.prototype.activate = function (...args) {
    ensureState(this);
    this.surface.destroyed = false;
    this.surface.active = true;
    const result = priorActivate.apply(this, args);
    scheduleExposure(this);
    return result;
  };

  App.prototype.deactivate = function (...args) {
    ensureState(this);
    this.surface.active = false;
    clearExposure(this);
    return priorDeactivate.apply(this, args);
  };

  App.prototype.destroy = function (...args) {
    ensureState(this);
    this.surface.active = false;
    this.surface.destroyed = true;
    clearExposure(this);
    return priorDestroy.apply(this, args);
  };

  DF.surfaceContract = Object.freeze({ installed: true, version: '1.1.0', partition, clearExposure, scheduleExposure });
})(window.Dripfeed = window.Dripfeed || {});
