/* Data-only presets shared by the PR-86 weather publication.
   Haze remains a compatibility field but is intentionally zero in every profile.
   Mist and smoke use only the RedWire energy palette inside the approved bank renderer. */
window.NCNWeatherPresets = (() => {
  const preset = values => Object.freeze({
    mist: 0,
    smoke: 0,
    dust: 0,
    rain: 0,
    haze: 0,
    moisture: 0,
    turbulence: 0.08,
    drift: 0.18,
    fallSpeed: 0.55,
    depthFlow: 0,
    verticalFill: 0,
    bankScale: 1,
    bankMultiplier: 1,
    electrical: 0,
    ...values,
    haze: 0
  });

  return Object.freeze({
    clear: preset({}),
    dust: preset({
      dust: 0.48,
      turbulence: 0.32,
      drift: 0.34,
      depthFlow: -0.025
    }),
    mist: preset({
      mist: 0.54,
      moisture: 0.48,
      turbulence: 0.17,
      drift: 0.20,
      depthFlow: -0.018,
      verticalFill: 0.10,
      bankScale: 0.88,
      bankMultiplier: 1.58
    }),
    "heavy-mist": preset({
      mist: 0.98,
      moisture: 0.92,
      turbulence: 0.28,
      drift: 0.12,
      depthFlow: -0.018,
      verticalFill: 0.82,
      bankScale: 1.08,
      bankMultiplier: 1.85
    }),
    smoke: preset({
      mist: 0.58,
      smoke: 1,
      moisture: 0.28,
      turbulence: 0.34,
      drift: 0.12,
      depthFlow: -0.060
    }),
    "light-rain": preset({
      mist: 0.18,
      rain: 0.38,
      moisture: 0.58,
      turbulence: 0.20,
      drift: 0.16,
      fallSpeed: 0.72,
      depthFlow: -0.012
    }),
    rain: preset({
      mist: 0.24,
      rain: 0.78,
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
      moisture: 0.64,
      turbulence: 0.46,
      drift: 0.30,
      fallSpeed: 0.78,
      depthFlow: -0.035,
      electrical: 0.82
    })
  });
})();
