/*==================================================
  DRIPFEED APPLICATION LAYER

  Owns classified persistence, terminal-local SAVED / SEEN state and the
  submission image picker. Chamber geometry and semantic depth remain owned by
  the shared terminal.
==================================================*/

window.DripfeedApp = (() => {
  const PUBLICATIONS_KEY = "ncn-dripfeed-publications-v1";
  const TERMINAL_KEY = "ncn-dripfeed-terminal-v1";
  const formPhotos = new WeakMap();
  const selectedPhotos = new WeakMap();

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  let customPublications = readJSON(PUBLICATIONS_KEY, []);
  const terminalRecord = readJSON(TERMINAL_KEY, { seenIds: [], savedIds: [] });
  const seenIds = new Set(terminalRecord.seenIds || []);
  const savedIds = new Set(terminalRecord.savedIds || []);

  function persistPublications() {
    localStorage.setItem(PUBLICATIONS_KEY, JSON.stringify(customPublications));
  }

  function persistTerminal() {
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({
      seenIds: [...seenIds],
      savedIds: [...savedIds]
    }));
  }

  function entries() {
    return [
      ...customPublications.map(createDripfeedEntry),
      ...NCN_DRIPFEED_ENTRIES
    ].map(entry => ({ ...entry, image: entry.image ? { ...entry.image } : null }));
  }

  function isSeen(id) {
    return seenIds.has(String(id));
  }

  function isSaved(id) {
    return savedIds.has(String(id));
  }

  function syncTerminalButtons(id) {
    const saved = isSaved(id);
    const seen = isSeen(id);

    document.querySelectorAll(`[data-drip-action="save"][data-entry-id="${CSS.escape(String(id))}"]`).forEach(button => {
      button.setAttribute("aria-pressed", String(saved));
      button.textContent = saved ? "Saved" : "Save";
      button.closest(".entry")?.classList.toggle("dripfeed-saved", saved);
    });

    document.querySelectorAll(`[data-drip-action="seen"][data-entry-id="${CSS.escape(String(id))}"]`).forEach(button => {
      button.setAttribute("aria-pressed", String(seen));
      button.textContent = seen ? "Seen" : "Mark seen";
      button.closest(".entry")?.classList.toggle("dripfeed-seen", seen);
    });
  }

  function toggleTerminalState(kind, id) {
    const collection = kind === "save" ? savedIds : seenIds;
    if (collection.has(id)) collection.delete(id);
    else collection.add(id);
    persistTerminal();
    syncTerminalButtons(id);
    window.dispatchEvent(new CustomEvent("ncn:dripfeed-terminal-state", {
      detail: { id, saved: isSaved(id), seen: isSeen(id) }
    }));
  }

  function setStep(form, step) {
    const next = Math.min(3, Math.max(1, Number(step) || 1));
    form.dataset.dripStep = String(next);
    form.querySelectorAll("[data-drip-step-marker]").forEach(marker => {
      marker.classList.toggle("active", Number(marker.dataset.dripStepMarker) === next);
    });
    updateReview(form);
  }

  function formValue(form, name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function imageSource(form) {
    return form.dataset.dripImageSource || "unsplash";
  }

  function setImageSource(form, source) {
    const next = ["unsplash", "url", "none"].includes(source) ? source : "none";
    form.dataset.dripImageSource = next;
    form.querySelectorAll("[data-drip-image-source]").forEach(button => {
      button.classList.toggle("active", button.dataset.dripImageSource === next);
      button.setAttribute("aria-pressed", String(button.dataset.dripImageSource === next));
    });
    form.querySelectorAll("[data-drip-image-panel]").forEach(panel => {
      panel.classList.toggle("active", panel.dataset.dripImagePanel === next);
    });
    updateSelectedImage(form);
    updateReview(form);
  }

  function demoPhoto(label, from, to, index) {
    const image = dripfeedDemoImage(label, from, to);
    return {
      id: `demo-${index}`,
      provider: "demo",
      alt: label.toLowerCase(),
      urls: { thumb: image.url, small: image.url, regular: image.url },
      photographer: { name: "Dripfeed demo", url: "#" },
      photoUrl: "#",
      unsplashUrl: "#",
      downloadLocation: ""
    };
  }

  const DEMO_PHOTOS = [
    demoPhoto("NEON MARKET", "#22060a", "#f04439", 1),
    demoPhoto("CONCRETE TOWER", "#111218", "#4c5b70", 2),
    demoPhoto("NIGHT ROAD", "#07131b", "#e77632", 3),
    demoPhoto("WAREHOUSE", "#1a1008", "#854117", 4),
    demoPhoto("ROOFTOP", "#09091a", "#7a2a86", 5),
    demoPhoto("OLD MACHINE", "#15100d", "#706052", 6)
  ];

  function renderPhotoResults(form, photos) {
    formPhotos.set(form, photos);
    const results = form.querySelector("[data-drip-photo-results]");
    if (!results) return;
    results.replaceChildren();

    photos.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dripfeed-photo-result";
      button.dataset.dripPhotoIndex = String(index);

      const image = document.createElement("img");
      image.src = photo.urls?.small || photo.urls?.thumb || "";
      image.alt = photo.alt || "Image search result";
      image.loading = "lazy";

      const label = document.createElement("span");
      label.textContent = photo.photographer?.name || "Unsplash photographer";
      button.append(image, label);
      results.append(button);
    });
  }

  async function searchPhotos(form) {
    const state = form.querySelector("[data-drip-photo-state]");
    const query = formValue(form, "unsplashQuery");
    if (query.length < 2) {
      if (state) state.textContent = "Enter at least two characters.";
      return;
    }

    if (state) state.textContent = "Searching image wire…";
    const endpoint = NCN_CONFIG.dripfeed.unsplashSearchEndpoint;

    if (!endpoint) {
      await new Promise(resolvePromise => window.setTimeout(resolvePromise, 180));
      renderPhotoResults(form, DEMO_PHOTOS);
      if (state) state.textContent = "Demo results. Configure the Supabase proxy for live Unsplash search.";
      return;
    }

    try {
      const url = new URL(endpoint);
      url.searchParams.set("query", query);
      url.searchParams.set("page", "1");
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed");
      renderPhotoResults(form, payload.results || []);
      if (state) state.textContent = `${payload.total || payload.results?.length || 0} results returned.`;
    } catch (error) {
      if (state) state.textContent = `Search unavailable: ${error.message}`;
    }
  }

  function selectedPhoto(form) {
    return selectedPhotos.get(form) || null;
  }

  async function trackPhotoSelection(photo, form) {
    if (photo.provider !== "unsplash" || !photo.downloadLocation) return;
    const endpoint = NCN_CONFIG.dripfeed.unsplashTrackEndpoint;
    const state = form.querySelector("[data-drip-photo-state]");
    if (!endpoint) {
      if (state) state.textContent = "Photo selected. Tracking proxy is not configured in this build.";
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ downloadLocation: photo.downloadLocation })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Selection tracking failed");
      if (state) state.textContent = "Photo selected and registered with Unsplash.";
    } catch (error) {
      if (state) state.textContent = `Photo selected; tracking failed: ${error.message}`;
    }
  }

  function choosePhoto(form, index) {
    const photo = formPhotos.get(form)?.[index];
    if (!photo) return;
    selectedPhotos.set(form, photo);
    form.querySelectorAll("[data-drip-photo-index]").forEach((button, candidateIndex) => {
      button.classList.toggle("selected", candidateIndex === index);
    });
    updateSelectedImage(form);
    updateReview(form);
    void trackPhotoSelection(photo, form);
  }

  function imageRecord(form) {
    const source = imageSource(form);
    if (source === "none") return null;

    if (source === "url") {
      const url = formValue(form, "customImageUrl");
      if (!url) return null;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return null;
        return { provider: "custom", url: parsed.toString(), alt: "User-supplied classified image" };
      } catch {
        return null;
      }
    }

    const photo = selectedPhoto(form);
    if (!photo) return null;
    return {
      provider: photo.provider,
      id: photo.id,
      url: photo.urls?.regular || photo.urls?.small || photo.urls?.thumb,
      alt: photo.alt || "Classified image",
      photographer: photo.photographer ? { ...photo.photographer } : null,
      photoUrl: photo.photoUrl || "",
      unsplashUrl: photo.unsplashUrl || "",
      downloadLocation: photo.downloadLocation || ""
    };
  }

  function updateSelectedImage(form) {
    const preview = form.querySelector("[data-drip-selected-image]");
    if (!preview) return;
    const image = imageRecord(form);

    if (!image) {
      preview.hidden = true;
      preview.replaceChildren();
      return;
    }

    preview.hidden = false;
    preview.replaceChildren();
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.alt || "Selected image";
    const copy = document.createElement("span");
    copy.textContent = image.provider === "unsplash"
      ? `Photo: ${image.photographer?.name || "Unsplash photographer"} / Unsplash`
      : image.provider === "demo"
        ? "Demo image selected"
        : "External image URL selected";
    preview.append(img, copy);
  }

  function updateReview(form) {
    const review = form.querySelector("[data-drip-review]");
    if (!review) return;
    const title = formValue(form, "title") || "UNTITLED CLASSIFIED";
    const type = formValue(form, "listingType") || "Offer";
    const category = formValue(form, "category") || "Items";
    const district = formValue(form, "district") || "City Center";
    const value = formValue(form, "valueLabel") || "NAME PRICE";
    const alias = formValue(form, "posterAlias") || "ANONYMOUS";
    const image = imageRecord(form);

    review.innerHTML = `
      <span>${escapeHTML(type)} // ${escapeHTML(category)} // ${escapeHTML(district)}</span>
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(value)} // ${escapeHTML(alias)}</span>
      <small>${image ? `IMAGE: ${escapeHTML(image.provider.toUpperCase())}` : "TEXT-ONLY CATEGORY PLATE"}</small>`;
  }

  function publicationFromForm(form) {
    const now = new Date();
    const expiryDays = Math.max(1, Number.parseInt(formValue(form, "expiryDays"), 10) || 3);
    const listingLabel = formValue(form, "listingType") || "Offer";
    const listingType = listingLabel.toLowerCase() === "wanted"
      ? "wanted"
      : listingLabel.toLowerCase() === "event"
        ? "event"
        : "offer";

    return {
      id: `DF-${Math.floor(800 + Math.random() * 899)}`,
      listingType,
      category: formValue(form, "category") || "Items",
      title: formValue(form, "title"),
      body: formValue(form, "body"),
      posterAlias: formValue(form, "posterAlias"),
      district: formValue(form, "district") || "City Center",
      valueLabel: formValue(form, "valueLabel") || "NAME PRICE",
      contactMethod: formValue(form, "contactMethod") || "NO CONTACT SUPPLIED",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + expiryDays * 86400000).toISOString(),
      publicationState: "live",
      image: imageRecord(form)
    };
  }

  async function transmit(form) {
    const publication = publicationFromForm(form);
    if (!publication.title || !publication.body || !publication.posterAlias) {
      form.reportValidity();
      setStep(form, 1);
      return;
    }

    if (imageSource(form) !== "none" && !publication.image) {
      window.alert("Choose an image, enter a valid HTTPS image URL, or select Text only.");
      setStep(form, 2);
      return;
    }

    if (publication.image && !form.elements.imageSafeguard?.checked) {
      window.alert("Confirm the image-use safeguard before transmitting.");
      setStep(form, 2);
      return;
    }

    customPublications.unshift(publication);
    persistPublications();

    await runProjectionTransaction({
      name: `dripfeed-transmit:${publication.id}`,
      dismiss: getFeedProjectionObjects,
      commit: () => {
        NCN_ENTRIES.splice(0, NCN_ENTRIES.length, ...entries());
        NCN_STATE.activePanel = null;
        clearExpandedEntry();
        resetFilters();
        render();
        syncPanelButtons();
      },
      resolve: getFeedProjectionObjects
    });

    window.dispatchEvent(new CustomEvent("ncn:application-change", {
      detail: { name: "dripfeed", reason: "transmit" }
    }));
  }

  document.addEventListener("click", event => {
    const action = event.target.closest("[data-drip-action]");
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      toggleTerminalState(action.dataset.dripAction, action.dataset.entryId);
      return;
    }

    const form = event.target.closest(".dripfeed-submit-form");
    if (!form) return;

    const stepButton = event.target.closest("[data-drip-step-next]");
    if (stepButton) {
      event.preventDefault();
      setStep(form, stepButton.dataset.dripStepNext);
      return;
    }

    const sourceButton = event.target.closest("[data-drip-image-source]");
    if (sourceButton) {
      event.preventDefault();
      setImageSource(form, sourceButton.dataset.dripImageSource);
      return;
    }

    const searchButton = event.target.closest("[data-drip-unsplash-search]");
    if (searchButton) {
      event.preventDefault();
      void searchPhotos(form);
      return;
    }

    const photoButton = event.target.closest("[data-drip-photo-index]");
    if (photoButton) {
      event.preventDefault();
      choosePhoto(form, Number(photoButton.dataset.dripPhotoIndex));
    }
  });

  document.addEventListener("input", event => {
    const form = event.target.closest(".dripfeed-submit-form");
    if (!form) return;
    updateSelectedImage(form);
    updateReview(form);
  });

  document.addEventListener("change", event => {
    const form = event.target.closest(".dripfeed-submit-form");
    if (!form) return;
    updateSelectedImage(form);
    updateReview(form);
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest(".dripfeed-submit-form");
    if (!form) return;
    event.preventDefault();
    void transmit(form);
  });

  return {
    entries,
    isSeen,
    isSaved,
    setStep,
    setImageSource
  };
})();
