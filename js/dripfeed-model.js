(function (DF) {
  const terminalConfig = window.NCN_CONFIG?.dripfeed || {};
  DF.config = Object.assign({
    worldNow: '2045-07-14T21:17:00-07:00',
    unsplashSearchEndpoint: terminalConfig.unsplashSearchEndpoint || '',
    unsplashTrackEndpoint: terminalConfig.unsplashTrackEndpoint || '',
    terminalId: '08-441',
    appVersion: '0.8.0',
    storageKey: 'ncn-dripfeed-v08'
  }, window.DRIPFEED_CONFIG || {});
})(window.Dripfeed = window.Dripfeed || {});

(function (DF) {
  const CATEGORIES = {
    items:     { code: 'ITE', label: 'Items',     mark: '◇' },
    services:  { code: 'SRV', label: 'Services',  mark: '//' },
    housing:   { code: 'HAB', label: 'Housing',   mark: '□' },
    jobs:      { code: 'WRK', label: 'Jobs',      mark: '+' },
    rides:     { code: 'MOV', label: 'Rides',     mark: '»' },
    community: { code: 'COM', label: 'Community', mark: '○' }
  };
  const LISTING_TYPES = {
    offer:  { label: 'Offering', short: 'OFFER' },
    wanted: { label: 'Wanted', short: 'WANTED' },
    event:  { label: 'Notice', short: 'NOTICE' }
  };
  const PUBLICATION_STATES = ['live', 'expired', 'removed'];

  function demoImage(label, a, b) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><pattern id="p" width="90" height="90" patternUnits="userSpaceOnUse"><path d="M0 90L90 0M-25 25L25-25M65 115L115 65" stroke="rgba(255,255,255,.12)" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#p)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" opacity=".9" font-family="monospace" font-size="54">${label}</text></svg>`;
    return { provider: 'demo', url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), alt: label };
  }

  const seedPosts = [
    { id:'DF-701', listingType:'offer', category:'services', title:'Courier runs across the river after dusk', body:'Two wheels, sealed bags, no questions. Same-night delivery across the central districts.', posterAlias:'FIXIE', district:'The Glen', valueLabel:'€$45 / RUN', contactMethod:'REDWIRE 6F-11', createdAt:'2045-07-14T21:11:00-07:00', expiresAt:'2045-07-17T21:11:00-07:00', publicationState:'live', image:demoImage('NIGHT COURIER','#130506','#e24831') },
    { id:'DF-702', listingType:'offer', category:'housing', title:'Industrial unit to share', body:'Dry lockup, three-phase power and a landlord who values silence. One bench already occupied.', posterAlias:'MARA-9', district:'South Night City', valueLabel:'€$620 / MO', contactMethod:'DROP 19 / NIGHT', createdAt:'2045-07-14T20:59:00-07:00', expiresAt:'2045-07-21T20:59:00-07:00', publicationState:'live', image:demoImage('LOCKUP 19','#0d1115','#5b6670') },
    { id:'DF-703', listingType:'offer', category:'items', title:'Vintage amp needs a new home', body:'Loud, ugly and almost indestructible. Patched twice. Cash or useful components.', posterAlias:'KNUCKLE', district:'Watson', valueLabel:'€$180', contactMethod:'ASK AT NEEDLE BAR', createdAt:'2045-07-14T20:46:00-07:00', expiresAt:'2045-07-18T20:46:00-07:00', publicationState:'live', image:null },
    { id:'DF-704', listingType:'event', category:'community', title:'Saturday rooftop planting crew', body:'Bring gloves. Soil, food and water supplied. Children welcome before dark.', posterAlias:'CIVIC GARDEN', district:'Heywood', valueLabel:'FREE', contactMethod:'CIVIC BAND 3', createdAt:'2045-07-14T20:34:00-07:00', expiresAt:'2045-07-16T20:34:00-07:00', publicationState:'live', image:demoImage('ROOFTOP GARDEN','#091711','#3b7e4f') },
    { id:'DF-705', listingType:'wanted', category:'jobs', title:'Driver wanted for one clean airport run', body:'Own vehicle preferred. Route details released after contact verification.', posterAlias:'ORBITAL JANE', district:'City Center', valueLabel:'€$320', contactMethod:'BURST CODE OJ-4', createdAt:'2045-07-14T20:26:00-07:00', expiresAt:'2045-07-15T20:26:00-07:00', publicationState:'live', image:demoImage('AIRPORT RUN','#0b0b1d','#733f82') },
    { id:'DF-706', listingType:'offer', category:'rides', title:'Ride share: Wellsprings to the Glen', body:'Leaving at 19:30. Two seats, small baggage only. No combat pets.', posterAlias:'TOMCAT', district:'Wellsprings', valueLabel:'€$20 / SEAT', contactMethod:'PING DF-706', createdAt:'2045-07-14T20:17:00-07:00', expiresAt:'2045-07-15T00:00:00-07:00', publicationState:'live', image:null },
    { id:'DF-682', listingType:'wanted', category:'items', title:'Seeking obsolete Kiroshi ribbon cable', body:'Original or compatible. Photograph both connectors before contact.', posterAlias:'GLASSHOUSE', district:'Little Europe', valueLabel:'NAME PRICE', contactMethod:'DEAD DROP GL-2', createdAt:'2045-07-13T18:10:00-07:00', expiresAt:'2045-07-14T19:00:00-07:00', publicationState:'expired', image:null }
  ];

  function normalisePost(raw) {
    const now = DF.config.worldNow;
    return {
      id: String(raw.id || `DF-${Math.floor(800 + Math.random()*900)}`),
      listingType: LISTING_TYPES[raw.listingType] ? raw.listingType : 'offer',
      category: CATEGORIES[raw.category] ? raw.category : 'items',
      title: String(raw.title || '').trim(),
      body: String(raw.body || '').trim(),
      posterAlias: String(raw.posterAlias || 'ANONYMOUS').trim(),
      district: String(raw.district || 'Citywide').trim(),
      valueLabel: String(raw.valueLabel || 'NEGOTIABLE').trim(),
      contactMethod: String(raw.contactMethod || 'REPLY VIA TERMINAL').trim(),
      createdAt: raw.createdAt || now,
      expiresAt: raw.expiresAt || new Date(new Date(now).getTime()+3*86400000).toISOString(),
      publicationState: PUBLICATION_STATES.includes(raw.publicationState) ? raw.publicationState : 'live',
      image: raw.image || null,
      custom: Boolean(raw.custom)
    };
  }

  function relativeTime(iso) {
    const delta = Math.max(0, new Date(DF.config.worldNow) - new Date(iso));
    const mins = Math.floor(delta/60000);
    if (mins < 60) return `${Math.max(1,mins)}M`;
    const hours = Math.floor(mins/60);
    if (hours < 24) return `${hours}H`;
    return `${Math.floor(hours/24)}D`;
  }

  function expiryLabel(iso) {
    const delta = new Date(iso) - new Date(DF.config.worldNow);
    if (delta <= 0) return 'EXPIRED';
    const hours = Math.ceil(delta/3600000);
    return hours < 24 ? `${hours}H LEFT` : `${Math.ceil(hours/24)}D LEFT`;
  }

  function effectiveState(post) {
    if (post.publicationState !== 'live') return post.publicationState;
    return new Date(post.expiresAt) <= new Date(DF.config.worldNow) ? 'expired' : 'live';
  }

  class Store {
    constructor() {
      this.posts = seedPosts.map(normalisePost);
      this.terminal = { seenIds:new Set(), savedIds:new Set() };
      this.load();
    }
    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(DF.config.storageKey) || '{}');
        const custom = Array.isArray(saved.posts) ? saved.posts.map(normalisePost) : [];
        this.posts = [...custom, ...this.posts];
        this.terminal.seenIds = new Set(saved.seenIds || []);
        this.terminal.savedIds = new Set(saved.savedIds || []);
      } catch (error) { console.warn('Dripfeed state could not be restored', error); }
    }
    persist() {
      localStorage.setItem(DF.config.storageKey, JSON.stringify({
        posts:this.posts.filter(post=>post.custom),
        seenIds:[...this.terminal.seenIds],
        savedIds:[...this.terminal.savedIds]
      }));
    }
    add(post) { this.posts.unshift(normalisePost({...post, custom:true})); this.persist(); }
    markSeen(id, seen=true) { seen ? this.terminal.seenIds.add(id) : this.terminal.seenIds.delete(id); this.persist(); }
    toggleSaved(id) { this.terminal.savedIds.has(id) ? this.terminal.savedIds.delete(id) : this.terminal.savedIds.add(id); this.persist(); }
    clearLocal() { localStorage.removeItem(DF.config.storageKey); this.posts=seedPosts.map(normalisePost); this.terminal={seenIds:new Set(),savedIds:new Set()}; }
  }

  DF.model = { CATEGORIES, LISTING_TYPES, PUBLICATION_STATES, seedPosts, normalisePost, relativeTime, expiryLabel, effectiveState, Store, demoImage };
})(window.Dripfeed = window.Dripfeed || {});
