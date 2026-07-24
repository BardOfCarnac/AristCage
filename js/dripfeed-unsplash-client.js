(function (DF) {
  function svgResult(label, a, b) {
    return DF.model.demoImage(label, a, b).url;
  }

  const demoPhotos = [
    ['NEON MARKET','#22060a','#f04439'],
    ['CONCRETE TOWER','#111218','#4c5b70'],
    ['NIGHT ROAD','#07131b','#e77632'],
    ['WAREHOUSE','#1a1008','#854117'],
    ['ROOFTOP','#09091a','#7a2a86'],
    ['OLD MACHINE','#15100d','#706052'],
    ['CITY RAIN','#06161a','#176070'],
    ['DESERT MOTEL','#251307','#be5b27'],
    ['UNDERPASS','#111111','#652020']
  ].map((entry,index)=>({
    id:`demo-${index}`,
    provider:'demo',
    alt:entry[0].toLowerCase(),
    urls:{ thumb:svgResult(...entry), small:svgResult(...entry), regular:svgResult(...entry) },
    photographer:{ name:'Demo image', url:'#' },
    photoUrl:'#',
    unsplashUrl:'#',
    downloadLocation:''
  }));

  class UnsplashClient {
    constructor(config) {
      this.config=config;
      this.tracked=new Set();
    }
    get live() {
      return Boolean(this.config.unsplashSearchEndpoint);
    }
    async search({query,page=1,orientation=''}) {
      if (!this.live) {
        await new Promise(resolve=>setTimeout(resolve,180));
        return { page:1,total:demoPhotos.length,totalPages:1,results:demoPhotos,mode:'demo' };
      }
      const url = new URL(this.config.unsplashSearchEndpoint);
      url.searchParams.set('query',query);
      url.searchParams.set('page',String(page));
      if (orientation) url.searchParams.set('orientation',orientation);
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unsplash search failed');
      return {...payload, mode:'live'};
    }
    async track(photo) {
      if (!photo || photo.provider==='demo' || this.tracked.has(photo.id)) {
        return {tracked:false,reason:'not-required'};
      }
      if (!this.config.unsplashTrackEndpoint) {
        return {tracked:false,reason:'not-configured'};
      }
      const response = await fetch(this.config.unsplashTrackEndpoint, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({downloadLocation:photo.downloadLocation})
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Selection tracking failed');
      this.tracked.add(photo.id);
      return {tracked:true};
    }
  }

  DF.unsplash = { UnsplashClient };
})(window.Dripfeed = window.Dripfeed || {});
