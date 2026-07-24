(function (DF) {
  const OPEN_DURATION = 620;
  const CLOSE_DURATION = 560;

  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const px = value => `${Math.round(value * 100) / 100}px`;
  const mix = (start, end, progress) => start + (end - start) * progress;

  function cleanClone(element, extraClass) {
    const clone = element.cloneNode(true);
    clone.classList.remove('reader-transition-source', 'reader-transition-target');
    clone.classList.add(extraClass);
    clone.removeAttribute('id');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    clone.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(node => {
      node.setAttribute('tabindex', '-1');
      node.setAttribute('aria-hidden', 'true');
    });
    return clone;
  }

  function rectFrame(rect, z = 0) {
    return {
      left: px(rect.left),
      top: px(rect.top),
      width: px(rect.width),
      height: px(rect.height),
      transform: `translateZ(${z}px)`
    };
  }

  class ReaderTransition {
    constructor(app) {
      this.app = app;
      this.busy = false;
      this.opened = false;
      this.sourceElement = null;
      this.flightStage = null;
      this.sequence = 0;
      this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
      this.onKeyDown = event => {
        if (event.key === 'Escape' && this.opened && !this.busy) this.close();
      };
      document.addEventListener('keydown', this.onKeyDown);
    }

    get overlay() {
      return this.app.root.querySelector('[data-overlay="reader"]');
    }

    get target() {
      return this.app.root.querySelector('[data-reader-target]');
    }

    reducedMotion() {
      return Boolean(this.motionQuery?.matches);
    }

    setOverlayVisible(visible) {
      const overlay = this.overlay;
      if (!overlay) return;
      overlay.classList.toggle('open', visible);
      overlay.setAttribute('aria-hidden', String(!visible));
      document.body.style.overflow = visible ? 'hidden' : '';
    }

    clearFlight() {
      this.flightStage?.remove();
      this.flightStage = null;
    }

    revealSource() {
      this.sourceElement?.classList.remove('reader-transition-source');
      this.sourceElement = null;
    }

    createFlight(sourceElement, targetElement) {
      const stage = document.createElement('div');
      stage.className = 'reader-flight-stage';
      stage.setAttribute('aria-hidden', 'true');

      const shell = document.createElement('div');
      shell.className = 'reader-flight-shell';

      const sourceFace = document.createElement('div');
      sourceFace.className = 'reader-flight-face reader-flight-source';
      sourceFace.append(cleanClone(sourceElement, 'reader-flight-source-card'));

      const targetFace = document.createElement('div');
      targetFace.className = 'reader-flight-face reader-flight-target';
      targetFace.append(cleanClone(targetElement, 'reader-flight-target-card'));

      shell.append(sourceFace, targetFace);
      stage.append(shell);
      this.app.root.append(stage);
      this.flightStage = stage;

      return { stage, shell, sourceFace, targetFace };
    }

    async open(post, sourceElement) {
      if (this.busy || this.opened) return false;
      const sequence = ++this.sequence;
      const overlay = this.overlay;
      const target = this.target;
      if (!overlay || !target) return false;

      this.busy = true;
      this.app.state.active = post;
      target.innerHTML = DF.render.readerMarkup(post);
      const readerCard = target.querySelector('.reader-card');
      this.sourceElement = sourceElement || this.app.root.querySelector(`[data-post-id="${post.id}"]`);

      overlay.classList.add('reader-transitioning', 'reader-opening');
      this.setOverlayVisible(true);
      this.app.depth.setReading(true);

      await nextFrame();
      await nextFrame();
      if (sequence !== this.sequence) return false;

      if (!readerCard || !this.sourceElement || this.reducedMotion()) {
        overlay.classList.remove('reader-transitioning', 'reader-opening');
        overlay.classList.add('reader-resolved');
        this.opened = true;
        this.busy = false;
        return true;
      }

      const sourceRect = this.sourceElement.getBoundingClientRect();
      const targetRect = readerCard.getBoundingClientRect();
      if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
        overlay.classList.remove('reader-transitioning', 'reader-opening');
        overlay.classList.add('reader-resolved');
        this.opened = true;
        this.busy = false;
        return true;
      }

      const { shell, sourceFace, targetFace } = this.createFlight(this.sourceElement, readerCard);
      Object.assign(shell.style, rectFrame(sourceRect, -125));
      this.sourceElement.classList.add('reader-transition-source');

      const overshoot = {
        left: targetRect.left - targetRect.width * .018,
        top: targetRect.top - targetRect.height * .018,
        width: targetRect.width * 1.036,
        height: targetRect.height * 1.036
      };
      const approach = {
        left: mix(sourceRect.left, targetRect.left, .82),
        top: mix(sourceRect.top, targetRect.top, .82),
        width: mix(sourceRect.width, targetRect.width, .88),
        height: mix(sourceRect.height, targetRect.height, .88)
      };

      const shellAnimation = shell.animate([
        {
          ...rectFrame(sourceRect, -125),
          offset: 0,
          filter: 'brightness(.72) saturate(.78)',
          boxShadow: '0 0 0 rgba(240,68,57,0)'
        },
        {
          ...rectFrame(approach, 82),
          offset: .58,
          filter: 'brightness(1.17) saturate(1.04)',
          boxShadow: '0 22px 74px rgba(0,0,0,.72), 0 0 34px rgba(240,68,57,.28)'
        },
        {
          ...rectFrame(overshoot, 145),
          offset: .78,
          filter: 'brightness(1.28) saturate(1.1)',
          boxShadow: '0 30px 96px rgba(0,0,0,.82), 0 0 48px rgba(240,68,57,.42)'
        },
        {
          ...rectFrame(targetRect, 0),
          offset: 1,
          filter: 'brightness(1) saturate(1)',
          boxShadow: '0 25px 95px #000, 0 0 42px rgba(240,68,57,.18)'
        }
      ], {
        duration: OPEN_DURATION,
        easing: 'cubic-bezier(.18,.76,.18,1)',
        fill: 'forwards'
      });

      const sourceAnimation = sourceFace.animate([
        { opacity: 1, filter: 'blur(0)', transform: 'scale(1)', offset: 0 },
        { opacity: .94, filter: 'blur(0)', transform: 'scale(1)', offset: .38 },
        { opacity: 0, filter: 'blur(5px)', transform: 'scale(1.035)', offset: .7 },
        { opacity: 0, filter: 'blur(7px)', transform: 'scale(1.05)', offset: 1 }
      ], { duration: OPEN_DURATION, easing: 'linear', fill: 'forwards' });

      const targetAnimation = targetFace.animate([
        { opacity: 0, filter: 'blur(8px)', transform: 'scale(.965)', offset: 0 },
        { opacity: 0, filter: 'blur(7px)', transform: 'scale(.97)', offset: .34 },
        { opacity: .82, filter: 'blur(1px)', transform: 'scale(.995)', offset: .72 },
        { opacity: 1, filter: 'blur(0)', transform: 'scale(1)', offset: 1 }
      ], { duration: OPEN_DURATION, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });

      await Promise.allSettled([
        shellAnimation.finished,
        sourceAnimation.finished,
        targetAnimation.finished
      ]);
      if (sequence !== this.sequence) return false;

      this.clearFlight();
      overlay.classList.remove('reader-transitioning', 'reader-opening');
      overlay.classList.add('reader-resolved');
      this.opened = true;
      this.busy = false;
      return true;
    }

    async close(options = {}) {
      const immediate = Boolean(options.immediate);
      const overlay = this.overlay;
      if (!overlay) return false;
      if ((!this.opened && !this.busy) || (this.busy && !immediate)) return false;
      const sequence = ++this.sequence;

      const readerCard = this.target?.querySelector('.reader-card');
      const sourceElement = this.sourceElement;

      if (immediate || this.reducedMotion() || !readerCard || !sourceElement || !sourceElement.isConnected) {
        this.clearFlight();
        this.revealSource();
        overlay.classList.remove('reader-transitioning', 'reader-opening', 'reader-closing', 'reader-resolved');
        this.setOverlayVisible(false);
        this.app.depth.setReading(false);
        this.app.state.active = null;
        if (this.target) this.target.replaceChildren();
        this.opened = false;
        this.busy = false;
        return true;
      }

      this.busy = true;
      overlay.classList.remove('reader-resolved');
      overlay.classList.add('reader-transitioning', 'reader-closing');

      const targetRect = readerCard.getBoundingClientRect();
      const sourceRect = sourceElement.getBoundingClientRect();
      const { shell, sourceFace, targetFace } = this.createFlight(sourceElement, readerCard);
      Object.assign(shell.style, rectFrame(targetRect, 0));
      this.app.depth.setReading(false);
      this.setOverlayVisible(false);

      const pulse = {
        left: targetRect.left - targetRect.width * .008,
        top: targetRect.top - targetRect.height * .008,
        width: targetRect.width * 1.016,
        height: targetRect.height * 1.016
      };
      const retreat = {
        left: mix(targetRect.left, sourceRect.left, .84),
        top: mix(targetRect.top, sourceRect.top, .84),
        width: mix(targetRect.width, sourceRect.width, .86),
        height: mix(targetRect.height, sourceRect.height, .86)
      };

      const shellAnimation = shell.animate([
        {
          ...rectFrame(targetRect, 0),
          offset: 0,
          filter: 'brightness(1) saturate(1)',
          boxShadow: '0 25px 95px #000, 0 0 42px rgba(240,68,57,.18)'
        },
        {
          ...rectFrame(pulse, 105),
          offset: .2,
          filter: 'brightness(1.2) saturate(1.08)',
          boxShadow: '0 30px 100px rgba(0,0,0,.84), 0 0 48px rgba(240,68,57,.4)'
        },
        {
          ...rectFrame(retreat, -60),
          offset: .72,
          filter: 'brightness(.92) saturate(.92)',
          boxShadow: '0 14px 50px rgba(0,0,0,.58), 0 0 22px rgba(240,68,57,.2)'
        },
        {
          ...rectFrame(sourceRect, -135),
          offset: 1,
          filter: 'brightness(.75) saturate(.8)',
          boxShadow: '0 0 0 rgba(240,68,57,0)'
        }
      ], {
        duration: CLOSE_DURATION,
        easing: 'cubic-bezier(.4,0,.3,1)',
        fill: 'forwards'
      });

      const targetAnimation = targetFace.animate([
        { opacity: 1, filter: 'blur(0)', transform: 'scale(1)', offset: 0 },
        { opacity: .9, filter: 'blur(0)', transform: 'scale(1)', offset: .28 },
        { opacity: 0, filter: 'blur(5px)', transform: 'scale(.97)', offset: .68 },
        { opacity: 0, filter: 'blur(7px)', transform: 'scale(.95)', offset: 1 }
      ], { duration: CLOSE_DURATION, easing: 'linear', fill: 'forwards' });

      const sourceAnimation = sourceFace.animate([
        { opacity: 0, filter: 'blur(7px)', transform: 'scale(1.05)', offset: 0 },
        { opacity: 0, filter: 'blur(6px)', transform: 'scale(1.035)', offset: .32 },
        { opacity: .86, filter: 'blur(1px)', transform: 'scale(1.005)', offset: .76 },
        { opacity: 1, filter: 'blur(0)', transform: 'scale(1)', offset: 1 }
      ], { duration: CLOSE_DURATION, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });

      await Promise.allSettled([
        shellAnimation.finished,
        targetAnimation.finished,
        sourceAnimation.finished
      ]);
      if (sequence !== this.sequence) return false;

      this.clearFlight();
      this.revealSource();
      overlay.classList.remove('reader-transitioning', 'reader-closing', 'reader-opening', 'reader-resolved');
      overlay.setAttribute('aria-hidden', 'true');
      this.app.state.active = null;
      if (this.target) this.target.replaceChildren();
      this.opened = false;
      this.busy = false;
      return true;
    }

    destroy() {
      document.removeEventListener('keydown', this.onKeyDown);
      this.close({ immediate: true });
    }
  }

  DF.readerTransition = { ReaderTransition };
})(window.Dripfeed = window.Dripfeed || {});
