const NCN_ENTRIES = [
  {
    id: "av-clinic",
    type: "story",
    priority: 4,
    headline: "Unmarked AV spotted circling old clinic block",
    meta: "23:41 // Watson // Street Feed",
    tags: "AV // Clinic // Unverified",
    body: "Locals report repeated low-altitude passes over a shuttered ripperdoc unit. Power is back on inside, but no official permits have been logged."
  },
  {
    id: "arasaka-convoy",
    type: "story",
    priority: 3,
    headline: "Arasaka convoy delayed",
    meta: "00:12 // Corpo Plaza // Traffic Desk",
    tags: "Corp // Traffic // Escort",
    body: "A corporate convoy halted traffic for fourteen minutes before diverting through private security lanes."
  },
  {
    id: "power-surge",
    type: "story",
    priority: 2,
    headline: "Power surge reported across the south grid",
    meta: "22:09 // Santo Domingo // Civic Notice",
    tags: "Grid // Fire // Local",
    body: "Residents reported a blue-white flash across the south grid before emergency shutters dropped."
  },
  {
    id: "metro-tunnels",
    type: "story",
    priority: 4,
    headline: "Three boosters found in sealed metro tunnels",
    meta: "22:11 // Urban Sprawl // Scanner Traffic",
    tags: "Crime // Metro // Investigation",
    body: "Scanner traffic reports three unidentified boosters discovered beneath a sealed transit spur."
  },
  {
    id: "budget-clinics",
    type: "story",
    priority: 2,
    headline: "Kiroshi closes three budget clinics",
    meta: "22:14 // Private Enclave // Corporate",
    tags: "Business // Health // Kiroshi",
    body: "Kiroshi Optical has shuttered three low-cost eye clinics, citing unsustainable operating conditions."
  }
];

const NCN_PROJECTION_PROFILE = {
  frame: {
    depth: 18,
    scrollFactor: 0.25,
    energy: 0.25
  },
  priority: {
    depth: 12,
    scrollFactor: 0.45,
    energy: 0.55
  },
  meta: {
    depth: 8,
    scrollFactor: 0.6,
    energy: 0.6
  },
  tags: {
    depth: 10,
    scrollFactor: 0.7,
    energy: 0.65
  },
  headline: {
    depth: 5,
    scrollFactor: 1,
    energy: 1
  },
  body: {
    depth: 14,
    scrollFactor: 0.18,
    energy: 0.55
  }
};
