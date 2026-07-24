/*==================================================
  DRIPFEED APPLICATION

  Own renderer and interaction model. The terminal supplies the chamber and
  shared camera; RedWire's article renderer is not involved.
==================================================*/

(function (DF) {
  function shell() {
    const categoryButtons=Object.entries(DF.model.CATEGORIES).map(([key,value])=>`<button class="filter-chip" data-category="${key}">${value.mark} ${value.label}</button>`).join('');
    return `<div class="dripfeed-app">
      <header class="terminal-header">
        <section class="brand-block"><div class="eyebrow">NCN TERMINAL APPLICATION // PUBLIC CLASSIFIEDS</div><div class="brand-line"><h1>DRIP<span>FEED</span></h1><div class="version">DF/${DF.render.esc(DF.config.appVersion)}<br>APP SLOT 02</div></div><div class="brand-bottom"><span>BUY. SELL. BECOME NOTICEABLE.</span><span class="sponsor">SPONSORED BY DRIP™ // FEEL BETTER ABOUT COMMERCE</span></div></section>
        <section class="system-block"><div class="system-line"><span class="online">● SYSTEM ONLINE</span><span>TERMINAL ${DF.render.esc(DF.config.terminalId)}</span><span id="clock">--:--:--</span><span id="api-mode">UNSPLASH DEMO</span></div><div class="toolbar"><label class="search-box">⌕ <input id="feed-search" type="search" placeholder="Search classified transmissions…"></label><button class="button secondary" data-action="peek">PEEK REAR</button><button class="button secondary" data-action="reset">RESET LOCAL</button><button class="button primary" data-action="open-submit">+ TRANSMIT</button></div></section>
      </header>
      <nav class="view-tabs" aria-label="Terminal state"><button class="view-tab active" data-view="live">LIVE <span data-count="live">0</span></button><button class="view-tab" data-view="saved">SAVED <span data-count="saved">0</span></button><button class="view-tab" data-view="seen">SEEN <span data-count="seen">0</span></button><button class="view-tab" data-view="expired">EXPIRED <span data-count="expired">0</span></button></nav>
      <section class="filter-row"><div class="filter-chips"><button class="filter-chip active" data-category="all">ALL SIGNALS</button>${categoryButtons}</div><div class="display-note"><strong id="result-count">0</strong> TRANSMISSIONS</div></section>
      <main class="demo-stage" data-depth-host><section class="listing-wall rear-wall" data-depth-plane="rear"></section><section class="listing-wall live-wall" data-depth-plane="live"></section></main>
      <footer class="drip-footer"><div><strong>DRIPFEED:</strong> Posts are public transmissions. SAVED and SEEN are private terminal states.</div><div>DRIP™ reminds you that dissatisfaction is a treatable market condition.</div></footer>
      <section class="overlay reader-overlay" data-overlay="reader" aria-hidden="true"><div data-reader-target></div></section>
      <section class="overlay submit-overlay" data-overlay="submit" aria-hidden="true">
        <article class="submit-card"><button class="icon-close" data-submit-action="close" aria-label="Close">×</button><header class="submit-header"><div class="eyebrow">DRIPFEED PUBLIC TRANSMISSION</div><h2>Place a classified</h2><p>Three steps. No account. Your terminal identity remains visible only to you.</p></header>
        <div class="stepper"><div data-step-indicator="1" class="active"><span>01</span> DETAILS</div><div data-step-indicator="2"><span>02</span> IMAGE</div><div data-step-indicator="3"><span>03</span> REVIEW</div></div>
        <form id="submit-form" novalidate>
          <section class="wizard-panel active" data-wizard-step="1"><div class="form-columns"><div class="field"><label>POSTER NAME / HANDLE</label><input id="poster-alias" maxlength="40" required placeholder="WrenchWitch"></div><div class="field"><label>TRANSMISSION TYPE</label><select id="listing-type"><option value="offer">Offering</option><option value="wanted">Wanted</option><option value="event">Public notice / event</option></select></div><div class="field full"><label>HEADLINE</label><input id="listing-title" maxlength="90" required placeholder="What are you offering or looking for?"></div><div class="field"><label>CATEGORY</label><select id="listing-category">${Object.entries(DF.model.CATEGORIES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div><div class="field"><label>DISTRICT</label><input id="district" maxlength="45" required placeholder="Watson"></div><div class="field"><label>PRICE / COMPENSATION</label><input id="value-label" maxlength="30" required placeholder="€$200 / NEGOTIABLE / FREE"></div><div class="field"><label>CONTACT METHOD</label><input id="contact-method" maxlength="55" required placeholder="PING DF-706 / dead drop / venue"></div><div class="field"><label>EXPIRES AFTER</label><select id="expiry-days"><option value="1">24 hours</option><option value="3" selected>3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></div><div class="field full"><label>DETAILS</label><textarea id="listing-body" maxlength="520" required placeholder="Condition, requirements, collection point, restrictions…"></textarea></div></div><div class="wizard-actions"><span></span><button type="button" class="button primary" data-submit-action="next">IMAGE →</button></div></section>
          <section class="wizard-panel" data-wizard-step="2"><div class="image-source-tabs"><button type="button" class="source-tab active" data-image-source="unsplash">SEARCH UNSPLASH</button><button type="button" class="source-tab" data-image-source="url">IMAGE URL</button><button type="button" class="source-tab" data-image-source="none">TEXT ONLY</button></div><div class="source-panel active" data-source-panel="unsplash"><div class="unsplash-bar"><input id="unsplash-query" type="search" value="neon city" maxlength="80"><select id="unsplash-orientation"><option value="">Any shape</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="squarish">Square</option></select><button type="button" class="button primary" data-submit-action="search">SEARCH</button></div><p class="network-note"><strong>The image stays on Unsplash.</strong> Dripfeed stores its URL, photo ID and attribution metadata—not a copy of the file.</p><div id="picker-state" class="picker-state">Search to choose an image.</div><div id="photo-results" class="photo-results"></div><div class="result-pager"><button type="button" class="button" data-submit-action="prev">PREV</button><button type="button" class="button" data-submit-action="next-results">NEXT</button></div></div><div class="source-panel" data-source-panel="url"><div class="field"><label>PUBLIC HTTPS IMAGE URL</label><input id="custom-image-url" type="url" placeholder="https://…"></div><p class="network-note">Only publish an image you own or have permission to use. Dripfeed does not re-host it.</p></div><div class="source-panel" data-source-panel="none"><div class="text-only-sample"><strong>TEXT-ONLY PLATE</strong><span>The category code becomes the visual anchor.</span></div></div><div id="selected-image-preview" class="selected-image-preview"></div><div class="wizard-actions"><button type="button" class="button" data-submit-action="back">← DETAILS</button><button type="button" class="button primary" data-submit-action="next">REVIEW →</button></div></section>
          <section class="wizard-panel" data-wizard-step="3"><div id="review-target"></div><label class="confirm-row"><input id="image-safeguard" type="checkbox"><span>I will not use an identifiable person’s photograph to falsely imply criminal, sexual, medical or defamatory conduct.</span></label><label class="confirm-row"><input id="review-confirm" type="checkbox"><span>I have checked the price, district, contact method and expiry.</span></label><div class="wizard-actions"><button type="button" class="button" data-submit-action="back">← IMAGE</button><button type="button" class="button primary" data-submit-action="transmit">TRANSMIT</button></div></section>
        </form></article>
      </section>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>`;
  }

  class App {
    constructor(root, options={}) {
      this.root=root;
      this.store=options.store||new DF.model.Store();
      this.unsplash=options.unsplash||new DF.unsplash.UnsplashClient(DF.config);
      this.state={view:'live',category:'all',query:'',active:null,peek:false};
      this.depth=options.depthAdapter||new DF.depth.SharedDepthAdapter(this);
      this.submit=new DF.submit.SubmitController(this);
    }
    mount(){
      if(this.mounted)return this;
      this.mounted=true;
      this.root.innerHTML=shell();
      this.bind();
      this.submit.bind();
      this.depth.bind();
      this.render();
      this.updateClock();
      this.clockTimer=setInterval(()=>this.updateClock(),1000);
      return this;
    }
    bind(){
      this.root.addEventListener('click',event=>{
        const view=event.target.closest('[data-view]')?.dataset.view;
        if(view){this.state.view=view;this.render();return;}
        const category=event.target.closest('[data-category]')?.dataset.category;
        if(category){this.state.category=category;this.render();return;}
        const tile=event.target.closest('[data-post-id]');
        if(tile){const post=this.store.posts.find(p=>p.id===tile.dataset.postId);if(post)this.openReader(post);return;}
        const action=event.target.closest('[data-action]')?.dataset.action;
        if(action==='open-submit')this.submit.open();
        if(action==='reset'){this.store.clearLocal();this.state={...this.state,view:'live',category:'all',query:'',active:null};this.render();this.toast('Local posts and terminal states cleared.');}
        if(action==='close-reader')this.closeOverlay('reader');
        if(action==='toggle-save'&&this.state.active){this.store.toggleSaved(this.state.active.id);this.openReader(this.state.active);this.renderWalls();}
        if(action==='toggle-seen'&&this.state.active){const seen=this.store.terminal.seenIds.has(this.state.active.id);this.store.markSeen(this.state.active.id,!seen);this.closeOverlay('reader');this.render();this.toast(seen?'Transmission returned to live wall.':'Transmission filed as seen.');}
      });
      this.root.addEventListener('keydown',event=>{
        const tile=event.target.closest('[data-post-id]');
        if(!tile||!['Enter',' '].includes(event.key))return;
        event.preventDefault();
        tile.click();
      });
      this.root.querySelector('#feed-search').addEventListener('input',event=>{this.state.query=event.target.value;this.renderWalls();});
      this.root.querySelector('[data-overlay="reader"]').addEventListener('click',event=>{if(event.target===event.currentTarget)this.closeOverlay('reader');});
      this.root.querySelector('[data-overlay="submit"]').addEventListener('click',event=>{if(event.target===event.currentTarget)this.submit.close();});
    }
    postsForView(){
      const q=this.state.query.trim().toLowerCase();
      return this.store.posts.filter(post=>{
        const effective=DF.model.effectiveState(post),seen=this.store.terminal.seenIds.has(post.id),saved=this.store.terminal.savedIds.has(post.id);
        if(effective==='removed') return false;
        const viewMatch=this.state.view==='live'?(effective==='live'&&!seen):this.state.view==='seen'?seen:this.state.view==='saved'?saved:this.state.view==='expired'?effective==='expired':true;
        const catMatch=this.state.category==='all'||post.category===this.state.category;
        const text=`${post.title} ${post.body} ${post.posterAlias} ${post.district} ${post.valueLabel}`.toLowerCase();
        return viewMatch&&catMatch&&(!q||text.includes(q));
      });
    }
    render(){
      this.root.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===this.state.view));
      this.root.querySelectorAll('[data-category]').forEach(btn=>btn.classList.toggle('active',btn.dataset.category===this.state.category));
      this.renderWalls();
      this.updateCounts();
    }
    renderWalls(){
      const visible=this.postsForView(),liveWall=this.root.querySelector('.live-wall'),rearWall=this.root.querySelector('.rear-wall');
      liveWall.replaceChildren(...visible.map((post,index)=>DF.render.tile(post,index,this.store,this.state.view==='seen'?'rear':'live')));
      const rear=this.store.posts.filter(post=>DF.model.effectiveState(post)!=='removed'&&this.store.terminal.seenIds.has(post.id)&&!visible.includes(post));
      rearWall.replaceChildren(...rear.map((post,index)=>DF.render.tile(post,index,this.store,'rear')));
      if(!visible.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<strong>NO MATCHING TRANSMISSIONS</strong><span>Change the terminal state, category or search.</span>';liveWall.append(empty);}
      this.root.querySelector('#result-count').textContent=visible.length;
      this.depth.afterRender();
    }
    updateCounts(){
      const live=this.store.posts.filter(p=>DF.model.effectiveState(p)==='live'&&!this.store.terminal.seenIds.has(p.id)).length;
      const saved=this.store.terminal.savedIds.size;
      const seen=this.store.terminal.seenIds.size;
      const expired=this.store.posts.filter(p=>DF.model.effectiveState(p)==='expired').length;
      [['live',live],['saved',saved],['seen',seen],['expired',expired]].forEach(([key,value])=>{const el=this.root.querySelector(`[data-count="${key}"]`);if(el)el.textContent=value;});
    }
    openReader(post){this.state.active=post;this.root.querySelector('[data-reader-target]').innerHTML=DF.render.readerMarkup(post,this.store);this.openOverlay('reader');this.depth.setReading(true);}
    openOverlay(name){const overlay=this.root.querySelector(`[data-overlay="${name}"]`);overlay?.classList.add('open');overlay?.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
    closeOverlay(name){const overlay=this.root.querySelector(`[data-overlay="${name}"]`);overlay?.classList.remove('open');overlay?.setAttribute('aria-hidden','true');document.body.style.overflow='';if(name==='reader'){this.depth.setReading(false);this.state.active=null;}}
    toast(message){const el=this.root.querySelector('.toast');el.textContent=message;el.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
    updateClock(){const el=this.root.querySelector('#clock');if(el)el.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false});}
    updateApiMode(mode){const el=this.root.querySelector('#api-mode');if(el)el.textContent=mode==='live'?'UNSPLASH LIVE':'UNSPLASH DEMO';}
    activate(){this.root.hidden=false;this.depth.resume?.();this.render();}
    deactivate(){this.depth.pause?.();this.closeOverlay('reader');this.closeOverlay('submit');}
    destroy(){clearInterval(this.clockTimer);this.depth.destroy?.();this.root.replaceChildren();this.mounted=false;}
    getDepthPlaneDefinitions(){return this.depth.getPlaneDefinitions?.() || [];}
  }

  DF.App=App;
  DF.mount=(root,options={})=>{
    if(!root)return null;
    if(root.__dripfeedApp)return root.__dripfeedApp;
    const app=new App(root,options).mount();
    root.__dripfeedApp=app;
    return app;
  };
})(window.Dripfeed = window.Dripfeed || {});
