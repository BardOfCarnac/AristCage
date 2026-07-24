(function (DF) {
  class SubmitController {
    constructor(app) { this.app=app; this.step=1; this.source='unsplash'; this.selectedPhoto=null; this.results=[]; this.page=1; this.totalPages=1; }
    open() { this.step=1; this.source='unsplash'; this.update(); this.app.openOverlay('submit'); if (!this.results.length) this.search(); }
    close() { this.app.closeOverlay('submit'); }
    bind() {
      const root=this.app.root;
      root.addEventListener('click',event=>{
        const action=event.target.closest('[data-submit-action]')?.dataset.submitAction;
        if (!action) return;
        if (action==='close') this.close();
        if (action==='next') this.next();
        if (action==='back') { this.step=Math.max(1,this.step-1); this.update(); }
        if (action==='search') { this.page=1; this.search(); }
        if (action==='prev') { if(this.page>1){this.page--;this.search();} }
        if (action==='next-results') { if(this.page<this.totalPages){this.page++;this.search();} }
        if (action==='transmit') this.transmit();
        if (action==='reset-form') this.resetForm();
        const source=event.target.closest('[data-image-source]')?.dataset.imageSource;
        if (source) { this.source=source; this.update(); }
        const photoButton=event.target.closest('[data-photo-index]');
        if (photoButton) this.selectPhoto(this.results[Number(photoButton.dataset.photoIndex)]);
      });
      root.addEventListener('keydown',event=>{ if(event.target.matches('#unsplash-query')&&event.key==='Enter'){event.preventDefault();this.page=1;this.search();} });
      root.addEventListener('input',event=>{ if(event.target.matches('#custom-image-url')) this.updateSelectedPreview(); if(this.step===3) this.updateReview(); });
      root.addEventListener('change',event=>{ if(this.step===3 || event.target.matches('[name="image-source"]')) this.updateReview(); });
    }
    formValue(id) { return this.app.root.querySelector('#'+id)?.value.trim() || ''; }
    validateDetails() {
      const required=['poster-alias','listing-title','listing-body','district','value-label','contact-method'];
      const missing=required.find(id=>!this.formValue(id));
      if (missing) { this.app.toast('Complete every transmission detail first.'); this.app.root.querySelector('#'+missing)?.focus(); return false; }
      return true;
    }
    next() {
      if (this.step===1 && !this.validateDetails()) return;
      if (this.step===2) {
        if (this.source==='unsplash' && !this.selectedPhoto) { this.app.toast('Choose an Unsplash image or select text only.'); return; }
        if (this.source==='url' && !this.formValue('custom-image-url').startsWith('https://')) { this.app.toast('Enter a public HTTPS image URL.'); return; }
      }
      this.step=Math.min(3,this.step+1); this.update();
    }
    update() {
      this.app.root.querySelectorAll('[data-wizard-step]').forEach(panel=>panel.classList.toggle('active',Number(panel.dataset.wizardStep)===this.step));
      this.app.root.querySelectorAll('[data-step-indicator]').forEach(ind=>{const n=Number(ind.dataset.stepIndicator);ind.classList.toggle('active',n===this.step);ind.classList.toggle('complete',n<this.step)});
      this.app.root.querySelectorAll('[data-image-source]').forEach(btn=>btn.classList.toggle('active',btn.dataset.imageSource===this.source));
      this.app.root.querySelectorAll('[data-source-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.sourcePanel===this.source));
      if (this.step===3) this.updateReview();
      this.updateSelectedPreview(); this.renderResults();
    }
    async search() {
      const query=this.formValue('unsplash-query'); if(query.length<2){this.setPickerState('Enter at least two characters.');return;}
      this.setPickerState('Searching image network…');
      try { const payload=await this.app.unsplash.search({query,page:this.page,orientation:this.formValue('unsplash-orientation')}); this.results=payload.results||[];this.totalPages=Math.max(1,payload.totalPages||1);this.renderResults();this.setPickerState(`${payload.mode==='live'?'LIVE UNSPLASH':'DEMO'} // ${payload.total||this.results.length} RESULTS // PAGE ${this.page}/${this.totalPages}`); this.app.updateApiMode(payload.mode); }
      catch(error){ this.setPickerState('IMAGE NETWORK ERROR // '+error.message); this.app.toast('Unsplash search failed.'); }
    }
    setPickerState(text) { const el=this.app.root.querySelector('#picker-state'); if(el)el.textContent=text; }
    renderResults() {
      const container=this.app.root.querySelector('#photo-results'); if(!container)return;
      container.innerHTML=this.results.map((photo,index)=>`<button type="button" class="photo-result ${this.selectedPhoto?.id===photo.id?'selected':''}" data-photo-index="${index}"><img src="${DF.render.esc(photo.urls.small||photo.urls.thumb)}" alt="${DF.render.esc(photo.alt||'Unsplash result')}" loading="lazy"><span>${DF.render.esc(photo.photographer.name)}</span></button>`).join('');
      const prev=this.app.root.querySelector('[data-submit-action="prev"]'),next=this.app.root.querySelector('[data-submit-action="next-results"]'); if(prev)prev.disabled=this.page<=1;if(next)next.disabled=this.page>=this.totalPages;
    }
    async selectPhoto(photo) {
      this.selectedPhoto=photo; this.renderResults(); this.updateSelectedPreview();
      const tracking=this.app.root.querySelector('#tracking-state'); if(!tracking)return;
      tracking.textContent='Registering selection…';
      try { const result=await this.app.unsplash.track(photo); tracking.textContent=result.tracked?'Selection registered with Unsplash.':result.reason==='not-configured'?'Proxy not configured: tracking will activate on deployment.':'Demo selection: no tracking required.'; }
      catch(error){ tracking.textContent='Tracking error: '+error.message; }
    }
    selectedImage() {
      if (this.source==='none') return null;
      if (this.source==='url') return {provider:'custom',url:this.formValue('custom-image-url'),alt:''};
      const p=this.selectedPhoto; if(!p)return null;
      return {provider:p.provider==='demo'?'demo':'unsplash',id:p.id,url:p.urls.regular||p.urls.small,alt:p.alt||'',photographer:p.photographer,photoUrl:p.photoUrl,unsplashUrl:p.unsplashUrl,downloadLocation:p.downloadLocation};
    }
    draft() {
      const days=Number(this.formValue('expiry-days')||3), now=new Date(DF.config.worldNow);
      return { listingType:this.formValue('listing-type')||'offer',category:this.formValue('listing-category')||'items',title:this.formValue('listing-title'),body:this.formValue('listing-body'),posterAlias:this.formValue('poster-alias'),district:this.formValue('district'),valueLabel:this.formValue('value-label'),contactMethod:this.formValue('contact-method'),createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+days*86400000).toISOString(),publicationState:'live',image:this.selectedImage() };
    }
    updateSelectedPreview() {
      const box=this.app.root.querySelector('#selected-image-preview'); if(!box)return; const image=this.selectedImage();
      if(!image){box.classList.remove('active');box.innerHTML='';return;}
      const credit=image.provider==='unsplash'?DF.render.imageCredit(image):image.provider==='demo'?'Demo image':'User-supplied image URL';
      box.classList.add('active'); box.innerHTML=`<img src="${DF.render.esc(image.url)}" alt=""><div><strong>${this.source==='unsplash'?'SELECTED NETWORK IMAGE':'SELECTED IMAGE URL'}</strong><p>${credit}</p><p id="tracking-state"></p></div>`;
    }
    updateReview() { const target=this.app.root.querySelector('#review-target'); if(target)target.innerHTML=DF.render.reviewCard(this.draft()); }
    transmit() {
      const draft=this.draft();
      if(draft.image && !this.app.root.querySelector('#image-safeguard')?.checked){this.app.toast('Confirm the image-use safeguard first.');return;}
      if(!this.app.root.querySelector('#review-confirm')?.checked){this.app.toast('Confirm that the listing is ready to publish.');return;}
      this.app.store.add(draft); this.app.state.view='live';this.app.state.category='all';this.app.state.query='';this.app.render();this.close();this.resetForm();this.app.toast('Transmission added to the live wall.');
    }
    resetForm() {
      this.app.root.querySelector('#submit-form')?.reset(); this.step=1;this.source='unsplash';this.selectedPhoto=null;this.page=1;this.update();
    }
  }
  DF.submit = { SubmitController };
})(window.Dripfeed = window.Dripfeed || {});
