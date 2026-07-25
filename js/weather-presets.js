/*==================================================
  NCN WEATHER PRESETS

  Data-only preset definitions consumed by createWeather(context).
==================================================*/
(() => {
  'use strict';

  const freeze = value => Object.freeze(value);
  const particle = (spawn, life, speed, size, alpha) => freeze({ spawn, life, speed, size, alpha });

  const presets = {
    clear: freeze({
      name: 'clear',
      atmosphere: freeze({ density: 0, clouding: 0, haze: 0, moisture: 0 }),
      particles: freeze({
        mist: particle(0, 5200, 0.08, 1.0, 0),
        dust: particle(0, 6200, 0.14, 0.8, 0),
        rain: particle(0, 1300, 1.7, 0.8, 0)
      }),
      layerWeights: freeze({ far: 0.15, rear: 0.25, middle: 0.35, near: 0.25 }),
      wind: freeze({ x: 0.02, y: 0, z: 0 }),
      electricalPotential: 0
    }),

    dust: freeze({
      name: 'dust',
      atmosphere: freeze({ density: 0.16, clouding: 0.05, haze: 0.20, moisture: 0 }),
      particles: freeze({
        mist: particle(0.8, 6800, 0.07, 1.15, 0.14),
        dust: particle(11, 7200, 0.18, 0.72, 0.58),
        rain: particle(0, 1300, 1.7, 0.8, 0)
      }),
      layerWeights: freeze({ far: 0.20, rear: 0.30, middle: 0.34, near: 0.16 }),
      wind: freeze({ x: 0.18, y: 0.015, z: -0.025 }),
      electricalPotential: 0.03
    }),

    mist: freeze({
      name: 'mist',
      atmosphere: freeze({ density: 0.34, clouding: 0.12, haze: 0.22, moisture: 0.52 }),
      particles: freeze({
        mist: particle(8, 8600, 0.065, 1.20, 0.46),
        dust: particle(1.2, 6200, 0.11, 0.65, 0.14),
        rain: particle(0, 1300, 1.7, 0.8, 0)
      }),
      layerWeights: freeze({ far: 0.18, rear: 0.34, middle: 0.34, near: 0.14 }),
      wind: freeze({ x: 0.08, y: 0, z: -0.035 }),
      electricalPotential: 0.08
    }),

    'heavy-mist': freeze({
      name: 'heavy-mist',
      atmosphere: freeze({ density: 0.68, clouding: 0.36, haze: 0.42, moisture: 0.80 }),
      particles: freeze({
        mist: particle(16, 9800, 0.055, 1.48, 0.66),
        dust: particle(0.7, 7000, 0.10, 0.70, 0.12),
        rain: particle(0.4, 1500, 1.45, 0.82, 0.12)
      }),
      layerWeights: freeze({ far: 0.20, rear: 0.38, middle: 0.31, near: 0.11 }),
      wind: freeze({ x: 0.055, y: 0, z: -0.048 }),
      electricalPotential: 0.16
    }),

    'light-rain': freeze({
      name: 'light-rain',
      atmosphere: freeze({ density: 0.22, clouding: 0.18, haze: 0.17, moisture: 0.74 }),
      particles: freeze({
        mist: particle(4, 7200, 0.07, 1.10, 0.28),
        dust: particle(0, 6200, 0.12, 0.65, 0),
        rain: particle(24, 1500, 1.72, 0.76, 0.46)
      }),
      layerWeights: freeze({ far: 0.10, rear: 0.30, middle: 0.40, near: 0.20 }),
      wind: freeze({ x: 0.07, y: -0.06, z: -0.025 }),
      electricalPotential: 0.16
    }),

    rain: freeze({
      name: 'rain',
      atmosphere: freeze({ density: 0.38, clouding: 0.30, haze: 0.24, moisture: 0.94 }),
      particles: freeze({
        mist: particle(7, 8200, 0.065, 1.25, 0.38),
        dust: particle(0, 6200, 0.12, 0.65, 0),
        rain: particle(52, 1500, 1.95, 0.88, 0.68)
      }),
      layerWeights: freeze({ far: 0.08, rear: 0.29, middle: 0.41, near: 0.22 }),
      wind: freeze({ x: 0.12, y: -0.08, z: -0.035 }),
      electricalPotential: 0.28
    }),

    'electrical-weather': freeze({
      name: 'electrical-weather',
      atmosphere: freeze({ density: 0.50, clouding: 0.48, haze: 0.30, moisture: 0.88 }),
      particles: freeze({
        mist: particle(11, 9000, 0.075, 1.38, 0.52),
        dust: particle(0.3, 6200, 0.14, 0.70, 0.08),
        rain: particle(34, 1450, 2.10, 0.90, 0.62)
      }),
      layerWeights: freeze({ far: 0.16, rear: 0.36, middle: 0.34, near: 0.14 }),
      wind: freeze({ x: 0.17, y: -0.04, z: -0.05 }),
      electricalPotential: 0.90
    })
  };

  window.NCNWeatherPresets = freeze(presets);
})();
