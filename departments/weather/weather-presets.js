/* Data-only presets shared by the PR-86 weather publication. */
window.NCNWeatherPresets = (() => {
  const preset = values => Object.freeze({
    mist: 0,
    dust: 0,
    rain: 0,
    haze: 0,
    moisture: 0,
    turbulence: 0.08,
    drift: 0.18,
    fallSpeed: 0.55,
    depthFlow: 0,
    electrical: 0,
    ...values
  });

  return Object.freeze({
    clear: preset({}),
    dust: preset({
      dust: 0.48,
      haze: 0.12,
      turbulence: 0.32,
      drift: 0.34,
      depthFlow: -0.025
    }),
    mist: preset({
      mist: 0.48,
      haze: 0.23,
      moisture: 0.42,
      turbulence: 0.17,
      drift: 0.20,
      depthFlow: -0.018
    }),
    "heavy-mist": preset({
      mist: 0.82,
      haze: 0.48,
      moisture: 0.72,
      turbulence: 0.24,
      drift: 0.16,
      depthFlow: -0.026
    }),
    "light-rain": preset({
      mist: 0.18,
      rain: 0.38,
      haze: 0.17,
      moisture: 0.58,
      turbulence: 0.20,
      drift: 0.16,
      fallSpeed: 0.72,
      depthFlow: -0.012
    }),
    rain: preset({
      mist: 0.24,
      rain: 0.78,
      haze: 0.24,
      moisture: 0.82,
      turbulence: 0.28,
      drift: 0.20,
      fallSpeed: 0.92,
      depthFlow: -0.018
    }),
    "electrical-weather": preset({
      mist: 0.54,
      dust: 0.08,
      rain: 0.20,
      haze: 0.31,
      moisture: 0.64,
      turbulence: 0.46,
      drift: 0.30,
      fallSpeed: 0.78,
      depthFlow: -0.035,
      electrical: 0.82
    })
  });
})();
