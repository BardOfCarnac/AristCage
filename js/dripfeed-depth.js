(function (DF) {
  const PLANE_DEFINITIONS = Object.freeze([
    Object.freeze({ role: 'rear', z: 3.18 }),
    Object.freeze({ role: 'live', z: 2.72 }),
    Object.freeze({ role: 'reader', z: 2.54 })
  ]);

  class SharedDepthAdapter {
    constructor(app) {
      this.app = app;
      this.bound = false;
      this.resizeObserver = null;
      this.onResize = () => this.syncGeometry();
      this.onCameraChange = event => this.applyCamera(event.detail);
    }

    cameraSnapshot() {
      return window.LayeredChamber?.getCameraSnapshot?.()
        || window.NCNChamberCamera?.snapshot?.()
        || null;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      const root = this.app.root;
      const stage = root.querySelector('[data-depth-host]');
      stage?.classList.add('shared-depth');

      root.querySelector('[data-action="peek"]')?.addEventListener('click', () => {
        this.app.state.peek = !this.app.state.peek;
        stage?.classList.toggle('peek', this.app.state.peek);
        const button = root.querySelector('[data-action="peek"]');
        if (button) {
          button.classList.toggle('active', this.app.state.peek);
          button.textContent = this.app.state.peek ? 'RETURN LIVE WALL' : 'PEEK REAR';
        }
      });

      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('ncn:chamber-camera-change', this.onCameraChange);

      if ('ResizeObserver' in window && stage) {
        this.resizeObserver = new ResizeObserver(() => this.syncGeometry());
        this.resizeObserver.observe(stage);
      }

      this.applyCamera();
      this.syncGeometry();
    }

    applyCamera(camera = this.cameraSnapshot()) {
      const stage = this.app.root.querySelector('[data-depth-host]');
      if (!stage || !camera) return;

      const live = PLANE_DEFINITIONS.find(plane => plane.role === 'live');
      const rear = PLANE_DEFINITIONS.find(plane => plane.role === 'rear');
      const reader = PLANE_DEFINITIONS.find(plane => plane.role === 'reader');
      const liveScale = camera.scaleAt(live.z);
      const rearScale = camera.scaleAt(rear.z) / liveScale;
      const readerScale = camera.scaleAt(reader.z) / liveScale;

      stage.style.setProperty('--drip-live-scale', '1');
      stage.style.setProperty('--drip-rear-scale', rearScale.toFixed(5));
      stage.style.setProperty('--drip-live-peek-scale', (readerScale * 1.015).toFixed(5));
      stage.style.setProperty('--drip-rear-peek-scale', Math.min(.96, rearScale * 1.075).toFixed(5));
      stage.style.setProperty('--drip-live-reading-scale', Math.max(.9, rearScale + .04).toFixed(5));
      stage.style.setProperty('--drip-rear-reading-scale', Math.max(.72, rearScale - .08).toFixed(5));
      stage.dataset.sharedCamera = 'true';
    }

    syncGeometry() {
      if (this.app.root.hidden) return;
      const root = this.app.root;
      const live = root.querySelector('.live-wall');
      const rear = root.querySelector('.rear-wall');
      const stage = root.querySelector('[data-depth-host]');
      if (!live || !stage) return;

      const styles = getComputedStyle(root);
      const cols = Number(styles.getPropertyValue('--cols')) || 5;
      const gap = parseFloat(styles.getPropertyValue('--gap')) || 8;
      const unit = (live.clientWidth - gap * (cols - 1)) / cols;
      if (unit > 0) root.style.setProperty('--unit', `${unit}px`);

      requestAnimationFrame(() => {
        if (root.hidden) return;
        stage.style.height = `${Math.max(live.scrollHeight, rear?.scrollHeight || 0, 520) + 28}px`;
      });
    }

    setReading(reading) {
      this.app.root.querySelector('[data-depth-host]')?.classList.toggle('reading', Boolean(reading));
    }

    afterRender() {
      this.applyCamera();
      requestAnimationFrame(() => this.syncGeometry());
    }

    resume() {
      this.applyCamera();
      this.syncGeometry();
    }

    pause() {}

    destroy() {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('ncn:chamber-camera-change', this.onCameraChange);
      this.resizeObserver?.disconnect();
      this.bound = false;
    }

    getPlaneDefinitions() {
      return PLANE_DEFINITIONS.map(plane => ({ ...plane }));
    }
  }

  DF.depth = { SharedDepthAdapter, PLANE_DEFINITIONS };
})(window.Dripfeed = window.Dripfeed || {});
