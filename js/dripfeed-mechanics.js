/*==================================================
  DRIPFEED SURFACE MECHANICS

  Protected Dripfeed-owned rules for:
  - shape envelopes and strict square-cell packing;
  - stable board seeds and exposure memory;
  - post-level headline voices and image treatments;
  - live/latent membership semantics.

  The chamber host may position the resulting surfaces, but must not recalculate
  tile shapes, typography or publication state.
==================================================*/
(function (DF) {
  'use strict';

  const SHAPES = Object.freeze({
    square: Object.freeze({ key: 'square', className: 'tile-square', width: 1, height: 1, area: 1 }),
    wide: Object.freeze({ key: 'wide', className: 'tile-wide', width: 2, height: 1, area: 2 }),
    tall: Object.freeze({ key: 'tall', className: 'tile-tall', width: 1, height: 2, area: 2 }),
    feature: Object.freeze({ key: 'feature', className: 'tile-feature', width: 2, height: 2, area: 4 }),
    banner: Object.freeze({ key: 'banner', className: 'tile-banner', width: 3, height: 1, area: 3 }),
    poster: Object.freeze({ key: 'poster', className: 'tile-poster', width: 2, height: 3, area: 6 })
  });

  const FONT_VOICES = Object.freeze({
    wire: Object.freeze({ key: 'wire', label: 'Wire', className: 'font-wire' }),
    neuro: Object.freeze({ key: 'neuro', label: 'Neuro', className: 'font-neuro' }),
    tag: Object.freeze({ key: 'tag', label: 'Tag', className: 'font-tag' }),
    blackletter: Object.freeze({ key: 'blackletter', label: 'Blackletter', className: 'font-blackletter' }),
    stencil: Object.freeze({ key: 'stencil', label: 'Stencil', className: 'font-stencil' })
  });

  const IMAGE_TREATMENTS = Object.freeze({
    full: Object.freeze({ key: 'full', className: 'image-full' }),
    ghost: Object.freeze({ key: 'ghost', className: 'image-ghost' }),
    band: Object.freeze({ key: 'band', className: 'image-band' }),
    split: Object.freeze({ key: 'split', className: 'image-split' }),
    inset: Object.freeze({ key: 'inset', className: 'image-inset' })
  });

  const TEXT_BUDGETS = Object.freeze({
    square: Object.freeze({ headlineLines: 3, bodyLines: 2 }),
    wide: Object.freeze({ headlineLines: 2, bodyLines: 3 }),
    tall: Object.freeze({ headlineLines: 5, bodyLines: 6 }),
    feature: Object.freeze({ headlineLines: 4, bodyLines: 7 }),
    banner: Object.freeze({ headlineLines: 2, bodyLines: 2 }),
    poster: Object.freeze({ headlineLines: 5, bodyLines: 10 })
  });

  const DEFAULT_STATE = Object.freeze({ seed: 1, cycle: 0, impressions: {}, profiles: {} });

  function hash(value) {
    const text = String(value ?? '');
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function seededUnit(value) {
    return hash(value) / 4294967295;
  }

  function weightedPick(entries, seedValue) {
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let cursor = seededUnit(seedValue) * total;
    for (const [value, weight] of entries) {
      cursor -= weight;
      if (cursor <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  function imageOrientation(post) {
    const image = post?.image;
    if (!image) return 'none';
    const explicit = String(image.orientation || '').toLowerCase();
    if (['portrait', 'landscape', 'square', 'squarish'].includes(explicit)) {
      return explicit === 'squarish' ? 'square' : explicit;
    }
    const width = Number(image.width);
    const height = Number(image.height);
    if (width > 0 && height > 0) {
      const ratio = width / height;
      if (ratio > 1.22) return 'landscape';
      if (ratio < 0.82) return 'portrait';
      return 'square';
    }
    if (post.category === 'jobs' || post.category === 'rides') return 'landscape';
    if (post.category === 'services') return 'portrait';
    return 'square';
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function envelopeFor(post) {
    const orientation = imageOrientation(post);
    const titleWords = String(post?.title || '').trim().split(/\s+/).filter(Boolean).length;
    const bodyLength = String(post?.body || '').length;
    const eventLike = post?.listingType === 'event' || post?.category === 'community';
    const urgent = Boolean(post?.urgent || post?.featured || post?.sponsored);
    let allowed = ['square', 'wide'];
    let preferred = 'square';

    if (orientation === 'portrait') {
      allowed = ['tall', 'feature', 'poster', 'square', 'wide'];
      preferred = titleWords > 7 ? 'feature' : 'tall';
    } else if (orientation === 'landscape') {
      allowed = ['wide', 'banner', 'feature', 'square', 'tall'];
      preferred = eventLike ? 'banner' : 'wide';
    } else if (orientation === 'square') {
      allowed = ['square', 'wide', 'tall', 'feature'];
      preferred = eventLike ? 'feature' : 'square';
    } else {
      allowed = ['square', 'wide'];
      if (titleWords > 6 || bodyLength > 150) allowed.push('tall');
      if (eventLike) allowed.push('banner');
      preferred = titleWords > 5 ? 'wide' : 'square';
    }

    if (eventLike && !allowed.includes('banner')) allowed.push('banner');
    if (urgent && post?.image) allowed.push('poster');
    if (urgent && !post?.image) allowed.push('feature');

    if (post?.shapeEnvelope?.allowed) {
      allowed = unique(post.shapeEnvelope.allowed).filter(key => SHAPES[key]);
    }
    if (post?.shapeEnvelope?.preferred && SHAPES[post.shapeEnvelope.preferred]) {
      preferred = post.shapeEnvelope.preferred;
    }

    allowed = unique([preferred, ...allowed, 'square']).filter(key => SHAPES[key]);
    return Object.freeze({
      allowed: Object.freeze(allowed),
      preferred: allowed.includes(preferred) ? preferred : allowed[0],
      minimum: allowed.reduce((best, key) => SHAPES[key].area < SHAPES[best].area ? key : best, allowed[0]),
      maximum: allowed.reduce((best, key) => SHAPES[key].area > SHAPES[best].area ? key : best, allowed[0]),
      orientation
    });
  }

  function derivedProfile(post) {
    const base = post?.id || `${post?.title}|${post?.posterAlias}`;
    const eventLike = post?.listingType === 'event' || post?.category === 'community';
    const voice = FONT_VOICES[post?.fontVoice]
      ? post.fontVoice
      : eventLike
        ? weightedPick([['wire', 35], ['stencil', 35], ['blackletter', 15], ['neuro', 10], ['tag', 5]], `${base}:voice`)
        : weightedPick([['wire', 50], ['neuro', 16], ['tag', 12], ['blackletter', 9], ['stencil', 13]], `${base}:voice`);
    const treatment = post?.image
      ? (IMAGE_TREATMENTS[post?.imageTreatment]
          ? post.imageTreatment
          : weightedPick([['full', 34], ['ghost', 18], ['band', 16], ['split', 18], ['inset', 14]], `${base}:image`))
      : 'none';
    return Object.freeze({
      fontVoice: voice,
      imageTreatment: treatment,
      envelope: envelopeFor(post)
    });
  }

  class ExposureStore {
    constructor(options = {}) {
      this.storageKey = options.storageKey || `${DF.config?.storageKey || 'ncn-dripfeed'}-surface`;
      this.state = {
        seed: hash(`${DF.config?.terminalId || 'terminal'}:${String(DF.config?.worldNow || '').slice(0, 10)}`) || 1,
        cycle: 0,
        impressions: {},
        profiles: {}
      };
      this.load();
    }

    load() {
      try {
        const stored = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
        if (!stored || typeof stored !== 'object') return;
        this.state.seed = Number.isFinite(stored.seed) ? stored.seed : this.state.seed;
        this.state.cycle = Number.isFinite(stored.cycle) ? stored.cycle : 0;
        this.state.impressions = stored.impressions && typeof stored.impressions === 'object' ? stored.impressions : {};
        this.state.profiles = stored.profiles && typeof stored.profiles === 'object' ? stored.profiles : {};
      } catch (error) {
        console.warn('Dripfeed surface memory could not be restored', error);
      }
    }

    persist() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
      } catch (error) {
        console.warn('Dripfeed surface memory could not be stored', error);
      }
    }

    record(id) {
      const key = String(id);
      if (!this.state.impressions[key]) {
        this.state.impressions[key] = {
          firstSeen: 0,
          lastSeen: 0,
          timesShown: 0,
          opened: 0,
          lastOpened: 0,
          openedCycle: -1,
          dismissed: false,
          acted: false
        };
      }
      return this.state.impressions[key];
    }

    get(id) {
      return { ...this.record(id) };
    }

    markSeen(id, time = Date.now()) {
      const record = this.record(id);
      if (!record.firstSeen) record.firstSeen = time;
      record.lastSeen = time;
      record.timesShown = Number(record.timesShown || 0) + 1;
      this.persist();
      return { ...record };
    }

    markOpened(id, time = Date.now()) {
      const record = this.record(id);
      record.opened = Number(record.opened || 0) + 1;
      record.lastOpened = time;
      record.openedCycle = this.state.cycle;
      this.persist();
      return { ...record };
    }

    markActed(id) {
      const record = this.record(id);
      record.acted = true;
      this.persist();
      return { ...record };
    }

    dismiss(id) {
      const record = this.record(id);
      record.dismissed = true;
      this.persist();
      return { ...record };
    }

    restore(id) {
      const record = this.record(id);
      record.dismissed = false;
      record.openedCycle = this.state.cycle;
      this.persist();
      return { ...record };
    }

    shouldRemainLive(id) {
      const record = this.record(id);
      if (record.dismissed) return false;
      if (record.opened > 0 && record.openedCycle >= 0 && this.state.cycle > record.openedCycle) return false;
      return true;
    }

    bumpSeed() {
      this.state.seed = hash(`${this.state.seed}:${Date.now()}:${this.state.cycle}`) || this.state.seed + 1;
      this.state.cycle += 1;
      this.persist();
      return this.state.seed;
    }

    profileFor(post) {
      const id = String(post.id);
      const stored = this.state.profiles[id];
      if (stored && FONT_VOICES[stored.fontVoice]) {
        return Object.freeze({
          fontVoice: stored.fontVoice,
          imageTreatment: post.image && IMAGE_TREATMENTS[stored.imageTreatment] ? stored.imageTreatment : (post.image ? 'full' : 'none'),
          envelope: envelopeFor(post)
        });
      }
      const profile = derivedProfile(post);
      this.state.profiles[id] = {
        fontVoice: profile.fontVoice,
        imageTreatment: profile.imageTreatment
      };
      this.persist();
      return profile;
    }

    setProfile(id, values = {}) {
      const key = String(id);
      const current = this.state.profiles[key] || {};
      this.state.profiles[key] = {
        fontVoice: FONT_VOICES[values.fontVoice] ? values.fontVoice : (current.fontVoice || 'wire'),
        imageTreatment: IMAGE_TREATMENTS[values.imageTreatment] ? values.imageTreatment : (current.imageTreatment || 'full')
      };
      this.persist();
      return { ...this.state.profiles[key] };
    }

    reset() {
      this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      this.state.seed = hash(`${DF.config?.terminalId || 'terminal'}:${String(DF.config?.worldNow || '').slice(0, 10)}`) || 1;
      this.persist();
    }

    snapshot() {
      return JSON.parse(JSON.stringify(this.state));
    }
  }

  function selectionScore(post, memory, seed, role) {
    const record = memory.get(post.id);
    const created = Number(new Date(post.createdAt)) || 0;
    const freshness = created / 86400000;
    const unseen = record.timesShown ? 0 : 65;
    const seenPenalty = Math.min(28, Number(record.timesShown || 0) * 4);
    const openedPenalty = Math.min(42, Number(record.opened || 0) * 15);
    const imageBonus = post.image ? 8 : 0;
    const roleBias = role === 'latent' ? openedPenalty + seenPenalty : unseen - seenPenalty - openedPenalty;
    return freshness + roleBias + imageBonus + seededUnit(`${seed}:${post.id}:score`) * 8;
  }

  function shapeOrder(post, profile, memory, seed, columns, role) {
    const record = memory.get(post.id);
    const candidates = profile.envelope.allowed
      .filter(key => SHAPES[key].width <= columns)
      .map(key => {
        const shape = SHAPES[key];
        let score = seededUnit(`${seed}:${post.id}:${key}`) * 5;
        if (key === profile.envelope.preferred) score += 24;
        if (post.image && shape.area >= 3) score += 7;
        if (!post.image && shape.area > 4) score -= 16;
        if (!record.timesShown && role === 'live') score += shape.area * 2.1;
        if (record.opened && role === 'live') score -= shape.area * 2.6;
        if (role === 'latent') score -= shape.area * 1.2;
        if (profile.fontVoice === 'blackletter' && ['square', 'wide', 'banner'].includes(key)) score += 4;
        if (profile.fontVoice === 'tag' && ['square', 'tall', 'feature'].includes(key)) score += 4;
        if (profile.fontVoice === 'stencil' && ['wide', 'banner'].includes(key)) score += 5;
        return { key, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.key);
    return unique([...candidates, 'square']).filter(key => SHAPES[key].width <= columns);
  }

  function canPlace(matrix, row, column, shape, columns) {
    if (column + shape.width > columns) return false;
    for (let y = row; y < row + shape.height; y += 1) {
      const occupied = matrix[y] || [];
      for (let x = column; x < column + shape.width; x += 1) {
        if (occupied[x]) return false;
      }
    }
    return true;
  }

  function occupy(matrix, row, column, shape, id) {
    for (let y = row; y < row + shape.height; y += 1) {
      if (!matrix[y]) matrix[y] = [];
      for (let x = column; x < column + shape.width; x += 1) matrix[y][x] = id;
    }
  }

  function placementCost(matrix, row, column, shape, columns, previousPlacements) {
    let cost = row * 100 + column;
    const neighbours = previousPlacements.filter(item => {
      const horizontalTouch = item.row < row + shape.height && item.row + item.height > row
        && (item.column + item.width === column || column + shape.width === item.column);
      const verticalTouch = item.column < column + shape.width && item.column + item.width > column
        && (item.row + item.height === row || row + shape.height === item.row);
      return horizontalTouch || verticalTouch;
    });
    cost += neighbours.filter(item => item.shape === shape.key).length * 12;
    const rowCells = matrix[row] || [];
    const occupiedBefore = rowCells.slice(0, column).filter(Boolean).length;
    if (column > 0 && occupiedBefore === 0) cost += 8;
    if (column + shape.width < columns && rowCells[column + shape.width]) cost -= 3;
    return cost;
  }

  class BoardPlanner {
    constructor(options = {}) {
      this.columns = Math.max(1, Math.floor(options.columns || 3));
      this.seed = Number(options.seed) || 1;
      this.memory = options.memory;
      this.role = options.role || 'live';
      this.maxRows = Math.max(12, Math.floor(options.maxRows || 240));
    }

    plan(posts) {
      const memory = this.memory;
      const ranked = [...posts].sort((a, b) => {
        const scoreDifference = selectionScore(b, memory, this.seed, this.role) - selectionScore(a, memory, this.seed, this.role);
        if (Math.abs(scoreDifference) > 0.001) return scoreDifference;
        return String(a.id).localeCompare(String(b.id));
      });
      const matrix = [];
      const placements = [];

      for (const post of ranked) {
        const profile = memory.profileFor(post);
        const orderedShapes = shapeOrder(post, profile, memory, this.seed, this.columns, this.role);
        let best = null;

        for (const shapeKey of orderedShapes) {
          const shape = SHAPES[shapeKey];
          for (let row = 0; row < this.maxRows; row += 1) {
            for (let column = 0; column < this.columns; column += 1) {
              if (!canPlace(matrix, row, column, shape, this.columns)) continue;
              const cost = placementCost(matrix, row, column, shape, this.columns, placements);
              if (!best || cost < best.cost) best = { shape, row, column, cost };
              if (cost <= row * 100 + 1) break;
            }
            if (best && best.row === row) break;
          }
          if (best && best.shape.key === shapeKey) break;
        }

        if (!best) continue;
        occupy(matrix, best.row, best.column, best.shape, post.id);
        const treatment = post.image
          ? (profile.imageTreatment === 'split' && best.shape.width === 1 ? 'full' : profile.imageTreatment)
          : 'none';
        placements.push(Object.freeze({
          post,
          postId: post.id,
          role: this.role,
          shape: best.shape.key,
          className: best.shape.className,
          width: best.shape.width,
          height: best.shape.height,
          column: best.column,
          row: best.row,
          fontVoice: profile.fontVoice,
          imageTreatment: treatment,
          textBudget: TEXT_BUDGETS[best.shape.key]
        }));
      }

      const rows = placements.reduce((maximum, item) => Math.max(maximum, item.row + item.height), 0);
      return Object.freeze({
        columns: this.columns,
        rows,
        placements: Object.freeze(placements.sort((a, b) => a.row - b.row || a.column - b.column))
      });
    }
  }

  function dispatch(root, name, detail = {}) {
    if (!root?.dispatchEvent || typeof CustomEvent !== 'function') return false;
    return root.dispatchEvent(new CustomEvent(`dripfeed:${name}`, {
      bubbles: true,
      detail: Object.freeze({ ...detail })
    }));
  }

  DF.mechanics = Object.freeze({
    SHAPES,
    FONT_VOICES,
    IMAGE_TREATMENTS,
    TEXT_BUDGETS,
    hash,
    seededUnit,
    imageOrientation,
    envelopeFor,
    derivedProfile,
    ExposureStore,
    BoardPlanner,
    dispatch
  });
})(window.Dripfeed = window.Dripfeed || {});
