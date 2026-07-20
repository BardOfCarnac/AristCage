/* Loads the chamber renderer, adds segmented depth attenuation, and projects the live feed DOM. */
(() => {
  const sourceUrl = 'js/layered-chamber.js?v=live-dom-1';

  const segmentedFunction = `
  function opticalDepthLine(ctx, x, y, nearZ, farZ, energyLevel, alpha, widthScale = 1) {
    const { cell } = geometry;
    let z0 = nearZ;

    while (z0 < farZ - 0.0001) {
      const z1 = Math.min(farZ, z0 + cell);
      opticalLine(ctx, [x, y, z0], [x, y, z1], energyLevel, alpha, widthScale);
      z0 = z1;
    }
  }
`;

  const liveProjectionFunctions = `
  function liveFeedEntries() {
    return [...document.querySelectorAll('#feed .entry:not(.panel)')].map((node, index) => {
      const priorityNode = node.querySelector('.priority');
      const priorityMatch = priorityNode?.className.match(/priority-(\\d+)/);
      return {
        id: node.dataset.entryId || String(index),
        headline: node.querySelector('.headline')?.textContent?.trim() || 'UNTITLED TRANSMISSION',
        meta: node.querySelector('.meta')?.textContent?.trim() || '',
        tags: node.querySelector('.tags')?.textContent?.trim() || '',
        body: node.querySelector('.body')?.textContent?.replace(/\\s+/g, ' ')?.trim() || '',
        priority: Number(priorityMatch?.[1] || 1),
        expanded: node.classList.contains('expanded')
      };
    });
  }

  function wrapProjectedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\\s+/).filter(Boolean);
    let line = '';
    let lines = 0;

    for (let index = 0; index < words.length && lines < maxLines; index++) {
      const candidate = line ? line + ' ' + words[index] : words[index];
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        line = words[index];
        lines++;
      } else {
        line = candidate;
      }
    }

    if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function drawLiveEntry(ctx, entry, itemIndex, z, halfWidth, worldY, alpha) {
    const profile = opticalProfile(z, 0.72, alpha);
    if (profile.opacity < 0.008) return;

    const inset = geometry.cell * 0.72;
    const cardHeight = entry.expanded ? 1.18 : 0.82;
    const tl = project(-halfWidth + inset, worldY, z);
    const br = project(halfWidth - inset, worldY - cardHeight, z);
    const width = br.x - tl.x;
    const height = br.y - tl.y;
    if (br.y < -80 || tl.y > H + 80 || width < 28 || height < 12) return;

    const priorityStrength = clamp01(0.46 + entry.priority * 0.09);
    const pad = clamp(width * 0.034, 7, 18);

    ctx.fillStyle = palette(0.13, clamp01(profile.opacity * 0.72));
    ctx.fillRect(tl.x, tl.y, width, height);

    ctx.strokeStyle = palette(profile.brightness, clamp01(profile.opacity * 0.82));
    ctx.lineWidth = profile.width;
    ctx.strokeRect(tl.x, tl.y, width, height);

    const railWidth = clamp(width * 0.012, 2, 7);
    ctx.fillStyle = palette(priorityStrength, clamp01(profile.opacity * 1.3));
    ctx.fillRect(tl.x, tl.y, railWidth, height);

    const metaSize = clamp(height * 0.11, 7, 11);
    ctx.font = metaSize + 'px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = palette(0.7, clamp01(profile.opacity * 0.72));
    ctx.fillText(entry.meta, tl.x + pad, tl.y + pad * 0.72, Math.max(0, width - pad * 2));

    const headlineSize = clamp(height * 0.18, 10, 22);
    const headlineY = tl.y + pad * 0.72 + metaSize * 1.55;
    ctx.font = '600 ' + headlineSize + 'px monospace';
    ctx.fillStyle = palette(clamp01(profile.brightness + 0.18), clamp01(profile.opacity * 1.12));
    wrapProjectedText(ctx, entry.headline, tl.x + pad, headlineY, width - pad * 2, headlineSize * 1.15, entry.expanded ? 3 : 2);

    const bodySize = clamp(height * 0.095, 7, 12);
    ctx.font = bodySize + 'px monospace';
    ctx.fillStyle = palette(0.58, clamp01(profile.opacity * 0.66));
    const bodyY = tl.y + height * (entry.expanded ? 0.56 : 0.64);
    wrapProjectedText(ctx, entry.body, tl.x + pad, bodyY, width - pad * 2, bodySize * 1.25, entry.expanded ? 4 : 2);

    ctx.font = clamp(bodySize * 0.9, 7, 10) + 'px monospace';
    ctx.fillStyle = palette(0.48, clamp01(profile.opacity * 0.58));
    ctx.fillText(entry.tags, tl.x + pad, br.y - pad - bodySize, Math.max(0, width - pad * 2));
  }

  function drawScrollLaboratory(ctx, s) {
    if (mode !== MODES.LAB || s.lab <= 0) return;

    const entries = liveFeedEntries();
    const halfWidth = visibleHalfWidth(s);
    const top = geometry.halfHeight - geometry.cell * 0.9 + lab.scroll;
    const depthStep = geometry.cell * 0.72;

    for (let index = entries.length - 1; index >= 0; index--) {
      const z = geometry.near + geometry.cell * 0.85 + index * depthStep;
      const worldY = top - index * lab.itemPitch;
      drawLiveEntry(ctx, entries[index], index, z, halfWidth, worldY, s.lab);
    }

    ctx.fillStyle = 'rgba(255,90,68,' + (0.48 * s.lab) + ')';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText('LIVE FEED · ' + entries.length + ' TRANSMISSIONS · SCROLL ' + lab.scroll.toFixed(2), 14, H - 14);
  }
`;

  fetch(sourceUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Unable to load chamber renderer: ${response.status}`);
      return response.text();
    })
    .then(source => {
      const insertionPoint = `
  function drawRearWall(ctx, z, visibleX, systemEnergy, alpha) {
`;
      if (!source.includes(insertionPoint)) throw new Error('Chamber renderer insertion point was not found.');
      source = source.replace(insertionPoint, `${segmentedFunction}${insertionPoint}`);

      const depthRail = `opticalLine(ctx, [x, y, near], [x, y, rearZ], systemEnergy, alpha, 0.92);`;
      if (!source.includes(depthRail)) throw new Error('Horizontal chamber rails were not found.');
      source = source.replace(depthRail, `opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);`);
      if (!source.includes(depthRail)) throw new Error('Side chamber rails were not found.');
      source = source.replace(depthRail, `opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);`);

      const projectionStart = source.indexOf('  function drawPlaceholderBlock(');
      const projectionEnd = source.indexOf('  function settleScroll()', projectionStart);
      if (projectionStart < 0 || projectionEnd < 0) throw new Error('Placeholder projection section was not found.');
      source = source.slice(0, projectionStart) + liveProjectionFunctions + '\n' + source.slice(projectionEnd);

      (0, eval)(`${source}\n//# sourceURL=layered-chamber-live-dom.js`);
    })
    .catch(error => console.error('[LayeredChamber]', error));
})();