(function (DF) {
  const PLANE_DEFINITIONS = Object.freeze([
    Object.freeze({ role: 'live', z: 2.72 }),
    Object.freeze({ role: 'reader', z: 2.54 })
  ]);

  class SharedDepthAdapter {
    constructor(app) {
      this.app = app;
      this.bound = false;
      this.resizeObserver = null;
      this.onResize = () => this.refreshGeometry();
      this.onCameraChange = event => this.refreshGeometry(event.detail);
      this.onEnvironmentPhase = event => {
        if (event.detail?.phase === 'active' && event.detail?.next === 'dripfeed') {
          requestAnimationFrame(() => this.refreshGeometry());
        }
      };
    }

    cameraSnapshot() {
      return window.NCNChamberCamera?.snapshot?.()
        || window.LayeredChamber?.getCameraSnapshot?.()
        || null;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      const stage = this.app.root.querySelector('[data-depth-host]');
      stage?.classList.add('shared-depth');

      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('orientationchange', this.onResize, { passive: true });
      window.addEventListener('ncn:chamber-camera-change', this.onCameraChange);
      window.addEventListener('ncn:application-environment-phase', this.onEnvironmentPhase);

      if ('ResizeObserver' in window && stage) {
        this.resizeObserver = new ResizeObserver(() => this.syncGeometry());
        this.resizeObserver.observe(stage);
      }

      this.clearLegacyOverrides();
      this.refreshGeometry();
    }

    clearLegacyOverrides() {
      const root = this.app.root;
      const stage = root.querySelector('[data-depth-host]');
      [
        '--drip-aperture-width',
        '--drip-aperture-left',
        '--drip-aperture-top',
        '--cols',
        '--unit'
      ].forEach(property => root.style.removeProperty(property));
      stage?.style.removeProperty('height');
    }

    applyDepth(camera = this.cameraSnapshot()) {
      const root = this.app.root;
      const stage = root.querySelector('[data-depth-host]');
      if (!stage || !camera) {
        root.dataset.chamberBound = 'false';
        return;
      }

      const live = PLANE_DEFINITIONS.find(plane => plane.role === 'live');
      const reader = PLANE_DEFINITIONS.find(plane => plane.role === 'reader');
      const liveScale = camera.scaleAt(live.z);
      const readerScale = camera.scaleAt(reader.z) / liveScale;

      stage.style.setProperty('--drip-live-scale', '1');
      stage.style.setProperty('--drip-live-reading-scale', Math.max(.91, 2 - readerScale).toFixed(5));
      stage.dataset.sharedCamera = 'true';
      root.dataset.chamberBound = 'true';
    }

    refreshGeometry(camera) {
      this.clearLegacyOverrides();
      this.applyDepth(camera);
      requestAnimationFrame(() => this.syncGeometry());
      window.LayeredChamber?.refresh?.();
    }

    syncGeometry() {
      if (this.app.root.hidden) return;
      const root = this.app.root;
      const wall = root.querySelector('.live-wall');
      if (!wall) return;

      const styles = getComputedStyle(root);
      const cols = Number(styles.getPropertyValue('--df-cols')) || 3;
      const gap = parseFloat(styles.getPropertyValue('--df-gap')) || 8;
      const width = wall.getBoundingClientRect().width;
      const unit = (width - gap * (cols - 1)) / cols;

      if (unit > 0) {
        root.style.setProperty('--df-unit', `${unit}px`);
      }
    }

    setReading(reading) {
      this.app.root.querySelector('[data-depth-host]')?.classList.toggle('reading', Boolean(reading));
    }

    afterRender() {
      this.refreshGeometry();
    }

    resume() {
      this.refreshGeometry();
    }

    pause() {}

    destroy() {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('orientationchange', this.onResize);
      window.removeEventListener('ncn:chamber-camera-change', this.onCameraChange);
      window.removeEventListener('ncn:application-environment-phase', this.onEnvironmentPhase);
      this.resizeObserver?.disconnect();
      this.clearLegacyOverrides();
      this.app.root.style.removeProperty('--df-unit');
      this.bound = false;
    }

    getPlaneDefinitions() {
      return PLANE_DEFINITIONS.map(plane => ({ ...plane }));
    }
  }

  DF.depth = { SharedDepthAdapter, PLANE_DEFINITIONS };
})(window.Dripfeed = window.Dripfeed || {});
