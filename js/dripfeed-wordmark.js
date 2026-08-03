/*==================================================
  DRIPFEED ANIMATED WORDMARK

  Mounts the approved colour-diffusion treatment into the shared terminal
  header. Geometry is read from the existing SVG asset so the animation and
  static fallback always use the same traced lettering.
==================================================*/

window.DripfeedWordmark = (() => {
  const GEOMETRY_URL = 'assets/dripfeed-wordmark.svg';
  const COLOURS = [
    '#A3203E', // deep red
    '#E13A45', // strong red
    '#FF465F', // bright red
    '#E93D87', // raspberry
    '#DC43C6', // magenta
    '#7E43E6', // rich purple
    '#9655E8', // violet
    '#6E58E8', // ultraviolet
    '#9E72EE', // weighted lavender
    '#F05AC0'  // fuchsia
  ];
  const DURATION = 6800;
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

  function cubicBezier1D(value, firstControl, secondControl) {
    const inverse = 1 - value;
    return (
      3 * inverse * inverse * value * firstControl
      + 3 * inverse * value * value * secondControl
      + value * value * value
    );
  }

  function spreadCurve(value) {
    const u = clamp(value);
    const curved = cubicBezier1D(u, .58, .84);
    return curved * .84 + smooth(u) * .16;
  }

  function shuffle(values) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function seedWindow() {
    return shuffle(COLOURS).slice(0, 4);
  }

  function nextRandomColour(window) {
    const recent = window.slice(-2);
    let options = COLOURS.filter(colour => !recent.includes(colour));
    if (!options.length) options = COLOURS.filter(colour => colour !== window.at(-1));
    if (!options.length) options = COLOURS.slice();
    return options[Math.floor(Math.random() * options.length)];
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
          <stop data-base-stop="0" offset="0%" stop-color="#E13A45"></stop>
          <stop data-base-stop="1" offset="14%" stop-color="#E13A45"></stop>
          <stop data-base-stop="2" offset="34%" stop-color="#C83869"></stop>
          <stop data-base-stop="3" offset="66%" stop-color="#A23D91"></stop>
          <stop data-base-stop="4" offset="100%" stop-color="#7E43E6"></stop>
        </radialGradient>

        <radialGradient id="${id('target-gradient')}" gradientUnits="userSpaceOnUse" cx="462" cy="148" r="1080" gradientTransform="matrix(1.62 0 0 1 -286 18)">
          <stop data-target-stop="0" offset="0%" stop-color="#E93D87"></stop>
          <stop data-target-stop="1" offset="14%" stop-color="#E93D87"></stop>
          <stop data-target-stop="2" offset="34%" stop-color="#DC43C6"></stop>
          <stop data-target-stop="3" offset="66%" stop-color="#9655E8"></stop>
          <stop data-target-stop="4" offset="100%" stop-color="#6E58E8"></stop>
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
      </defs>

      <use href="#${id('body')}" fill="url(#${id('base-gradient')})"></use>
      <use data-target-word href="#${id('body')}" fill="url(#${id('target-gradient')})" mask="url(#${id('reveal-mask')})"></use>
      <use data-dot-fill href="#${id('dot')}" fill="#FF465F"></use>
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

    let colourWindow = seedWindow();
    let elapsed = 0;
    let last = performance.now();
    let frameId = 0;
    let stopped = false;

    function render() {
      const [oldColour, currentColour, incomingColour, futureColour] = colourWindow;
      const progress = elapsed / DURATION;
      const start = baseField(oldColour, currentColour);
      const target = baseField(currentColour, incomingColour);
      const spread = spreadCurve(clamp(progress / .78));
      const radius = 1210 * spread;
      const drift = 6 * spread;
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
      dotFill.setAttribute('fill', mix(incomingColour, futureColour, dotShift));
    }

    function advanceColour() {
      colourWindow.shift();
      colourWindow.push(nextRandomColour(colourWindow));
    }

    function frame(now) {
      if (stopped || !host.isConnected) return;
      const delta = Math.min(64, now - last);
      last = now;
      elapsed += delta;
      while (elapsed >= DURATION) {
        elapsed -= DURATION;
        advanceColour();
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
