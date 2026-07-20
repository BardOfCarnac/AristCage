/* Loads the chamber renderer, segments depth rails, and projects the live NCN feed. */
(() => {
  const sourceUrl = 'js/layered-chamber.js?v=live-articles-1';

  const chamberUpgrades = `
  function opticalDepthLine(ctx, x, y, nearZ, farZ, energyLevel, alpha, widthScale = 1) {
    const { cell } = geometry;
    let z0 = nearZ;
    while (z0 < farZ - 0.0001) {
      const z1 = Math.min(farZ, z0 + cell);
      opticalLine(ctx, [x, y, z0], [x, y, z1], energyLevel, alpha, widthScale);
      z0 = z1;
    }
  }

  function chamberEntries() {
    if (typeof getVisibleEntries === 'function') return getVisibleEntries();
    if (typeof NCN_ENTRIES !== 'undefined' && Array.isArray(NCN_ENTRIES)) return NCN_ENTRIES;
    return [];
  }

  function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (ctx.measureText(trial).width <= maxWidth || !line) {
        line = trial;
      } else {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines - 1) break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  function drawProjectedArticle(ctx, entry, index, z, halfWidth, worldY, alpha) {
    const profile = opticalProfile(z, 0.78, alpha);
    if (profile.opacity < 0.01) return;

    const inset = geometry.cell * 0.72;
    const articleHeight = 1.02;
    const tl = project(-halfWidth + inset, worldY, z);
    const br = project(halfWidth - inset, worldY - articleHeight, z);
    const width = br.x - tl.x;
    const height = br.y - tl.y;
    if (br.y < -60 || tl.y > H + 60 || width < 44 || height < 18) return;

    const priority = clamp(Number(entry.priority) || 1, 1, 5);
    const priorityEnergy = 0.50 + priority * 0.085;
    const textAlpha = clamp01(profile.opacity * 2.4);
    const padding = Math.max(5, width * 0.035);

    ctx.save();
    ctx.fillStyle = 'rgba(8,1,3,' + clamp01(0.48 + profile.contrast * 0.30) + ')';
    ctx.fillRect(tl.x, tl.y, width, height);

    ctx.strokeStyle = palette(profile.brightness, clamp01(profile.opacity * 1.35));
    ctx.lineWidth = Math.max(0.55, profile.width * 0.85);
    ctx.strokeRect(tl.x, tl.y, width, height);

    const railWidth = Math.max(2, width * 0.012);
    ctx.fillStyle = palette(priorityEnergy, clamp01(textAlpha * 0.90));
    ctx.fillRect(tl.x, tl.y, railWidth, height);

    const metaSize = clamp(height * 0.105, 7, 11);
    const headlineSize = clamp(height * 0.185, 10, 19);
    const bodySize = clamp(height * 0.105, 7, 11);
    const textX = tl.x + padding + railWidth;
    const textWidth = width - padding * 2 - railWidth;

    ctx.textBaseline = 'top';
    ctx.font = metaSize + 'px monospace';
    ctx.fillStyle = palette(0.64, textAlpha * 0.72);
    ctx.fillText(String(entry.meta || '').toUpperCase(), textX, tl.y + padding, textWidth);

    ctx.font = '600 ' + headlineSize + 'px sans-serif';
    ctx.fillStyle = palette(clamp01(0.70 + priority * 0.045), textAlpha);
    const headlineLines = wrapCanvasText(ctx, entry.headline, textWidth, 2);
    let cursorY = tl.y + padding + metaSize * 1.45;
    for (const line of headlineLines) {
      ctx.fillText(line, textX, cursorY, textWidth);
      cursorY += headlineSize * 1.08;
    }

    if (height > 66) {
      ctx.font = bodySize + 'px sans-serif';
      ctx.fillStyle = palette(0.56, textAlpha * 0.70);
      cursorY += bodySize * 0.25;
      const bodyLines = wrapCanvasText(ctx, entry.body, textWidth, height > 105 ? 2 : 1);
      for (const line of bodyLines) {
        ctx.fillText(line, textX, cursorY, textWidth);
        cursorY += bodySize * 1.18;
      }
    }

    ctx.font = metaSize + 'px monospace';
    ctx.fillStyle = palette(0.60, textAlpha * 0.62);
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(entry.tags || '').toUpperCase(), textX, br.y - padding, textWidth);
    ctx.restore();
  }
`;

  const replacementLaboratory = `
  function drawScrollLaboratory(ctx, s) {
    if (mode !== MODES.LAB || s.lab <= 0) return;
    const entries = chamberEntries();
    if (!entries.length) return;

    const halfWidth = visibleHalfWidth(s);
    const depthPitch = geometry.cell * 1.18;
    const verticalPitch = 1.16;
    const top = geometry.halfHeight - geometry.cell * 0.72 + lab.scroll;
    lab.maxScroll = Math.max(0, entries.length * verticalPitch - geometry.halfHeight * 1.55);
    lab.targetScroll = clamp(lab.targetScroll, 0, lab.maxScroll);
    lab.scroll = clamp(lab.scroll, 0, lab.maxScroll);

    for (let index = entries.length - 1; index >= 0; index--) {
      const z = geometry.near + geometry.cell * 0.82 + index * depthPitch;
      const worldY = top - index * verticalPitch;
      const entryAlpha = s.lab * clamp01(1 - index * 0.045);
      drawProjectedArticle(ctx, entries[index], index, z, halfWidth, worldY, entryAlpha);
    }

    ctx.fillStyle = 'rgba(255,90,68,' + (0.48 * s.lab) + ')';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText('LIVE FEED  ' + entries.length + ' TRANSMISSIONS  ·  INDEPENDENT Z OBJECTS', 14, H - 14);
  }
`;

  fetch(sourceUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Unable to load chamber renderer: ' + response.status);
      return response.text();
    })
    .then(source => {
      const rearWallPoint = '  function drawRearWall(ctx, z, visibleX, systemEnergy, alpha) {';
      if (!source.includes(rearWallPoint)) throw new Error('Chamber insertion point was not found.');
      source = source.replace(rearWallPoint, chamberUpgrades + '\n' + rearWallPoint);

      const longRail = 'opticalLine(ctx, [x, y, near], [x, y, rearZ], systemEnergy, alpha, 0.92);';
      if (!source.includes(longRail)) throw new Error('Horizontal chamber rails were not found.');
      source = source.replace(longRail, 'opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);');
      if (!source.includes(longRail)) throw new Error('Side chamber rails were not found.');
      source = source.replace(longRail, 'opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);');

      const labStart = source.indexOf('  function drawScrollLaboratory(ctx, s) {');
      const labEnd = source.indexOf('\n  function settleScroll()', labStart);
      if (labStart < 0 || labEnd < 0) throw new Error('Laboratory renderer was not found.');
      source = source.slice(0, labStart) + replacementLaboratory + source.slice(labEnd);

      (0, eval)(source + '\n//# sourceURL=layered-chamber-live-articles.js');
    })
    .catch(error => console.error('[LayeredChamber]', error));
})();