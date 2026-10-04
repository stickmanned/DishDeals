# Restaurant deal map

The current deliverable is the **embeddable React map component** in [`map-component/`](./map-component/README.md).

- Build the installable package: run `npm run build` and `npm pack` in `map-component/` to generate `restaurant-deals-map-0.2.0.tgz`.
- Source and shared props: `map-component/src/`
- Teammate integration example: `map-component/examples/TeamIntegration.tsx`
- All component UI and documentation are in English.

Restaurant comparison is available in [`ai-workflow/COMPARISON.md`](./ai-workflow/COMPARISON.md). It compares deals, prices, conditions and value, with a **Taste first** option based on supplied food review evidence. The HTTP and authenticated Convex APIs connect to your teammate's existing map selection; they do not add a standalone frontend. See [`ai-workflow/examples/compare-server.ts`](./ai-workflow/examples/compare-server.ts) for the server integration.

Restaurant search now falls back to Gemini with Google Search when stored offers have no matches. Sourced web discoveries stay separate from confirmed offers; independently verified branches can use the existing map component. See [`ai-workflow/DISCOVERY.md`](./ai-workflow/DISCOVERY.md) for configuration and integration.

No standalone website has been published. `map-site/` is an earlier, unused website draft; it is not part of the component or its distributable package.
