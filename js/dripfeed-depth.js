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
      this.visualViewport = window.visualViewport || null;
      this.onResize = () => this.refreshGeometry();
      this.onCameraChange = event => this.refreshGeometry(event.detail);
      this.onEnvironmentPhase = event => {
        if (event.detail?.phase === 'active' && event.detail?.next === 'dripfeed') {
          requestAnimationFrame(() => this.refreshGeometry());
        }
      };
    }

    /* Dripfeed belongs to the neutral terminal chamber. Do not consume the
       LayeredChamber camera first: Optics deliberately patches that API with
       softened article-port mapping for RedWire. */
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
      this.visualViewport?.addEventListener('resize', this.onResize, { passive: true });

      if ('ResizeObserver' in window && stage) {
        this.resizeObserver = new ResizeObserver(() => this.syncGeometry());
        this.resizeObserver.observe(stage);
      }

      this.refreshGeometry();
    }

    columnCount(apertureWidth) {
      const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
      if (coarsePointer) return apertureWidth < 350 ? 2 : 3;
      if (apertureWidth < 430) return 2;
      if (apertureWidth < 760) return 3;
      if (apertureWidth < 1120) return 4;
      return 5;
    }

    applyCamera(camera = this.cameraSnapshot()) {
      const root = this.app.root;
      const stage = root.querySelector('[data-depth-host]');
      if (!stage || !camera) {
        root.dataset.chamberBound = 'false';
        return;
      }

      const live = PLANE_DEFINITIONS.find(plane => plane.role === 'live');
      const reader = PLANE_DEFINITIONS.find(plane => plane.role === 'reader');
      const aperture = camera.apertureAt(live.z, camera.halfWidth);
      const viewportWidth = this.visualViewport?.width || camera.width || window.innerWidth;
      const horizontalGutter = viewportWidth < 520 ? 8 : 14;
      const usableWidth = Math.max(
        280,
        Math.min(aperture.width, viewportWidth - horizontalGutter * 2)
      );
      const liveScale = camera.scaleAt(live.z);
      const readerScale = camera.scaleAt(reader.z) / liveScale;

      root.style.setProperty('--drip-aperture-width', `${usableWidth.toFixed(2)}px`);
      root.style.setProperty('--drip-aperture-left', `${Math.max(horizontalGutter, aperture.left).toFixed(2)}px`);
      root.style.setProperty('--drip-aperture-top', `${Math.max(0, aperture.top).toFixed(2)}px`);
      root.style.setProperty('--cols', String(this.columnCount(usableWidth)));
      stage.style.setProperty('--drip-live-scale', '1');
      stage.style.setProperty('--drip-live-reading-scale', Math.max(.91, 2 - readerScale).toFixed(5));
      stage.dataset.sharedCamera = 'true';
      root.dataset.chamberBound = 'true';
    }

    refreshGeometry(camera) {
      this.applyCamera(camera);
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
      this.visualViewport?.removeEventListener('resize', this.onResize);
      this.resizeObserver?.disconnect();
      this.bound = false;
    }

    getPlaneDefinitions() {
      return PLANE_DEFINITIONS.map(plane => ({ ...plane }));
    }
  }

  DF.depth = { SharedDepthAdapter, PLANE_DEFINITIONS };
})(window.Dripfeed = window.Dripfeed || {});
