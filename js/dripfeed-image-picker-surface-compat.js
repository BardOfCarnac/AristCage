/*==================================================
  DRIPFEED · IMAGE PICKER SURFACE COMPATIBILITY

  Provider-neutral image publication corrections that must install after the
  Dripfeed surface controller and before the application instance is mounted.
  Chamber placement, membership and packing remain owned by their existing
  publications.
==================================================*/
(function (DF) {
  'use strict';

  const App = DF.App;
  if (!App || !DF.surface?.installed || DF.imagePickerSurfaceCompat?.installed) return;

  // The established seed cards predate provider dimensions. Keep their original
  // category-derived shape envelopes; live provider results retain real sizes.
  for (const post of DF.model?.seedPosts || []) {
    if (post?.image?.provider !== 'demo') continue;
    post.image.orientation = '';
    post.image.width = 0;
    post.image.height = 0;
  }

  const originalMount = App.prototype.mount;
  const originalRenderWall = App.prototype.renderWall;

  function bindPickerInteractions(app) {
    if (app.imagePickerSurfaceInteractions) return;
    const handler = event => {
      const sourceButton = event.target.closest?.('[data-image-source]');
      if (sourceButton) {
        event.preventDefault();
        event.stopPropagation();
        app.submit?.changeSource?.(sourceButton.dataset.imageSource);
        return;
      }

      const photoButton = event.target.closest?.('[data-photo-index]');
      if (!photoButton) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(photoButton.dataset.photoIndex);
      const photo = app.submit?.results?.[index];
      if (photo) app.submit.selectPhoto(photo);
    };
    app.root.addEventListener('click', handler, true);
    app.imagePickerSurfaceInteractions = handler;
  }

  function publishMissingCredits(app) {
    if (!DF.render?.hasVisibleCredit || !DF.render?.imageCredit) return;
    const posts = new Map((app.store?.posts || []).map(post => [String(post.id), post]));
    app.root.querySelectorAll('.listing-wall .listing-tile[data-post-id]').forEach(tile => {
      const post = posts.get(String(tile.dataset.postId));
      if (!post?.image || !DF.render.hasVisibleCredit(post.image) || tile.querySelector('.photo-credit')) return;
      const credit = document.createElement('div');
      credit.className = 'photo-credit';
      credit.innerHTML = DF.render.imageCredit(post.image);
      const footer = tile.querySelector('.tile-footer');
      footer?.before(credit);
    });
  }

  App.prototype.mount = function (...args) {
    const result = originalMount.apply(this, args);
    bindPickerInteractions(this);
    publishMissingCredits(this);
    return result;
  };

  App.prototype.renderWall = function (...args) {
    const result = originalRenderWall.apply(this, args);
    publishMissingCredits(this);
    return result;
  };

  const originalDestroy = App.prototype.destroy;
  App.prototype.destroy = function (...args) {
    if (this.imagePickerSurfaceInteractions) {
      this.root.removeEventListener('click', this.imagePickerSurfaceInteractions, true);
      this.imagePickerSurfaceInteractions = null;
    }
    return originalDestroy.apply(this, args);
  };

  DF.imagePickerSurfaceCompat = Object.freeze({
    installed: true,
    bindPickerInteractions,
    publishMissingCredits
  });
})(window.Dripfeed = window.Dripfeed || {});
