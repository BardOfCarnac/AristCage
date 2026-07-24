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

      this.clearLayoutOverrides();
      this.refreshGeometry();
    }

    clearLayoutOverrides() {
      const root = this.app.root;
      ['--drip-aperture-width', '--drip-aperture-left', '--drip-aperture-top', '--cols']
        .forEach(property => root.style.removeProperty(property));
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

      /* The live wall is the application's design plane, so it remains at its
         normal responsive size. The camera only supplies the relative reader
         depth used while a card is open. */
      stage.style.setProperty('--drip-live-scale', '1');
      stage.style.setProperty('--drip-live-reading-scale', Math.max(.91, 2 - readerScale).toFixed(5));
      stage.dataset.sharedCamera = 'true';
      root.dataset.chamberBound = 'true';
    }

    refreshGeometry(camera) {
      this.clearLayoutOverrides();
      this.applyDepth(camera);
      requestAnimationFrame(() => this.syncGeometry());
      window.LayeredChamber?.refresh?.();
    }

    syncGeometry() {
      if (this.app.root.hidden) return;
      const root = this.app.root;
      const live = root.querySelector('.live-wall');
      const stage = root.querySelector('[data-depth-host]');
      if (!live || !stage) return;

      const styles = getComputedStyle(root);
      const cols = Number(styles.getPropertyValue('--cols')) || 3;
      const gap = parseFloat(styles.getPropertyValue('--gap')) || 8;
      const unit = (live.clientWidth - gap * (cols - 1)) / cols;
      if (unit > 0) root.style.setProperty('--unit', `${unit}px`);

      requestAnimationFrame(() => {
        if (root.hidden) return;
        stage.style.height = `${Math.max(live.scrollHeight, 420) + 28}px`;
      });
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
      this.clearLayoutOverrides();
      this.bound = false;
    }

    getPlaneDefinitions() {
      return PLANE_DEFINITIONS.map(plane => ({ ...plane }));
    }
  }

  DF.depth = { SharedDepthAdapter, PLANE_DEFINITIONS };
})(window.Dripfeed = window.Dripfeed || {});
