# Dripfeed Provider-Neutral Image Picker

Status: implemented as a mock-first front-end publication

Owner: Dripfeed

Integration boundary: the shared host loads the publication; it does not own provider search, result mapping, attribution, selection events, or story-image rendering.

Last provider-rule review: 30 July 2026

## 1. Purpose

The image picker lets a contributor attach an image while creating a Dripfeed transmission. It presents one coherent interaction while preserving the identity and obligations of every image source.

The picker is deliberately not an image-discovery product in its own right. It exists only inside the classified-transmission workflow.

## 2. Goals

- Support Unsplash and Pexels behind one Dripfeed-owned interface.
- Remain fully usable with deterministic mock results before Supabase exists.
- Keep API credentials and provider requests out of the public browser bundle.
- Preserve source identity, creator credit, provider links, hotlinking requirements, and selection-event requirements in stored story data.
- Keep the current Dripfeed story renderer and local persistence working.
- Avoid any dependency on Optical, chamber weather, chamber movement, or the shared lifecycle beyond ordinary script loading and application activation.
- Permit additional providers later without rewriting the submit wizard.

## 3. Non-goals

- Recreating a stock-photo marketplace or a general image library.
- Mixing providers into an unlabelled result pool.
- Downloading Unsplash images into NCN storage.
- Provider OAuth, likes, collections, contributor accounts, or user accounts.
- Automatic publication based on an image search result.
- AI tagging, bulk collection, scraping, dataset creation, or model training.
- Upload persistence before a storage backend is connected.

## 4. User flow

1. The contributor completes transmission details.
2. The contributor enters the image step.
3. The contributor chooses Unsplash, Pexels, an external HTTPS URL, or text only.
4. A network provider searches through the provider registry.
5. Each result visibly identifies its provider and creator.
6. Selecting a result stages it locally and shows four Dripfeed crop previews.
7. Pressing `USE IMAGE / REVIEW` commits the selection.
8. The provider registry performs any required provider event exactly once.
9. The registry maps the result to a provider-neutral story image.
10. The review and published transmission use shared renderer helpers for URL choice and attribution.

Highlighting a thumbnail is not treated as a committed choice. The commit boundary is the move from Image to Review.

## 5. Provider presentation

The first release uses explicit source tabs:

- Unsplash
- Pexels
- Image URL
- Text only

A future `Search all` mode may be added only if every result continues to show a provider badge and every committed result retains provider-specific metadata. It is not required for the first live release.

## 6. Public browser contract

### `Dripfeed.images`

The provider publication exposes:

```js
{
  PROVIDER_IDS,
  SearchProvider,
  Registry,
  normaliseRemotePhoto,
  createDefaultRegistry
}
```

### Registry

```js
registry.list()
registry.get(providerId)
registry.search({ provider, query, page, orientation })
registry.registerSelection(photo)
registry.toStoryImage(photo)
```

The submit controller may call only this registry. It must not call Unsplash or Pexels-specific methods directly.

### Provider

A search provider owns:

```js
{
  id,
  label,
  live,
  search(request),
  registerSelection(photo),
  toStoryImage(photo)
}
```

Provider implementations own response normalization and provider-specific obligations.

## 7. Normalized search result

```js
{
  id: String,
  provider: 'unsplash' | 'pexels',
  alt: String,
  width: Number,
  height: Number,
  orientation: 'landscape' | 'portrait' | 'square' | '',
  colour: String,
  blurHash: String,
  urls: {
    thumb: String,
    small: String,
    regular: String,
    full: String
  },
  photographer: {
    name: String,
    url: String
  },
  photoUrl: String,
  providerUrl: String,
  downloadLocation: String,
  usage: {
    hotlinkRequired: Boolean,
    selectionTrackingRequired: Boolean,
    localCopyAllowed: Boolean
  },
  demo: Boolean
}
```

Raw provider payloads do not leave the provider boundary.

## 8. Stored story-image contract

The story model retains a top-level `url` for compatibility with existing Dripfeed renderers and persisted posts, plus the richer provider-neutral fields:

