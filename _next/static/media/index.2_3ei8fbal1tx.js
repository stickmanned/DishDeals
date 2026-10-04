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
}) : n, e));
//#endregion
//#region src/markers.ts
function g(e, t, n) {
	let r = document.createElement("button");
	return r.type = "button", r.className = "bitemap-pin" + (t ? " bitemap-pin-selected" : ""), r.textContent = e.discountPercent === void 0 ? e.price === void 0 ? "Deal" : `${e.currency ?? "CAD"} ${e.price}` : `${e.discountPercent}%`, r.setAttribute("aria-label", `${e.restaurantName}: ${e.title}${e.isDemo ? " (demo)" : ""}`), r.setAttribute("aria-pressed", String(t)), r.addEventListener("click", n), r;
}
//#endregion
//#region node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url
var _ = "" + new URL("assets/maplibre-gl-worker-CsdWlX0D.js", import.meta.url).href;
//#endregion
//#region src/MapLibreView.tsx
function v(t) {
	let s = n(null), c = n(null), l = n([]), u = n(t);
	u.current = t;
	let [d, f] = r(!1), [p, m] = r("");
	e(() => {
		let e = !1, t, n = (t) => {
			e || (m(t), u.current.onError?.(t));
		};
		return import("./maplibre-gl-BZH0YVQt.js").then((r) => {
			if (!(e || !s.current)) try {
				r.setWorkerUrl(_);
				let i = new r.Map({
					container: s.current,
					center: u.current.initialCenter,
					zoom: u.current.initialZoom,
					minZoom: 2,
					maxZoom: 18,
					attributionControl: !1,
					renderWorldCopies: !0,
					style: {
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
					}
				});
				if (c.current = i, i.addControl(new r.NavigationControl({ showCompass: !1 }), "top-right"), i.addControl(new r.AttributionControl({ compact: !1 }), "bottom-right"), i.addControl(new r.ScaleControl({ unit: "metric" }), "bottom-left"), u.current.showLocateControl) {
					let e = new r.GeolocateControl({
						positionOptions: { enableHighAccuracy: !0 },
						trackUserLocation: !1
					});
					e.on("error", () => n("Location is unavailable. Check permission or move the map manually.")), i.addControl(e, "top-right");
				}
				let a = () => {
					let e = i.getBounds(), t = i.getCenter();
					u.current.onViewportChange?.({
						west: e.getWest(),
						east: e.getEast(),
						south: e.getSouth(),
						north: e.getNorth(),
						center: [t.lng, t.lat],
						zoom: i.getZoom()
					});
				};
				i.on("moveend", a), i.on("load", () => {
					e || (f(!0), a(), u.current.onReady?.("maplibre"));
				}), i.on("error", () => n("Some map tiles could not load. Check your connection or tile provider.")), i.on("sourcedata", () => {
					!e && i.isSourceLoaded("basemap") && m("");
				}), i.on("webglcontextlost", () => n("Map rendering was interrupted. Reload to continue.")), t = new ResizeObserver(() => i.resize()), t.observe(s.current);
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
			e || !c.current || (l.current.forEach((e) => e.remove()), l.current = t.deals.map((e) => new n.Marker({
				element: g(e, e.id === t.selectedId, () => u.current.onSelect?.(e)),
				anchor: "bottom"
			}).setLngLat([e.longitude, e.latitude]).addTo(c.current)));
		}), () => {
			e = !0;
		};
	}, [
		t.deals,
		t.selectedId,
		d
	]), e(() => {
		let e = u.current.deals.find((e) => e.id === t.selectedId);
		d && e && c.current && c.current.flyTo({
			center: [e.longitude, e.latitude],
			zoom: Math.max(14, c.current.getZoom()),
			essential: !1
		});
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
	}, v = n(!1), y = n(t.fitKey);
	return e(() => {
		if (!d) return;
		let e = y.current !== t.fitKey;
		y.current = t.fitKey, (e || !v.current && t.fitOnLoad !== !1 && t.deals.length) && (h(), v.current = !0);
	}, [
		d,
		t.fitKey,
		t.deals
	]), /* @__PURE__ */ o(i, { children: [
		/* @__PURE__ */ a("div", {
			ref: s,
			className: "bitemap-canvas"
		}),
		/* @__PURE__ */ a("button", {
			className: "bitemap-fit",
			onClick: h,
			disabled: !t.deals.length,
			children: "Show all deals"
		}),
		!d && !p && /* @__PURE__ */ a("div", {
			className: "bitemap-status",
			role: "status",
			children: "Loading map…"
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
function y(t) {
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
				position: "topright",
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
			e || !c.current || (l.current.forEach((e) => e.remove()), l.current = t.deals.map((e) => n.marker([e.latitude, e.longitude], {
				keyboard: !1,
				icon: n.divIcon({
					html: g(e, e.id === t.selectedId, () => u.current.onSelect?.(e)),
					className: "bitemap-marker",
					iconSize: [60, 36],
					iconAnchor: [30, 42]
				})
			}).addTo(c.current)));
		}), () => {
			e = !0;
		};
	}, [
		t.deals,
		t.selectedId,
		d
	]), e(() => {
		let e = u.current.deals.find((e) => e.id === t.selectedId);
		d && e && c.current && c.current.flyTo([e.latitude, e.longitude], Math.max(14, c.current.getZoom()), { duration: .5 });
	}, [t.selectedId, d]);
	let _ = () => {
		c.current && u.current.deals.length && c.current.fitBounds(u.current.deals.map((e) => [e.latitude, e.longitude]), {
			padding: [55, 55],
			maxZoom: 14,
			animate: !0
		});
	}, v = n(!1), y = n(t.fitKey);
	return e(() => {
		if (!d) return;
		let e = y.current !== t.fitKey;
		y.current = t.fitKey, (e || !v.current && t.fitOnLoad !== !1 && t.deals.length) && (_(), v.current = !0);
	}, [
		d,
		t.fitKey,
		t.deals
	]), /* @__PURE__ */ o(i, { children: [
		/* @__PURE__ */ a("div", {
			ref: s,
			className: "bitemap-canvas"
		}),
		/* @__PURE__ */ a("button", {
			className: "bitemap-fit",
			onClick: _,
			disabled: !t.deals.length,
			children: "Show all deals"
		}),
		t.showLocateControl && /* @__PURE__ */ a("button", {
			className: "bitemap-locate",
			"aria-label": "Find my location",
			onClick: () => {
				m(""), c.current?.locate({
					setView: !0,
					maxZoom: 14
				});
			},
			children: "◎"
		}),
		!d && !p && /* @__PURE__ */ a("div", {
			className: "bitemap-status",
			role: "status",
			children: "Loading map…"
		}),
		p && /* @__PURE__ */ a("div", {
			className: "bitemap-error",
			role: "status",
			children: p
		})
	] });
}
//#endregion
//#region src/data.ts
var b = "https://tile.openstreetmap.org/{z}/{x}/{y}.png", x = "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">OpenStreetMap contributors</a>";
function S(e) {
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
var C = (e) => ((e + 180) % 360 + 360) % 360 - 180;
function w(e, t) {
	if (e.latitude < t.south || e.latitude > t.north) return !1;
	if (t.east - t.west >= 360) return !0;
	let n = C(t.west), r = C(t.east), i = C(e.longitude);
	return n <= r ? i >= n && i <= r : i >= n || i <= r;
}
//#endregion
//#region src/DealMap.tsx
function T(e) {
	let { engine: n = "auto", selectedId: i, initialCenter: o = [-123.117, 49.278], initialZoom: s = 12, deals: c } = e, l = t(() => S(c), [c]), [u, d] = r(!1), [f, p] = r(null), m = (t) => {
		i === void 0 && p(t.id), e.onSelect?.(t);
	}, h = i === void 0 ? f : i, g = l.some((e) => e.id === h) ? h : null, _ = n === "raster" || n === "auto" && u ? "raster" : "maplibre", b = {
		...e,
		deals: l,
		selectedId: g,
		onSelect: m,
		initialCenter: o,
		initialZoom: s,
		tileUrl: e.tileUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		tileAttribution: e.tileAttribution ?? "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">OpenStreetMap contributors</a>"
	}, x = JSON.stringify([
		b.tileUrl,
		b.tileAttribution,
		n
	]);
	return /* @__PURE__ */ a("div", {
		className: `bitemap ${e.className ?? ""}`,
		style: e.style,
		role: "region",
		"aria-label": e.ariaLabel ?? "Restaurant deals map",
		children: _ === "raster" ? /* @__PURE__ */ a(y, { ...b }, x) : /* @__PURE__ */ a(v, {
			...b,
			onUnsupported: n === "auto" ? () => d(!0) : void 0
		}, x)
	});
}
//#endregion
export { x as DEFAULT_ATTRIBUTION, b as DEFAULT_TILE_URL, T as DealMap, w as isDealInViewport, S as parseMapDeals, p as t };
