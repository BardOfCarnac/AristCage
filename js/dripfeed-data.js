/*==================================================
  DRIPFEED PUBLICATION MODEL

  Public lifecycle state belongs to the advert. SAVED and SEEN are local
  terminal state and are handled separately by dripfeed-app.js.
==================================================*/

const NCN_DRIPFEED_LISTING_TYPES = Object.freeze({
  offer: Object.freeze({ label: "Offer", priority: 2 }),
  wanted: Object.freeze({ label: "Wanted", priority: 3 }),
  event: Object.freeze({ label: "Event", priority: 4 })
});

const NCN_DRIPFEED_CATEGORY_CODES = Object.freeze({
  Items: "ITM",
  Services: "SRV",
  Housing: "HSE",
  Jobs: "JOB",
  Rides: "RDE",
  Community: "COM"
});

function dripfeedDemoImage(label, from, to) {
  const safeLabel = String(label).replace(/[<>&]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient><pattern id="p" width="86" height="86" patternUnits="userSpaceOnUse"><path d="M0 86L86 0M-24 24L24-24M62 110L110 62" stroke="rgba(255,255,255,.10)" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#p)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" opacity=".88" font-family="monospace" font-size="52">${safeLabel}</text></svg>`;
  return {
    provider: "demo",
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    alt: safeLabel
  };
}

function dripfeedExpiryScope(expiresAt, publicationState = "live") {
  if (publicationState !== "live") return "All Time";
  const remaining = new Date(expiresAt).getTime() - new Date("2045-07-14T21:20:00-07:00").getTime();
  return remaining <= 86400000 ? "Now" : "Last Day";
}

function dripfeedExpiryLabel(expiresAt, publicationState = "live") {
  if (publicationState === "expired") return "EXPIRED";
  if (publicationState === "removed") return "REMOVED";
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return "NO EXPIRY";
  return `EXPIRES ${expiry.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}`;
}

function createDripfeedEntry(raw) {
  const listingType = NCN_DRIPFEED_LISTING_TYPES[raw.listingType] || NCN_DRIPFEED_LISTING_TYPES.offer;
  const category = NCN_APP_FILTER_OPTIONS.dripfeed.category.includes(raw.category) ? raw.category : "Items";
  const image = raw.image?.url ? { ...raw.image } : null;
  const publicationState = ["live", "expired", "removed"].includes(raw.publicationState)
    ? raw.publicationState
    : "live";
  const area = NCN_APP_FILTER_OPTIONS.dripfeed.area.includes(raw.district) ? raw.district : "City Center";

  return {
    id: String(raw.id),
    app: "dripfeed",
    type: "classified",
    listingType: raw.listingType || "offer",
    publicationState,
    priority: listingType.priority,
    priorityLabel: listingType.label,
    category,
    area,
    district: area,
    sourceType: image ? "Image" : "Text",
    timeScope: dripfeedExpiryScope(raw.expiresAt, publicationState),
    headline: String(raw.title || "Untitled classified"),
    meta: `${String(raw.valueLabel || "NAME PRICE")} // ${area} // ${String(raw.posterAlias || "ANONYMOUS")}`,
    tags: `${listingType.label} // ${category} // ${dripfeedExpiryLabel(raw.expiresAt, publicationState)}`,
    body: String(raw.body || "No further details supplied."),
    posterAlias: String(raw.posterAlias || "ANONYMOUS"),
    valueLabel: String(raw.valueLabel || "NAME PRICE"),
    contactMethod: String(raw.contactMethod || `PING ${raw.id}`),
    createdAt: raw.createdAt || new Date().toISOString(),
    expiresAt: raw.expiresAt || null,
    image
  };
}

const NCN_DRIPFEED_PUBLICATIONS = [
  { id:"DF-701", listingType:"offer", category:"Services", title:"Courier runs across the river after dusk", body:"Two wheels, sealed bags, no questions. Same-night delivery across the central districts.", posterAlias:"FIXIE", district:"The Glen", valueLabel:"€$45 / RUN", contactMethod:"REDWIRE 6F-11", createdAt:"2045-07-14T21:11:00-07:00", expiresAt:"2045-07-17T21:11:00-07:00", publicationState:"live", image:dripfeedDemoImage("NIGHT COURIER", "#130506", "#e24831") },
  { id:"DF-702", listingType:"offer", category:"Housing", title:"Industrial unit to share", body:"Dry lockup, three-phase power and a landlord who values silence. One bench already occupied.", posterAlias:"MARA-9", district:"South Night City", valueLabel:"€$620 / MO", contactMethod:"DROP 19 / NIGHT", createdAt:"2045-07-14T20:59:00-07:00", expiresAt:"2045-07-21T20:59:00-07:00", publicationState:"live", image:dripfeedDemoImage("LOCKUP 19", "#0d1115", "#5b6670") },
  { id:"DF-703", listingType:"offer", category:"Items", title:"Vintage amp needs a new home", body:"Loud, ugly and almost indestructible. Patched twice. Cash or useful components.", posterAlias:"KNUCKLE", district:"Watson", valueLabel:"€$180", contactMethod:"ASK AT NEEDLE BAR", createdAt:"2045-07-14T20:46:00-07:00", expiresAt:"2045-07-18T20:46:00-07:00", publicationState:"live", image:null },
  { id:"DF-704", listingType:"event", category:"Community", title:"Saturday rooftop planting crew", body:"Bring gloves. Soil, food and water supplied. Children welcome before dark.", posterAlias:"CIVIC GARDEN", district:"Heywood", valueLabel:"FREE", contactMethod:"CIVIC BAND 3", createdAt:"2045-07-14T20:34:00-07:00", expiresAt:"2045-07-16T20:34:00-07:00", publicationState:"live", image:dripfeedDemoImage("ROOFTOP GARDEN", "#091711", "#3b7e4f") },
  { id:"DF-705", listingType:"wanted", category:"Jobs", title:"Driver wanted for one clean airport run", body:"Own vehicle preferred. Route details released after contact verification.", posterAlias:"ORBITAL JANE", district:"City Center", valueLabel:"€$320", contactMethod:"BURST CODE OJ-4", createdAt:"2045-07-14T20:26:00-07:00", expiresAt:"2045-07-15T20:26:00-07:00", publicationState:"live", image:dripfeedDemoImage("AIRPORT RUN", "#0b0b1d", "#733f82") },
  { id:"DF-706", listingType:"offer", category:"Rides", title:"Ride share: Wellsprings to the Glen", body:"Leaving at 19:30. Two seats, small baggage only. No combat pets.", posterAlias:"TOMCAT", district:"Wellsprings", valueLabel:"€$20 / SEAT", contactMethod:"PING DF-706", createdAt:"2045-07-14T20:17:00-07:00", expiresAt:"2045-07-15T00:00:00-07:00", publicationState:"live", image:null },
  { id:"DF-682", listingType:"wanted", category:"Items", title:"Seeking obsolete Kiroshi ribbon cable", body:"Original or compatible. Photograph both connectors before contact.", posterAlias:"GLASSHOUSE", district:"Little Europe", valueLabel:"NAME PRICE", contactMethod:"DEAD DROP GL-2", createdAt:"2045-07-13T18:10:00-07:00", expiresAt:"2045-07-14T19:00:00-07:00", publicationState:"expired", image:null }
];

const NCN_DRIPFEED_ENTRIES = NCN_DRIPFEED_PUBLICATIONS.map(createDripfeedEntry);