```js
{
  provider: String,
  providerImageId: String,
  id: String,
  url: String,
  alt: String,
  width: Number,
  height: Number,
  orientation: String,
  colour: String,
  blurHash: String,
  urls: {
    thumbnail: String,
    display: String,
    expanded: String
  },
  credit: {
    creatorName: String,
    creatorUrl: String,
    providerName: String,
    providerUrl: String,
    providerPageUrl: String,
    attributionRequired: Boolean,
    attributionRecommended: Boolean
  },
  usage: {
    hotlinkRequired: Boolean,
    selectionTrackingRequired: Boolean,
    localCopyAllowed: Boolean,
    selectionTrackingUrl: String
  },
  selectedAt: ISODateString,
  crop: null | {
    focusX: Number,
    focusY: Number
  }
}
```

`Dripfeed.model.normaliseStoryImage()` upgrades older locally persisted Unsplash and demo records into this shape.

## 9. Rendering contract

The renderer owns:

```js
Dripfeed.render.imageUrl(image, variant)
Dripfeed.render.imageCredit(image)
Dripfeed.render.hasVisibleCredit(image)
```

Supported variants are `thumbnail`, `display`, and `expanded`.

Credits are rendered in:

- search results through provider and creator labels;
- the staged-image preview;
- the review card;
- the published tile when the provider requires or recommends credit;
- the expanded reader.

Attribution links must remain independently operable and must not trigger the surrounding tile action.

## 10. Crop preview

The staged-image panel previews the same selected image as:

- 1 x 1
- 2 x 1
- 1 x 2
- 2 x 2

The first release uses centered `background-size: cover` crops. A later focal-point control may populate `crop.focusX` and `crop.focusY`; that enhancement must remain Dripfeed-owned and must not change the provider contract.

## 11. Backend boundary

No live provider credential belongs in the browser.

The front end supports either one shared provider-aware endpoint pair:

```http
GET  /images/search?provider=unsplash&query=neon+city&page=1&orientation=landscape
POST /images/selection
```

or provider-specific endpoints supplied through configuration.

### Search response

```json
{
  "provider": "unsplash",
  "page": 1,
  "total": 128,
  "totalPages": 13,
  "results": []
}
```

Every result should already be mapped to the normalized browser contract. The browser normalizer remains defensive but is not a substitute for server validation.

### Selection request

```json
{
  "provider": "unsplash",
  "providerImageId": "photo-id",
  "selectionTrackingUrl": "https://api.unsplash.com/photos/photo-id/download"
}
```

The backend must not fetch an arbitrary client-provided URL. It must validate the provider, image ID, host, path, and expected provider endpoint before making a request.

## 12. Provider rules represented in code

### Unsplash

The current official API documentation and API guidelines require applications to use the image URLs returned by the API, visibly attribute API content, and trigger the returned download-location endpoint when a user chooses an image for use.

The Dripfeed contract therefore records:

```js
{
  hotlinkRequired: true,
  selectionTrackingRequired: true,
  localCopyAllowed: false
}
```

The live flow refuses to continue when a required selection endpoint is not configured. Mock results require no event.

Official references:

- https://unsplash.com/documentation
- https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
- https://unsplash.com/api-terms

### Pexels

Pexels permits API-powered image selection inside an application whose primary purpose is not recreating Pexels. Its API documentation asks for a prominent Pexels link and photographer credit where possible; stronger attribution is also relevant to higher API limits.

The Dripfeed contract therefore preserves creator and provider links and marks attribution as recommended. No Unsplash-style selection event is invented for Pexels.

Official references:

- https://www.pexels.com/api/documentation/
- https://help.pexels.com/hc/en-us/articles/900005852323-How-do-I-get-unlimited-requests
- https://help.pexels.com/hc/en-us/articles/4405588861721-Can-I-use-the-API-as-a-wallpaper-app

Provider rules must be reviewed again before enabling either live endpoint, because API terms can change independently of the NCN codebase.

## 13. Configuration

```js
NCN_CONFIG.dripfeed = {
  imageSearchEndpoint: '',
  imageTrackEndpoint: '',
  unsplashSearchEndpoint: '',
  unsplashTrackEndpoint: '',
  pexelsSearchEndpoint: '',
  pexelsTrackEndpoint: ''
};
```

Precedence:

1. provider-specific endpoint;
2. shared provider-aware endpoint;
3. deterministic mock provider.

This means the complete picker remains testable without Supabase.

## 14. Mock mode

Mock mode is a real provider mode, not a separate UI.

It provides deterministic Unsplash-labelled and Pexels-labelled records with varied orientations. It exercises:

