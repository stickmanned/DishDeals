"use client";
"use client";
import { useEffect as e, useMemo as t, useRef as n, useState as r } from "react";
import { Fragment as i, jsx as a, jsxs as o } from "react/jsx-runtime";
//#region \0rolldown/runtime.js
var s = Object.create, c = Object.defineProperty, l = Object.getOwnPropertyDescriptor, u = Object.getOwnPropertyNames, d = Object.getPrototypeOf, f = Object.prototype.hasOwnProperty, p = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), m = (e, t, n, r) => {
	if (t && typeof t == "object" || typeof t == "function") for (var i = u(t), a = 0, o = i.length, s; a < o; a++) s = i[a], !f.call(e, s) && s !== n && c(e, s, {
		get: ((e) => t[e]).bind(null, s),
		enumerable: !(r = l(t, s)) || r.enumerable
	});
	return e;
}, h = (e, t, n) => (n = e == null ? {} : s(d(e)), m(t || !e || !e.__esModule ? c(n, "default", {
	value: e,
	enumerable: !0
}) : n, e)), g = /* @__PURE__ */ new WeakMap();
function _(e, t) {
	return !!e && g.get(e) === JSON.stringify(t);
}
function v(e, t, n) {
	let r = document.createElement("button");
	r.type = "button", r.className = "bitemap-pin" + (t ? " bitemap-pin-selected" : "");
	let i = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	i.setAttribute("viewBox", "0 0 34 44"), i.setAttribute("aria-hidden", "true"), i.classList.add("bitemap-pin-icon"), i.innerHTML = "<path class=\"bitemap-pin-shape\" d=\"M17 1C8.2 1 1 8.2 1 17c0 11 16 26 16 26s16-15 16-26C33 8.2 25.8 1 17 1Z\"/><g fill=\"none\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 9v7c0 2 5 2 5 0V9m-2.5 0v18m10-18c-4 0-5 10-1 10h1V9Zm0 10v8\"/></g>", r.appendChild(i);
	let a = document.createElement("span");
	return a.className = "bitemap-pin-label", a.textContent = e.restaurantName, r.appendChild(a), r.dataset.dealId = e.id, r.title = `${e.restaurantName} · ${e.title}`, g.set(r, JSON.stringify(e)), r.setAttribute("aria-label", `${e.restaurantName}: ${e.title}${e.isDemo ? " (demo)" : ""}`), r.setAttribute("aria-pressed", String(t)), r.addEventListener("click", n), r;
}
//#endregion
//#region src/MapIcon.tsx
function y({ name: e, ...t }) {
	let n = {
		fit: /* @__PURE__ */ o(i, { children: [/* @__PURE__ */ a("path", { d: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" }), /* @__PURE__ */ a("path", { d: "M8 12h8m-4-4v8" })] }),
		pin: /* @__PURE__ */ o(i, { children: [/* @__PURE__ */ a("path", { d: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" }), /* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "10",
			r: "2.5"
		})] }),
		arrow: /* @__PURE__ */ a(i, { children: /* @__PURE__ */ a("path", { d: "m7 17 10-10M7 7h10v10" }) }),
		location: /* @__PURE__ */ o(i, { children: [
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "6"
			}),
			/* @__PURE__ */ a("path", { d: "M12 2v4m0 12v4M2 12h4m12 0h4" }),
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "1"
			})
		] })
	};
	return /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "18",
		height: "18",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		...t,
		children: n[e]
	});
}
//#endregion
//#region src/streetStyle.ts
function b() {
	let e = "openmaptiles", t = (e) => [
		"match",
		["get", "class"],
		e,
		!0,
		!1
	], n = (n, r, i, a) => ({
		id: n,
		type: "line",
		source: e,
		"source-layer": "transportation",
		filter: t(r),
		layout: {
			"line-cap": "round",
			"line-join": "round"
		},
		paint: {
			"line-color": i,
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				8,
				.4,
				12,
				1.2,
				14,
				a,
				16,
				a * 2,
				18,
				a * 4
			]
		}
	}), r = (t, n, r, i) => ({
		id: t,
		type: "symbol",
		source: e,
		"source-layer": n,
		minzoom: i,
		layout: {
			"text-field": [
				"coalesce",
				["get", "name:en"],
				["get", "name_en"],
				["get", "name:latin"],
				["get", "name"]
			],
			"text-font": ["Noto Sans Regular"],
			"text-size": r,
			"text-max-width": 10,
			"text-padding": 12
		},
		paint: {
			"text-color": "#667076",
			"text-halo-color": "#ffffff",
			"text-halo-width": 1.5
		}
	}), i = r("street-names", "transportation_name", 11, 13);
	i.layout = {
		...i.layout,
		"symbol-placement": "line",
		"text-padding": 5,
		"symbol-spacing": 300
	};
	let a = r("district-names", "place", 13, 10);
	a.filter = [
		"match",
		["get", "class"],
		[
			"suburb",
			"neighbourhood",
			"quarter"
		],
		!0,
		!1
	], a.layout = {
		...a.layout,
		"text-letter-spacing": .06,
		"text-transform": "uppercase"
	};
	let o = r("city-names", "place", 18, 3);
	o.filter = [
		"match",
		["get", "class"],
		[
			"city",
			"town",
			"village"
		],
		!0,
		!1
	];
	let s = r("water-names", "water_name", 12, 10);
	return s.paint = {
		...s.paint,
		"text-color": "#517d98",
		"text-halo-color": "#a8d5ec",
		"text-halo-width": 1
	}, {
		version: 8,
		name: "Restaurant streets",
		glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
		sources: { openmaptiles: {
			type: "vector",
			url: "https://tiles.openfreemap.org/planet",
			attribution: "<a href=\"https://openfreemap.org\" target=\"_blank\" rel=\"noopener noreferrer\">OpenFreeMap</a> © <a href=\"https://openmaptiles.org\" target=\"_blank\" rel=\"noopener noreferrer\">OpenMapTiles</a> Data from <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">OpenStreetMap</a>"
		} },
		layers: [
			{
				id: "land",
				type: "background",
				paint: { "background-color": "#f1f2f0" }
			},
			{
				id: "residential",
				type: "fill",
				source: e,
				"source-layer": "landuse",
				filter: [
					"==",
					["get", "class"],
					"residential"
				],
				paint: { "fill-color": "#e9ece8" }
			},
			{
				id: "woodland",
				type: "fill",
				source: e,
				"source-layer": "landcover",
				filter: [
					"match",
					["get", "class"],
					["wood", "grass"],
					!0,
					!1
				],
				paint: { "fill-color": "#c5e4b6" }
			},
			{
				id: "parks",
				type: "fill",
				source: e,
				"source-layer": "park",
				paint: { "fill-color": "#c6e5b6" }
			},
			{
				id: "water",
				type: "fill",
				source: e,
				"source-layer": "water",
				paint: { "fill-color": "#a8d5ec" }
			},
			{
				id: "waterways",
				type: "line",
				source: e,
				"source-layer": "waterway",
				paint: {
					"line-color": "#a8d5ec",
					"line-width": 2
				}
			},
			{
				id: "buildings",
				type: "fill",
				source: e,
				"source-layer": "building",
				minzoom: 15,
				paint: {
					"fill-color": "#e0e3df",
					"fill-outline-color": "#d9ddd8"
				}
			},
			n("paths", [
				"path",
				"pedestrian",
				"track"
			], "#ffffff", 1),
			n("minor-road-edges", ["minor", "service"], "#dfe3df", 4),
			n("minor-roads", ["minor", "service"], "#ffffff", 3),
			n("secondary-road-edges", ["secondary", "tertiary"], "#ffffff", 6),
			n("secondary-roads", ["secondary", "tertiary"], "#fff4d2", 4),
			n("primary-road-edges", [
				"primary",
				"trunk",
				"motorway"
			], "#ffffff", 8),
			n("primary-roads", [
				"primary",
				"trunk",
				"motorway"
			], "#f7d36b", 5.5),
			i,
			s,
			a,
			o
		]
	};
}
//#endregion
//#region node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url
var x = "" + new URL("assets/maplibre-gl-worker-CsdWlX0D.js", import.meta.url).href;
//#endregion
//#region src/MapLibreView.tsx
function S(t) {
	let s = n(null), c = n(null), l = n([]), u = n(t);
	u.current = t;
	let [d, f] = r(!1), [p, m] = r("");
	e(() => {
		let e = !1, t, n = (t) => {
			e || (m(t), u.current.onError?.(t));
		};
		return import("./maplibre-gl-BZH0YVQt.js").then((r) => {
			if (!(e || !s.current)) try {
				r.setWorkerUrl(x);
				let i = u.current.mapStyleUrl ?? (u.current.useVectorBasemap ? b() : {
					version: 8,
					sources: { basemap: {
						type: "raster",
						tiles: [u.current.tileUrl],
						tileSize: 256,
						attribution: u.current.tileAttribution
					} },
					layers: [{
						id: "basemap",
						type: "raster",
						source: "basemap"
					}]
				}), a = new r.Map({
					container: s.current,
					center: u.current.initialCenter,
					zoom: u.current.initialZoom,
					minZoom: 2,
					maxZoom: 18,
					attributionControl: !1,
					renderWorldCopies: !0,
					style: i
				});
				if (c.current = a, a.addControl(new r.NavigationControl({ showCompass: !1 }), "bottom-right"), a.addControl(new r.AttributionControl({ compact: !1 }), "bottom-right"), a.addControl(new r.ScaleControl({ unit: "metric" }), "bottom-left"), u.current.showLocateControl) {
					let e = new r.GeolocateControl({
						positionOptions: { enableHighAccuracy: !0 },
						trackUserLocation: !1
					});
					e.on("error", () => n("Location is unavailable. Check permission or move the map manually.")), a.addControl(e, "top-right");
				}
				let o = () => {
					let e = a.getBounds(), t = a.getCenter();
					u.current.onViewportChange?.({
						west: e.getWest(),
						east: e.getEast(),
						south: e.getSouth(),
						north: e.getNorth(),
						center: [t.lng, t.lat],
						zoom: a.getZoom()
					});
				};
				a.on("moveend", o), a.on("load", () => {
					e || (f(!0), o(), u.current.onReady?.("maplibre"));
				}), a.on("error", () => n("Some map tiles could not load. Check your connection or tile provider.")), a.on("sourcedata", () => {
					!e && a.areTilesLoaded() && m("");
				}), a.on("webglcontextlost", () => n("Map rendering was interrupted. Reload to continue.")), t = new ResizeObserver(() => a.resize()), t.observe(s.current);
			} catch {
				try {
					c.current?.remove();
				} catch {}
				c.current = null, u.current.onUnsupported ? u.current.onUnsupported() : n("WebGL is unavailable. Use engine=\"auto\" or engine=\"raster\".");
			}
		}).catch(() => n("The map renderer could not load. Please reload.")), () => {
			e = !0, t?.disconnect(), l.current.forEach((e) => e.remove()), c.current?.remove(), c.current = null;
		};
	}, []), e(() => {
		if (!d) return;
		let e = !1;
		return import("./maplibre-gl-BZH0YVQt.js").then((n) => {
			if (e || !c.current) return;
			let r = new Map(l.current.map((e) => [e.getElement().dataset.dealId, e]));
			l.current = t.deals.map((e) => {
				let t = r.get(e.id);
				return r.delete(e.id), t && _(t.getElement(), e) ? t : (t?.remove(), new n.Marker({
					element: v(e, e.id === u.current.selectedId, () => u.current.onSelect?.(e)),
					anchor: "bottom"
				}).setLngLat([e.longitude, e.latitude]).addTo(c.current));
			}), r.forEach((e) => e.remove());
		}), () => {
			e = !0;
		};
	}, [t.deals, d]), e(() => {
		l.current.forEach((e) => {
			let n = e.getElement(), r = n.dataset.dealId === t.selectedId;
			n.classList.toggle("bitemap-pin-selected", r), n.setAttribute("aria-pressed", String(r));
		});
	}, [
		t.selectedId,
		t.deals,
		d
	]), e(() => {
		let e = u.current.deals.find((e) => e.id === t.selectedId);
		if (d && e && c.current) {
			let t = s.current && s.current.clientWidth <= 480 && u.current.showDealCard !== !1 ? [0, -45] : [0, 0];
			c.current.flyTo({
				center: [e.longitude, e.latitude],
				zoom: Math.max(14, c.current.getZoom()),
				offset: t,
				essential: !1
			});
		}
	}, [t.selectedId, d]);
	let h = () => {
		let e = u.current.deals;
		if (!c.current || !e.length) return;
		let t = e.map((e) => e.longitude), n = e.map((e) => e.latitude);
		c.current.fitBounds([[Math.min(...t), Math.min(...n)], [Math.max(...t), Math.max(...n)]], {
			padding: 55,
			maxZoom: 14,
			duration: 500
		});
	}, g = n(!1), S = n(t.fitKey);
	return e(() => {
		if (!d) return;
		let e = S.current !== t.fitKey;
		S.current = t.fitKey, (e || !g.current && t.fitOnLoad !== !1 && t.deals.length) && (h(), g.current = !0);
	}, [
		d,
		t.fitKey,
		t.deals
	]), /* @__PURE__ */ o(i, { children: [
		/* @__PURE__ */ a("div", {
			ref: s,
			className: "bitemap-canvas"
		}),
		/* @__PURE__ */ o("button", {
			type: "button",
			className: "bitemap-fit",
			onClick: h,
			disabled: !t.deals.length,
			children: [/* @__PURE__ */ a(y, { name: "fit" }), "Show all deals"]
		}),
		!d && !p && /* @__PURE__ */ o("div", {
			className: "bitemap-status",
			role: "status",
			children: [/* @__PURE__ */ a("span", { className: "bitemap-loading-dot" }), "Loading map…"]
		}),
		p && /* @__PURE__ */ a("div", {
			className: "bitemap-error",
			role: "status",
			children: p
		})
	] });
}
//#endregion
//#region src/RasterView.tsx
function C(t) {
	let s = n(null), c = n(null), l = n([]), u = n(t);
	u.current = t;
	let [d, f] = r(!1), [p, m] = r("");
	e(() => {
		let e = !1, t, n = (t) => {
			e || (m(t), u.current.onError?.(t));
		};
		return import("./leaflet-src-DYjV_XuN.js").then((e) => /* @__PURE__ */ h(e.default, 1)).then((r) => {
			if (e || !s.current) return;
			let i = u.current, a = r.map(s.current, {
				zoomControl: !1,
				minZoom: 2,
				maxZoom: 18
			}).setView([i.initialCenter[1], i.initialCenter[0]], i.initialZoom);
			c.current = a, r.tileLayer(i.tileUrl, {
				maxZoom: 19,
				attribution: i.tileAttribution
			}).on("tileerror", () => n("Some map tiles could not load. Check your connection or tile provider.")).on("tileload", () => {
				e || m("");
			}).addTo(a), r.control.zoom({
				position: "bottomright",
				zoomInTitle: "Zoom in",
				zoomOutTitle: "Zoom out"
			}).addTo(a), r.control.scale({ imperial: !1 }).addTo(a), a.attributionControl.setPrefix(!1);
			let o = () => {
				let e = a.getBounds(), t = a.getCenter();
				u.current.onViewportChange?.({
					west: e.getWest(),
					east: e.getEast(),
					south: e.getSouth(),
					north: e.getNorth(),
					center: [t.lng, t.lat],
					zoom: a.getZoom()
				});
			};
			a.on("moveend", o), a.on("locationerror", () => n("Location is unavailable. Check permission or move the map manually.")), t = new ResizeObserver(() => a.invalidateSize()), t.observe(s.current), f(!0), o(), u.current.onReady?.("raster");
		}).catch(() => n("The map renderer could not load. Please reload.")), () => {
			e = !0, t?.disconnect(), l.current.forEach((e) => e.remove()), c.current?.remove(), c.current = null;
		};
	}, []), e(() => {
		if (!d) return;
		let e = !1;
		return import("./leaflet-src-DYjV_XuN.js").then((e) => /* @__PURE__ */ h(e.default, 1)).then((n) => {
			if (e || !c.current) return;
			let r = new Map(l.current.map((e) => [e.getElement()?.querySelector(".bitemap-pin")?.dataset.dealId, e]));
			l.current = t.deals.map((e) => {
				let t = r.get(e.id);
				return r.delete(e.id), t && _(t.getElement()?.querySelector(".bitemap-pin") ?? void 0, e) ? t : (t?.remove(), n.marker([e.latitude, e.longitude], {
					keyboard: !1,
					icon: n.divIcon({
						html: v(e, e.id === u.current.selectedId, () => u.current.onSelect?.(e)),
						className: "bitemap-marker",
						iconSize: [34, 44],
						iconAnchor: [17, 44]
					})
				}).setZIndexOffset(e.id === u.current.selectedId ? 1e3 : 0).addTo(c.current));
			}), r.forEach((e) => e.remove());
		}), () => {
			e = !0;
		};
	}, [t.deals, d]), e(() => {
		l.current.forEach((e) => {
			let n = e.getElement()?.querySelector(".bitemap-pin");
			if (!n) return;
			let r = n.dataset.dealId === t.selectedId;
			n.classList.toggle("bitemap-pin-selected", r), n.setAttribute("aria-pressed", String(r)), e.setZIndexOffset(r ? 1e3 : 0);
		});
	}, [
		t.selectedId,
		t.deals,
		d
	]), e(() => {
		let e = u.current.deals.find((e) => e.id === t.selectedId);
		if (d && e && c.current) {
			let t = Math.max(14, c.current.getZoom()), n = s.current && s.current.clientWidth <= 480 && u.current.showDealCard !== !1 ? c.current.unproject(c.current.project([e.latitude, e.longitude], t).add([0, 45]), t) : [e.latitude, e.longitude];
			c.current.flyTo(n, t, { duration: .5 });
		}
	}, [t.selectedId, d]);
	let g = () => {
		c.current && u.current.deals.length && c.current.fitBounds(u.current.deals.map((e) => [e.latitude, e.longitude]), {
			padding: [55, 55],
			maxZoom: 14,
			animate: !0
		});
	}, b = n(!1), x = n(t.fitKey);
	return e(() => {
		if (!d) return;
		let e = x.current !== t.fitKey;
		x.current = t.fitKey, (e || !b.current && t.fitOnLoad !== !1 && t.deals.length) && (g(), b.current = !0);
	}, [
		d,
		t.fitKey,
		t.deals
	]), /* @__PURE__ */ o(i, { children: [
		/* @__PURE__ */ a("div", {
			ref: s,
			className: "bitemap-canvas"
		}),
		/* @__PURE__ */ o("button", {
			type: "button",
			className: "bitemap-fit",
			onClick: g,
			disabled: !t.deals.length,
			children: [/* @__PURE__ */ a(y, { name: "fit" }), "Show all deals"]
		}),
		t.showLocateControl && /* @__PURE__ */ a("button", {
			type: "button",
			className: "bitemap-locate",
			"aria-label": "Find my location",
			onClick: () => {
				m(""), c.current?.locate({
					setView: !0,
					maxZoom: 14
				});
			},
			children: /* @__PURE__ */ a(y, { name: "location" })
		}),
		!d && !p && /* @__PURE__ */ o("div", {
			className: "bitemap-status",
			role: "status",
			children: [/* @__PURE__ */ a("span", { className: "bitemap-loading-dot" }), "Loading map…"]
		}),
		p && /* @__PURE__ */ a("div", {
			className: "bitemap-error",
			role: "status",
			children: p
		})
	] });
}
//#endregion
//#region src/DealCard.tsx
function w({ deal: e }) {
	let t = e.price === void 0 ? null : e.currency ? `${e.currency} ${e.price.toFixed(2)}` : `${e.price.toFixed(2)} · currency unknown`;
	return /* @__PURE__ */ o("article", {
		className: "bitemap-card",
		"aria-label": "Selected restaurant offer",
		"aria-live": "polite",
		children: [
			/* @__PURE__ */ o("div", {
				className: "bitemap-card-heading",
				children: [/* @__PURE__ */ o("div", {
					className: "bitemap-card-heading-text",
					children: [/* @__PURE__ */ a("h3", { children: e.restaurantName }), /* @__PURE__ */ a("p", {
						className: "bitemap-card-kicker",
						children: e.isDemo ? "Demo restaurant" : "Restaurant offer"
					})]
				}), e.discountPercent !== void 0 && /* @__PURE__ */ o("span", {
					className: "bitemap-offer-badge",
					children: [e.discountPercent, "% off"]
				})]
			}),
			/* @__PURE__ */ a("p", {
				className: "bitemap-card-title",
				children: e.title
			}),
			e.address && /* @__PURE__ */ a("p", {
				className: "bitemap-card-address",
				children: e.address
			}),
			/* @__PURE__ */ o("div", {
				className: "bitemap-card-footer",
				children: [/* @__PURE__ */ a("div", { children: t ? /* @__PURE__ */ o(i, { children: [/* @__PURE__ */ a("span", {
					className: "bitemap-price",
					children: t
				}), /* @__PURE__ */ a("span", {
					className: "bitemap-card-note",
					children: "Listed offer price"
				})] }) : /* @__PURE__ */ a("span", {
					className: "bitemap-card-note",
					children: "Check the offer for prices and conditions"
				}) }), /* @__PURE__ */ o("a", {
					className: "bitemap-card-link",
					href: `https://www.google.com/maps/dir/?api=1&destination=${e.latitude},${e.longitude}`,
					target: "_blank",
					rel: "noopener noreferrer",
					children: ["Directions ", /* @__PURE__ */ a(y, { name: "arrow" })]
				})]
			}),
			e.sourceUrl && /* @__PURE__ */ o("a", {
				className: "bitemap-source-link",
				href: e.sourceUrl,
				target: "_blank",
				rel: "noopener noreferrer",
				children: ["View original offer ", /* @__PURE__ */ a(y, {
					name: "arrow",
					width: "14",
					height: "14"
				})]
			})
		]
	});
}
//#endregion
//#region src/data.ts
var T = "https://tile.openstreetmap.org/{z}/{x}/{y}.png", E = "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">OpenStreetMap contributors</a>";
function D(e) {
	if (!Array.isArray(e)) throw Error("Expected an array of deals.");
	let t = /* @__PURE__ */ new Set();
	return e.map((e, n) => {
		let r = (e) => {
			throw Error(`Deal ${n + 1}: ${e}`);
		};
		if (!e || typeof e != "object") return r("expected an object.");
		let i = e;
		for (let e of [
			"id",
			"restaurantName",
			"title"
		]) (typeof i[e] != "string" || !i[e].trim()) && r(`${e} must be a non-empty string.`);
		t.has(i.id) && r("id must be unique."), t.add(i.id), (typeof i.latitude != "number" || !Number.isFinite(i.latitude) || Math.abs(i.latitude) > 85.05112878) && r("latitude must be within the Web Mercator range (-85.05112878 to 85.05112878)."), (typeof i.longitude != "number" || !Number.isFinite(i.longitude) || Math.abs(i.longitude) > 180) && r("longitude must be between -180 and 180.");
		for (let e of ["price", "discountPercent"]) i[e] !== void 0 && (typeof i[e] != "number" || !Number.isFinite(i[e]) || i[e] < 0) && r(`${e} must be a finite, non-negative number.`);
		typeof i.discountPercent == "number" && i.discountPercent > 100 && r("discountPercent cannot exceed 100.");
		for (let e of [
			"address",
			"currency",
			"sourceUrl",
			"expiresAt"
		]) i[e] !== void 0 && typeof i[e] != "string" && r(`${e} must be a string.`);
		if (i.isDemo !== void 0 && typeof i.isDemo != "boolean" && r("isDemo must be boolean."), i.expiresAt !== void 0 && !Number.isFinite(Date.parse(i.expiresAt)) && r("expiresAt must be a valid date."), i.sourceUrl) {
			let e;
			try {
				e = new URL(i.sourceUrl);
			} catch {
				return r("sourceUrl must be an absolute URL.");
			}
			["http:", "https:"].includes(e.protocol) || r("sourceUrl must use HTTP or HTTPS.");
		}
		let a = {
			id: i.id,
			restaurantName: i.restaurantName,
			title: i.title,
			latitude: i.latitude,
			longitude: i.longitude
		};
		for (let e of [
			"address",
			"price",
			"currency",
			"discountPercent",
			"sourceUrl",
			"expiresAt",
			"isDemo"
		]) i[e] !== void 0 && Object.assign(a, { [e]: i[e] });
		return a;
	});
}
var O = (e) => ((e + 180) % 360 + 360) % 360 - 180;
function k(e, t) {
	if (e.latitude < t.south || e.latitude > t.north) return !1;
	if (t.east - t.west >= 360) return !0;
	let n = O(t.west), r = O(t.east), i = O(e.longitude);
	return n <= r ? i >= n && i <= r : i >= n || i <= r;
}
//#endregion
//#region src/DealMap.tsx
function A(e) {
	let { engine: n = "auto", selectedId: i, initialCenter: s = [-123.117, 49.278], initialZoom: c = 12, deals: l } = e, u = t(() => D(l), [l]), [d, f] = r(!1), [p, m] = r(null), h = (t) => {
		i === void 0 && m(t.id), e.onSelect?.(t);
	}, g = i === void 0 ? p : i, _ = u.some((e) => e.id === g) ? g : null, v = u.find((e) => e.id === _), b = n === "raster" || n === "auto" && d ? "raster" : "maplibre", x = {
		...e,
		deals: u,
		selectedId: _,
		onSelect: h,
		initialCenter: s,
		initialZoom: c,
		tileUrl: e.tileUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		tileAttribution: e.tileAttribution ?? "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">OpenStreetMap contributors</a>"
	}, T = JSON.stringify([
		x.tileUrl,
		x.tileAttribution,
		n,
		e.mapStyleUrl,
		e.tileUrl === void 0
	]);
	return /* @__PURE__ */ o("div", {
		className: `bitemap ${v && e.showDealCard !== !1 ? "bitemap-has-card " : ""}${e.className ?? ""}`,
		style: e.style,
		role: "region",
		"aria-label": e.ariaLabel ?? "Restaurant deals map",
		children: [
			b === "raster" ? /* @__PURE__ */ a(C, { ...x }, T) : /* @__PURE__ */ a(S, {
				...x,
				useVectorBasemap: e.tileUrl === void 0,
				onUnsupported: n === "auto" ? () => f(!0) : void 0
			}, T),
			/* @__PURE__ */ o("div", {
				className: "bitemap-context",
				children: [/* @__PURE__ */ a("span", {
					className: "bitemap-context-icon",
					children: /* @__PURE__ */ a(y, {
						name: "pin",
						width: "28",
						height: "28"
					})
				}), /* @__PURE__ */ o("div", { children: [/* @__PURE__ */ a("strong", { children: "Restaurant deals" }), /* @__PURE__ */ o("span", { children: [
					u.length,
					" ",
					u.length === 1 ? "offer" : "offers",
					" on the map"
				] })] })]
			}),
			!u.length && /* @__PURE__ */ o("div", {
				className: "bitemap-empty",
				role: "status",
				children: [
					/* @__PURE__ */ a(y, {
						name: "pin",
						width: "30",
						height: "30"
					}),
					/* @__PURE__ */ a("strong", { children: "No deals to show yet" }),
					/* @__PURE__ */ a("span", { children: "Offers will appear here when your app adds them." })
				]
			}),
			v && e.showDealCard !== !1 ? /* @__PURE__ */ a(w, { deal: v }) : null
		]
	});
}
//#endregion
export { E as DEFAULT_ATTRIBUTION, T as DEFAULT_TILE_URL, A as DealMap, k as isDealInViewport, D as parseMapDeals, p as t };
