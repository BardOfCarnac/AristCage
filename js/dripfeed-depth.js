(function (DF) {
  const PLANE_DEFINITIONS = Object.freeze([
    Object.freeze({ role: 'live', z: 2.72 }),
    Object.freeze({ role: 'reader', z: 2.54 })
  ]);

  class SharedDepthAdapter {
    constructor(app) {
      this.app = app;
      this.bound = false;
      this.active = true;
      this.externalOwner = null;
      this.listenersBound = false;
      this.resizeObserver = null;
      this.onResize = () => this.refreshGeometry();
      this.onCameraChange = event => this.refreshGeometry(event.detail);
      this.onEnvironmentPhase = event => {
        if (event.detail?.phase === 'active' && event.detail?.next === 'dripfeed') {
          this.refreshGeometry(event.detail?.camera);
        }
      };
    }

    cameraSnapshot() {
      return window.NCNChamberCamera?.snapshot?.()
        || window.LayeredChamber?.getCameraSnapshot?.()
        || null;
    }

    stage() {
      return this.app.root.querySelector('[data-depth-host]');
    }

    ownsGeometry() {
      return this.bound && this.active && !this.externalOwner;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      this.active = true;
      this.stage()?.classList.add('shared-depth');
      this.attachGeometryObservers();
      this.clearLayoutOverrides();
      this.refreshGeometry();
    }

    attachGeometryObservers() {
      if (!this.ownsGeometry() || this.listenersBound) return;
      this.listenersBound = true;
      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('orientationchange', this.onResize, { passive: true });
      window.addEventListener('ncn:chamber-camera-change', this.onCameraChange);
      window.addEventListener('ncn:application-environment-phase', this.onEnvironmentPhase);

      const stage = this.stage();
      if ('ResizeObserver' in window && stage) {
        this.resizeObserver = new ResizeObserver(() => this.syncGeometry());
        this.resizeObserver.observe(stage);
      }
    }

    detachGeometryObservers() {
      if (this.listenersBound) {
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('orientationchange', this.onResize);
        window.removeEventListener('ncn:chamber-camera-change', this.onCameraChange);
        window.removeEventListener('ncn:application-environment-phase', this.onEnvironmentPhase);
      }
      this.listenersBound = false;
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    }

    clearLayoutOverrides() {
      const root = this.app.root;
      const stage = this.stage();
      [
        '--drip-aperture-width',
        '--drip-aperture-left',
        '--drip-aperture-top',
        '--cols'
      ].forEach(property => root.style.removeProperty(property));
      [
        '--drip-live-scale',
        '--drip-live-reading-scale',
        '--drip-live-y',
        '--drip-rear-y',
        '--drip-rear-scale'
      ].forEach(property => stage?.style.removeProperty(property));
      if (stage) stage.style.height = '';
    }

    applyDepth(camera = this.cameraSnapshot()) {
      if (!this.ownsGeometry()) return false;
      const root = this.app.root;
      const stage = this.stage();
      if (!stage || !camera) {
        root.dataset.chamberBound = 'false';
        return false;
      }

      const live = PLANE_DEFINITIONS.find(plane => plane.role === 'live');
      const reader = PLANE_DEFINITIONS.find(plane => plane.role === 'reader');
      const liveScale = camera.scaleAt(live.z);
      const readerScale = camera.scaleAt(reader.z) / liveScale;

      stage.style.setProperty('--drip-live-scale', '1');
      stage.style.setProperty('--drip-live-reading-scale', Math.max(.91, 2 - readerScale).toFixed(5));
      stage.dataset.sharedCamera = 'true';
      root.dataset.chamberBound = 'true';
      return true;
    }

    refreshGeometry(camera) {
      if (!this.ownsGeometry()) return false;
      this.clearLayoutOverrides();
      this.applyDepth(camera);
      requestAnimationFrame(() => {
        if (this.ownsGeometry()) this.syncGeometry();
      });
      window.LayeredChamber?.refresh?.();
      return true;
    }

    syncGeometry() {
      if (!this.ownsGeometry() || this.app.root.hidden) return false;
      const root = this.app.root;
      const live = root.querySelector('[data-spatial-surface="live"], [data-depth-plane="live"]');
      const stage = this.stage();
      if (!live || !stage) return false;

      const styles = getComputedStyle(root);
      const cols = Number(styles.getPropertyValue('--cols')) || 3;
      const gap = parseFloat(styles.getPropertyValue('--gap')) || 8;
      const unit = (live.clientWidth - gap * (cols - 1)) / cols;
      if (unit > 0) root.style.setProperty('--unit', `${unit}px`);

      requestAnimationFrame(() => {
        if (!this.ownsGeometry() || root.hidden) return;
        stage.style.height = `${Math.max(live.scrollHeight, 420) + 28}px`;
      });
      return true;
    }

    claimExternalGeometry(owner) {
      const key = String(owner || '').trim();
      if (!key) throw new TypeError('External Dripfeed geometry ownership requires a non-empty owner.');
      if (this.externalOwner && this.externalOwner !== key) return false;
      this.externalOwner = key;
      this.detachGeometryObservers();
      this.clearLayoutOverrides();
      this.app.root.dataset.sharedDepthDormant = 'true';
      this.app.root.dataset.sharedDepthOwner = key;
      this.stage()?.classList.add('external-depth-owned');
      return true;
    }

    releaseExternalGeometry(owner) {
      const key = String(owner || '').trim();
      if (!this.externalOwner || this.externalOwner !== key) return false;
      this.externalOwner = null;
      delete this.app.root.dataset.sharedDepthDormant;
      delete this.app.root.dataset.sharedDepthOwner;
      this.stage()?.classList.remove('external-depth-owned');
      if (this.bound && this.active) {
        this.attachGeometryObservers();
        this.refreshGeometry();
      }
      return true;
    }

    setReading(reading) {
      this.stage()?.classList.toggle('reading', Boolean(reading));
    }

    afterRender() {
      if (this.ownsGeometry()) this.refreshGeometry();
    }

    resume() {
      this.active = true;
      if (this.externalOwner) return;
      this.attachGeometryObservers();
      this.refreshGeometry();
    }

    pause() {
      this.active = false;
      this.detachGeometryObservers();
    }

    snapshot() {
      return Object.freeze({
        bound: this.bound,
        active: this.active,
        dormant: Boolean(this.externalOwner),
        externalOwner: this.externalOwner,
        listenersBound: this.listenersBound,
        observerConnected: Boolean(this.resizeObserver)
      });
    }

    destroy() {
      this.detachGeometryObservers();
      this.clearLayoutOverrides();
      this.stage()?.classList.remove('external-depth-owned', 'shared-depth');
      delete this.app.root.dataset.sharedDepthDormant;
      delete this.app.root.dataset.sharedDepthOwner;
      this.externalOwner = null;
      this.active = false;
      this.bound = false;
    }

    getPlaneDefinitions() {
      return PLANE_DEFINITIONS.map(plane => ({ ...plane }));
    }
  }

  DF.depth = { SharedDepthAdapter, PLANE_DEFINITIONS };
})(window.Dripfeed = window.Dripfeed || {});
