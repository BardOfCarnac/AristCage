const NCN_DATA = {
  meta: {
    date: "14.07.2045",
    version: "NCN v0.8",
    title: "Night City News",
    tagline: "The headlines of tomorrow, today"
  },

  filters: [
    "Now",
    "Street",
    "Corp",
    "Combat Zone"
  ],

  stories: [
    {
      id: "av-clinic",
      priority: 4,
      title: "Unmarked AV spotted circling old clinic block",
      meta: "23:41 // Watson // Street Feed",
      tags: ["AV", "Clinic", "Unverified"],
      body: "Locals report repeated low-altitude passes over a shuttered ripperdoc unit. Power is back on inside, but no official permits have been logged. Witnesses describe the craft as silent, matte-black, and running without visible city registration."
    },
    {
      id: "arasaka-convoy",
      priority: 3,
      title: "Arasaka convoy delayed",
      meta: "00:12 // Corpo Plaza",
      tags: ["Corp", "Traffic", "Escort"],
      body: "A corporate convoy halted traffic for fourteen minutes before diverting through private security lanes. City officials claim no public roads were closed."
    },
    {
      id: "power-surge",
      priority: 2,
      title: "Power surge reported",
      meta: "22:09 // Santo Domingo",
      tags: ["Grid", "Fire", "Local"],
      body: "Residents reported a blue-white flash across the south grid before emergency shutters dropped across several blocks."
    }
  ]
};
