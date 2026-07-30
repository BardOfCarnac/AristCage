(function (DF) {
  const PROVIDER_IDS = ['unsplash', 'pexels'];

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function appendReferral(url, provider) {
    if (!url || url === '#') return url || '';
    try {
      const parsed = new URL(url);
      if (provider === 'unsplash') {
        parsed.searchParams.set('utm_source', 'night_city_news');
        parsed.searchParams.set('utm_medium', 'referral');
      }
      return parsed.toString();
    } catch (error) {
      return url;
    }
  }

  function demoImage(label, a, b) {
    return DF.model.demoImage(label, a, b).url;
  }

  function makeDemoPhoto(provider, index, label, a, b, orientation) {
    const imageUrl = demoImage(label, a, b);
    const providerName = provider === 'pexels' ? 'Pexels' : 'Unsplash';
    return {
      id: `${provider}-demo-${index}`,
      provider,
      alt: label.toLowerCase(),
      width: orientation === 'portrait' ? 800 : orientation === 'square' ? 1000 : 1200,
      height: orientation === 'portrait' ? 1200 : orientation === 'square' ? 1000 : 800,
      orientation,
      colour: a,
      blurHash: '',
      urls: {
        thumb: imageUrl,
        small: imageUrl,
        regular: imageUrl,
        full: imageUrl
      },
      photographer: {
        name: `${providerName} demo artist ${index + 1}`,
        url: '#'
      },
      photoUrl: '#',
      providerUrl: provider === 'pexels' ? 'https://www.pexels.com/' : 'https://unsplash.com/',
      downloadLocation: '',
      usage: {
        hotlinkRequired: provider === 'unsplash',
        selectionTrackingRequired: provider === 'unsplash',
        localCopyAllowed: provider !== 'unsplash'
      },
      demo: true
    };
  }

  const DEMO_SETS = {
    unsplash: [
      ['NEON MARKET', '#22060a', '#f04439', 'landscape'],
      ['CONCRETE TOWER', '#111218', '#4c5b70', 'portrait'],
      ['NIGHT ROAD', '#07131b', '#e77632', 'landscape'],
      ['WAREHOUSE', '#1a1008', '#854117', 'square'],
      ['ROOFTOP', '#09091a', '#7a2a86', 'landscape'],
      ['OLD MACHINE', '#15100d', '#706052', 'portrait']
    ],
    pexels: [
      ['RAIN PLATFORM', '#071418', '#2d7d87', 'landscape'],
      ['BACK STREET', '#180b12', '#9d3152', 'portrait'],
      ['MARKET LIGHTS', '#180e05', '#d47a24', 'landscape'],
      ['WORKSHOP', '#11100d', '#746b53', 'square'],
      ['TOWER WINDOW', '#080914', '#4b3978', 'portrait'],
      ['TRANSIT YARD', '#0d1215', '#4d6d78', 'landscape']
    ]
  };

  function demoSet(provider) {
    return (DEMO_SETS[provider] || []).map((entry, index) =>
      makeDemoPhoto(provider, index, entry[0], entry[1], entry[2], entry[3])
    );
  }

  function normaliseRemotePhoto(provider, raw) {
    if (!raw) return null;
    const source = raw.source || raw.provider || provider;
    const urls = raw.urls || {};
    const photographer = raw.photographer || raw.creator || {};
    return {
      id: String(raw.id || raw.providerImageId || ''),
      provider: source,
      alt: String(raw.alt || raw.altText || raw.description || ''),
      width: Number(raw.width || 0),
      height: Number(raw.height || 0),
      orientation: raw.orientation || '',
      colour: raw.colour || raw.color || '',
      blurHash: raw.blurHash || raw.blur_hash || '',
      urls: {
        thumb: urls.thumb || urls.thumbnail || raw.thumbnailUrl || '',
        small: urls.small || urls.display || raw.displayUrl || '',
        regular: urls.regular || urls.expanded || urls.full || raw.imageUrl || '',
        full: urls.full || urls.expanded || urls.regular || raw.imageUrl || ''
      },
      photographer: {
        name: String(photographer.name || raw.photographerName || 'Unknown creator'),
        url: appendReferral(photographer.url || raw.photographerUrl || '', source)
      },
      photoUrl: appendReferral(raw.photoUrl || raw.providerPageUrl || '', source),
      providerUrl: appendReferral(raw.providerUrl || (source === 'pexels' ? 'https://www.pexels.com/' : 'https://unsplash.com/'), source),
      downloadLocation: raw.downloadLocation || raw.selectionTrackingUrl || '',
      usage: Object.assign({
        hotlinkRequired: source === 'unsplash',
        selectionTrackingRequired: source === 'unsplash',
        localCopyAllowed: source !== 'unsplash'
      }, raw.usage || {}),
      demo: Boolean(raw.demo)
    };
  }

  class SearchProvider {
    constructor(options) {
      this.id = options.id;
      this.label = options.label;
      this.searchEndpoint = options.searchEndpoint || '';
      this.trackEndpoint = options.trackEndpoint || '';
      this.tracked = new Set();
    }

    get live() {
      return Boolean(this.searchEndpoint);
    }

    async search({ query, page = 1, orientation = '' }) {
      if (!this.live) {
        await delay(160);
        const all = demoSet(this.id);
        const filtered = orientation
          ? all.filter(photo => photo.orientation === orientation || (orientation === 'squarish' && photo.orientation === 'square'))
          : all;
        return {
          provider: this.id,
          page: 1,
          total: filtered.length,
          totalPages: 1,
          results: filtered,
          mode: 'demo'
        };
      }

      const url = new URL(this.searchEndpoint);
      url.searchParams.set('provider', this.id);
      url.searchParams.set('query', query);
      url.searchParams.set('page', String(page));
      if (orientation) url.searchParams.set('orientation', orientation);
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `${this.label} search failed`);
      return {
        provider: this.id,
        page: Number(payload.page || page),
        total: Number(payload.total || 0),
        totalPages: Math.max(1, Number(payload.totalPages || payload.total_pages || 1)),
        results: (payload.results || payload.photos || []).map(photo => normaliseRemotePhoto(this.id, photo)).filter(Boolean),
        mode: 'live'
      };
    }

    async registerSelection(photo) {
      if (!photo || photo.provider !== this.id || photo.demo) {
        return { tracked: false, reason: 'not-required' };
      }
      if (!photo.usage?.selectionTrackingRequired) {
        return { tracked: false, reason: 'not-required' };
      }
      if (this.tracked.has(photo.id)) {
        return { tracked: false, reason: 'already-tracked' };
      }
      if (!this.trackEndpoint) {
        return { tracked: false, reason: 'not-configured' };
      }
      const response = await fetch(this.trackEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: this.id,
          providerImageId: photo.id,
          selectionTrackingUrl: photo.downloadLocation
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `${this.label} selection tracking failed`);
      this.tracked.add(photo.id);
      return { tracked: true };
    }

    toStoryImage(photo) {
      const image = normaliseRemotePhoto(this.id, photo);
      return {
        provider: this.id,
        providerImageId: image.id,
        id: image.id,
        url: image.urls.regular || image.urls.small,
        alt: image.alt,
        width: image.width,
        height: image.height,
        orientation: image.orientation,
        colour: image.colour,
        blurHash: image.blurHash,
        urls: {
          thumbnail: image.urls.thumb,
          display: image.urls.small || image.urls.regular,
          expanded: image.urls.regular || image.urls.full
        },
        credit: {
          creatorName: image.photographer.name,
          creatorUrl: image.photographer.url,
          providerName: this.label,
          providerUrl: image.providerUrl,
          providerPageUrl: image.photoUrl,
          attributionRequired: this.id === 'unsplash',
          attributionRecommended: true
        },
        usage: {
          hotlinkRequired: Boolean(image.usage?.hotlinkRequired),
          selectionTrackingRequired: Boolean(image.usage?.selectionTrackingRequired),
          localCopyAllowed: Boolean(image.usage?.localCopyAllowed),
          selectionTrackingUrl: image.downloadLocation
        },
        photographer: image.photographer,
        photoUrl: image.photoUrl,
        unsplashUrl: this.id === 'unsplash' ? image.providerUrl : '',
        downloadLocation: image.downloadLocation,
        selectedAt: new Date().toISOString()
      };
    }
  }

  class Registry {
    constructor(providers) {
      this.providers = new Map(providers.map(provider => [provider.id, provider]));
    }

    list() {
      return PROVIDER_IDS.map(id => this.providers.get(id)).filter(Boolean);
    }

    get(id) {
      const provider = this.providers.get(id);
      if (!provider) throw new Error(`Unknown image provider: ${id}`);
      return provider;
    }

    search(request) {
      return this.get(request.provider).search(request);
    }

    registerSelection(photo) {
      return this.get(photo.provider).registerSelection(photo);
    }

    toStoryImage(photo) {
      return this.get(photo.provider).toStoryImage(photo);
    }
  }

  function createDefaultRegistry(config) {
    const sharedSearchEndpoint = config.imageSearchEndpoint || '';
    const sharedTrackEndpoint = config.imageTrackEndpoint || '';
    return new Registry([
      new SearchProvider({
        id: 'unsplash',
        label: 'Unsplash',
        searchEndpoint: config.unsplashSearchEndpoint || sharedSearchEndpoint,
        trackEndpoint: config.unsplashTrackEndpoint || sharedTrackEndpoint
      }),
      new SearchProvider({
        id: 'pexels',
        label: 'Pexels',
        searchEndpoint: config.pexelsSearchEndpoint || sharedSearchEndpoint,
        trackEndpoint: config.pexelsTrackEndpoint || sharedTrackEndpoint
      })
    ]);
  }

  DF.images = {
    PROVIDER_IDS,
    SearchProvider,
    Registry,
    normaliseRemotePhoto,
    createDefaultRegistry
  };
})(window.Dripfeed = window.Dripfeed || {});
