/*==================================================
  DRIPFEED ANIMATED WORDMARK

  Mounts the approved continuous rainbow diffusion treatment into the shared
  terminal header. Geometry is read from the existing SVG wordmark asset so the
  animation and static fallback always use the same traced lettering.
==================================================*/

window.DripfeedWordmark = (() => {
  const GEOMETRY_URL = 'assets/dripfeed-wordmark.svg';
  const COLOURS = ['#8e5cff', '#ff4d5a', '#ff8a2a', '#ffe45d', '#59e86c', '#45b8ff'];
  const DURATION = 6200;
  let active = null;
  let geometryPromise = null;
  let instanceCounter = 0;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smooth = value => value * value * (3 - 2 * value);

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ];
  }

  function mix(from, to, amount) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    const result = a.map((value, index) => Math.round(value + (b[index] - value) * amount));
    return `#${result.map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function baseField(oldColour, currentColour) {
    return [
      currentColour,
      mix(currentColour, oldColour, .10),
      mix(currentColour, oldColour, .28),
      mix(currentColour, oldColour, .58),
      oldColour
    ];
  }

  function spreadCurve(value) {
    const u = clamp(value);

    // The spread reaches the neighbouring letters promptly, then eases early
    // enough to hang around the p rather than dividing the word at the F.
    if (u <= .26) {
      return .40 * (1 - Math.pow(1 - (u / .26), 2));
    }

    const tail = (u - .26) / .74;
    return .40 + .60 * smooth(tail);
  }

  function geometry() {
    if (!geometryPromise) {
      geometryPromise = fetch(GEOMETRY_URL)
        .then(response => {
          if (!response.ok) throw new Error(`Wordmark geometry request failed: ${response.status}`);
          return response.text();
        })
        .then(source => {
          const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml');
          const paths = [...documentNode.querySelectorAll('path')];
          const body = paths.find(path => path.getAttribute('fill-rule') === 'evenodd');
          const dot = paths.find(path => path !== body && path.getAttribute('fill-rule') === 'evenodd');
          if (!body?.getAttribute('d') || !dot?.getAttribute('d')) {
            throw new Error('Wordmark geometry is incomplete.');
          }
          return { body: body.getAttribute('d'), dot: dot.getAttribute('d') };
        });
    }
    return geometryPromise;
  }

  function markup(paths, prefix) {
    const id = name => `${prefix}-${name}`;
    return `<svg class="dripfeed-wordmark-svg" viewBox="0 22 1536 382" preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">
      <defs>
        <path id="${id('body')}" d="${paths.body}" fill-rule="evenodd"></path>
        <path id="${id('dot')}" d="${paths.dot}" fill-rule="evenodd"></path>

        <radialGradient id="${id('base-gradient')}" gradientUnits="userSpaceOnUse" cx="462" cy="148" r="1080" gradientTransform="matrix(1.62 0 0 1 -286 18)">
          <stop data-base-stop="0" offset="0%" stop-color="#ff4d5a"></stop>
          <stop data-base-stop="1" offset="14%" stop-color="#ff4d5a"></stop>
          <stop data-base-stop="2" offset="34%" stop-color="#d85679"></stop>
          <stop data-base-stop="3" offset="66%" stop-color="#b75a98"></stop>
          <stop data-base-stop="4" offset="100%" stop-color="#8e5cff"></stop>
        </radialGradient>

        <radialGradient id="${id('target-gradient')}" gradientUnits="userSpaceOnUse" cx="462" cy="148" r="1080" gradientTransform="matrix(1.62 0 0 1 -286 18)">
          <stop data-target-stop="0" offset="0%" stop-color="#ff8a2a"></stop>
          <stop data-target-stop="1" offset="14%" stop-color="#ff8a2a"></stop>
          <stop data-target-stop="2" offset="34%" stop-color="#ff7650"></stop>
          <stop data-target-stop="3" offset="66%" stop-color="#ff5b5d"></stop>
          <stop data-target-stop="4" offset="100%" stop-color="#ff4d5a"></stop>
        </radialGradient>

        <radialGradient id="${id('reveal-gradient')}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="1"></stop>
          <stop offset="34%" stop-color="white" stop-opacity=".98"></stop>
          <stop offset="68%" stop-color="white" stop-opacity=".82"></stop>
          <stop offset="88%" stop-color="white" stop-opacity=".32"></stop>
          <stop offset="100%" stop-color="black" stop-opacity="0"></stop>
        </radialGradient>

        <filter id="${id('soft-field')}" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency=".007 .018" numOctaves="2" seed="13" result="noise"></feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="B"></feDisplacementMap>
          <feGaussianBlur stdDeviation=".9"></feGaussianBlur>
        </filter>

        <mask id="${id('reveal-mask')}" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="617">
          <rect width="1536" height="617" fill="black"></rect>
          <g filter="url(#${id('soft-field')})">
            <circle data-reveal="0" cx="462" cy="132" r="0" fill="url(#${id('reveal-gradient')})" opacity=".98"></circle>
            <circle data-reveal="1" cx="448" cy="144" r="0" fill="url(#${id('reveal-gradient')})" opacity=".78"></circle>
            <circle data-reveal="2" cx="476" cy="144" r="0" fill="url(#${id('reveal-gradient')})" opacity=".72"></circle>
            <circle data-reveal="3" cx="462" cy="158" r="0" fill="url(#${id('reveal-gradient')})" opacity=".56"></circle>
            <circle data-reveal="4" cx="462" cy="176" r="0" fill="url(#${id('reveal-gradient')})" opacity=".32"></circle>
          </g>
        </mask>

        <filter id="${id('glow')}" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8"></feGaussianBlur>
        </filter>
      </defs>

      <use href="#${id('body')}" fill="url(#${id('base-gradient')})"></use>
      <use href="#${id('body')}" fill="url(#${id('base-gradient')})" opacity=".22" filter="url(#${id('glow')})"></use>
      <use data-target-word href="#${id('body')}" fill="url(#${id('target-gradient')})" mask="url(#${id('reveal-mask')})"></use>
      <use data-dot-fill href="#${id('dot')}" fill="#ff8a2a"></use>
      <use data-dot-glow href="#${id('dot')}" fill="#ff8a2a" opacity=".28" filter="url(#${id('glow')})"></use>
    </svg>`;
  }

  function destroy() {
    if (!active) return;
    active.destroy();
    active = null;
  }

  async function mount(host) {
    destroy();
    if (!host) return null;

    const token = Symbol('dripfeed-wordmark');
    host.dataset.wordmarkState = 'loading';
    host.textContent = 'DripFeed';

    let paths;
    try {
      paths = await geometry();
    } catch (error) {
      console.warn('[DripFeed wordmark]', error);
      host.dataset.wordmarkState = 'fallback';
      return null;
    }

    if (!host.isConnected) return null;

    const prefix = `df-wordmark-${++instanceCounter}`;
    host.innerHTML = markup(paths, prefix);
    host.dataset.wordmarkState = 'ready';

    const svg = host.querySelector('svg');
    const baseStops = [...svg.querySelectorAll('[data-base-stop]')];
    const targetStops = [...svg.querySelectorAll('[data-target-stop]')];
    const reveals = [...svg.querySelectorAll('[data-reveal]')];
    const targetWord = svg.querySelector('[data-target-word]');
    const dotFill = svg.querySelector('[data-dot-fill]');
    const dotGlow = svg.querySelector('[data-dot-glow]');

    let index = 0;
    let elapsed = 0;
    let last = performance.now();
    let frameId = 0;
    let stopped = false;

    function render() {
      const oldColour = COLOURS[index % COLOURS.length];
      const currentColour = COLOURS[(index + 1) % COLOURS.length];
      const incomingColour = COLOURS[(index + 2) % COLOURS.length];
      const futureColour = COLOURS[(index + 3) % COLOURS.length];
      const progress = elapsed / DURATION;

      const start = baseField(oldColour, currentColour);
      const target = baseField(currentColour, incomingColour);
      const spread = spreadCurve(clamp(progress / .78));
      const radius = 1210 * spread;
      const drift = 10 * spread;
      const radii = [.82, .72, .68, .76, .96];
      const baseY = [132, 144, 144, 158, 176];
      const driftScale = [.10, .45, .42, .85, 1.20];

      reveals.forEach((element, revealIndex) => {
        element.setAttribute('r', (radius * radii[revealIndex]).toFixed(2));
        element.setAttribute('cy', (baseY[revealIndex] + drift * driftScale[revealIndex]).toFixed(2));
      });

      const bake = smooth(clamp((progress - .78) / .12));
      baseStops.forEach((stop, stopIndex) => {
        stop.setAttribute('stop-color', mix(start[stopIndex], target[stopIndex], bake));
        targetStops[stopIndex].setAttribute('stop-color', target[stopIndex]);
      });

      const fade = smooth(clamp((progress - .90) / .10));
      targetWord.setAttribute('opacity', (1 - fade).toFixed(3));

      const dotShift = smooth(clamp((progress - .64) / .20));
      const dotColour = mix(incomingColour, futureColour, dotShift);
      dotFill.setAttribute('fill', dotColour);
      dotGlow.setAttribute('fill', dotColour);
    }

    function frame(now) {
      if (stopped || !host.isConnected) return;
      const delta = Math.min(64, now - last);
      last = now;
      elapsed += delta;
      while (elapsed >= DURATION) {
        elapsed -= DURATION;
        index = (index + 1) % COLOURS.length;
      }
      render();
      frameId = requestAnimationFrame(frame);
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      elapsed = DURATION * .48;
      render();
    } else {
      render();
      frameId = requestAnimationFrame(frame);
    }

    const controller = {
      token,
      host,
      destroy() {
        stopped = true;
        if (frameId) cancelAnimationFrame(frameId);
      }
    };

    active = controller;
    return controller;
  }

  return Object.freeze({ mount, destroy });
})();