- source switching;
- result layout;
- provider badges;
- attribution;
- story normalization;
- crop previews;
- selection commit semantics;
- local persistence;
- review and published rendering.

Mock images are generated data-URI graphics and do not borrow live provider CDN URLs.

## 15. State model

Submit-controller state:

```js
{
  step,
  source,
  selectedPhoto,
  committedPhotoKey,
  results,
  page,
  totalPages,
  searchRequest
}
```

Important transitions:

- source change clears the staged network result;
- a newer search invalidates an older response through `searchRequest`;
- selecting a different result clears `committedPhotoKey`;
- committing the same provider/image pair twice does not send a second provider event;
- provider-event failure blocks the move to Review when the event is required;
- custom URL and text-only choices bypass provider events.

## 16. Accessibility

- Source controls are buttons with a visible active state.
- Search controls have explicit labels.
- Result buttons expose `aria-pressed`.
- Search status uses a polite live region.
- Images carry provider-derived alt text when available.
- Credit links are keyboard reachable.
- Links inside published cards stop propagation so they do not open the reader accidentally.
- Reduced-motion behaviour remains governed by existing Dripfeed rules.

## 17. Security and privacy

- No provider API key is placed in `NCN_CONFIG` or shipped to the client.
- Search terms are sent only after the user activates a provider search.
- The backend must enforce query length, page limits, orientation allowlists, timeouts, and response-size limits.
- The backend must rate-limit by terminal/session/IP according to the eventual NCN privacy design.
- Selection URLs must be reconstructed or strictly validated server-side.
- Provider response HTML is never trusted; all displayed strings and URLs pass through existing escaping helpers.
- Custom URLs must use HTTPS. A future server validator may additionally block private-network and unsafe image targets.

## 18. Tests

`tests/dripfeed-image-providers.test.js` verifies:

- provider registration order;
- mock search by provider and orientation;
- story-image mapping;
- provider-specific usage flags;
- Pexels and Unsplash attribution data;
- legacy image normalization;
- exact-once Unsplash selection tracking;
- unknown-provider rejection.

`tests/dripfeed-image-picker-contract.test.js` verifies:

- production script load order;
- stylesheet publication;
- source tabs and shared network panel;
- generic search IDs;
- provider-registry use from the submit controller;
- absence of direct Unsplash calls from the submit controller;
- generic renderer credit support.

## 19. Integration ownership

Dripfeed owns:

- picker markup and styling;
- providers and normalized contracts;
- provider attribution;
- selection commit behaviour;
- story image persistence;
- crop previews;
- tests.

The Integration Agent owns only:

- publishing the new scripts and stylesheet in safe load order;
- ensuring Dripfeed activation/deactivation still works;
- preventing the picker overlay from leaking into another application;
- validating that no new work enters protected Optical or chamber frame paths.

The backend department will later own:

- secret storage;
- provider HTTP requests;
- response validation and mapping;
- rate limiting;
- server-side provider-event validation;
- operational logging that excludes secrets.

## 20. Rollout

### Stage 1: merged mock-first picker

- Unsplash and Pexels tabs available.
- Both use deterministic mock results.
- Existing custom URL and text-only paths remain available.
- Story data is already provider-neutral.

### Stage 2: server contract proof

- Implement one search proxy for one provider.
- Leave the other provider mocked.
- Verify attribution, hotlinking, rate-limit headers, errors, and selection semantics.

### Stage 3: first production provider

- Enable Unsplash or Pexels only after its current terms have been checked and credentials are stored server-side.
- Collect screenshots of search, selection, review, tile, and reader attribution.

### Stage 4: second production provider

- Add the second backend adapter without changing the browser UI contract.
- Re-run provider and browser tests.

### Stage 5: optional unified search

- Consider `Search all` only after both live providers are stable.
- Results must remain visibly sourced and provider events must remain isolated.

## 21. Acceptance criteria

The publication is ready for its mock-first merge when:

- the app loads without a backend;
- Unsplash and Pexels searches return distinct mock results;
- changing provider does not leak the previous provider's selected result;
- the staged image shows four crop previews;
- moving to Review commits the selected result once;
- provider metadata survives local persistence;
- both providers render attribution links;
- custom URL and text-only flows still work;
- Node syntax and contract tests pass;
- no protected Optical, chamber, weather, or movement file is modified.
