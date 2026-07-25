/*==================================================
  MOBILE LAYOUT VIEWPORT NORMALIZER

  Some Android browser states expose a desktop-width layout viewport while the
  fixed chamber canvas still fills the physical display. In that state the DOM
  appears as a miniature desktop page. This adds a class only when the mismatch
  is unambiguous; normal mobile and desktop viewports are untouched.
==================================================*/

(() => {
  const CLASS_NAME = 'ncn-mobile-viewport-normalized';
  const MIN_RATIO = 1.35;
  const MAX_DEVICE_WIDTH = 760;

  function coarsePointer() {
    return Boolean(
      window.matchMedia?.('(any-pointer: coarse)')?.matches
      || navigator.maxTouchPoints > 0
    );
  }

  function physicalScreenWidth() {
    const values = [
      Number(window.screen?.width),
      Number(window.screen?.availWidth)
    ].filter(value => Number.isFinite(value) && value > 0);

    return values.length ? Math.min(...values) : 0;
  }

  function layoutViewportWidth() {
    return Math.max(
      Number(document.documentElement?.clientWidth) || 0,
      Number(window.innerWidth) || 0
    );
  }

  function apply() {
    const root = document.documentElement;
    const screenWidth = physicalScreenWidth();
    const layoutWidth = layoutViewportWidth();
    const ratio = screenWidth > 0 ? layoutWidth / screenWidth : 1;
    const shouldNormalize = coarsePointer()
      && screenWidth > 0
      && screenWidth <= MAX_DEVICE_WIDTH
      && ratio >= MIN_RATIO;

    root.classList.toggle(CLASS_NAME, shouldNormalize);

    if (shouldNormalize) {
      root.style.setProperty('--ncn-mobile-screen-width', `${screenWidth}px`);
      root.style.setProperty('--ncn-mobile-layout-scale', ratio.toFixed(5));
      root.dataset.mobileViewportRatio = ratio.toFixed(3);
    } else {
      root.style.removeProperty('--ncn-mobile-screen-width');
      root.style.removeProperty('--ncn-mobile-layout-scale');
      delete root.dataset.mobileViewportRatio;
    }

    window.dispatchEvent(new CustomEvent('ncn:mobile-viewport-normalized', {
      detail: {
        active: shouldNormalize,
        screenWidth,
        layoutWidth,
        ratio
      }
    }));
  }

  let frame = 0;
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  }

  apply();
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
})();
