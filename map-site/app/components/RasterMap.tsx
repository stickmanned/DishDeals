"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as LeafletMap,Marker} from "leaflet";
import "leaflet/dist/leaflet.css";
import {LocateFixed} from "lucide-react";
import type {DealMapProps} from "./DealMap";
export default function RasterMap({deals,selectedId,onSelect,onBoundsChange,fitKey}:DealMapProps){
  const container=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),markers=useRef<Marker[]>([]);
  const callbacks=useRef({onSelect,onBoundsChange});callbacks.current={onSelect,onBoundsChange};
  const latestDeals=useRef(deals);latestDeals.current=deals;
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let disposed=false;
    import("leaflet").then(L=>{
      if(disposed || !container.current)return;
      const m=L.map(container.current,{zoomControl:false,minZoom:3,maxZoom:18}).setView([49.278,-123.117],13);map.current=m;
      const tiles=L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(m);
      tiles.on("tileerror",()=>setError("部分底图暂时无法加载，请检查网络。"));tiles.on("load",()=>setError(""));
      L.control.zoom({position:"topright",zoomInTitle:"放大地图",zoomOutTitle:"缩小地图"}).addTo(m);L.control.scale({imperial:false}).addTo(m);m.attributionControl.setPrefix(false);
      const bounds=()=>{const b=m.getBounds();callbacks.current.onBoundsChange?.({west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()});};
      m.on("moveend",bounds);m.on("locationerror",()=>setError("无法获取位置，请允许定位权限或直接拖动地图。"));setReady(true);bounds();
    }).catch(()=>setError("地图加载失败，请刷新重试。"));
    return()=>{disposed=true;markers.current.forEach(m=>m.remove());map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready)return;let disposed=false;
    import("leaflet").then(L=>{
      if(disposed || !map.current)return;markers.current.forEach(m=>m.remove());
      markers.current=deals.map(d=>{
        const el=document.createElement("button");el.type="button";el.className="deal-pin"+(d.id===selectedId?" selected":"");el.textContent=d.discountPercent?`${d.discountPercent}%`:(d.price!==undefined?`$${d.price}`:"优惠");el.setAttribute("aria-label",`${d.restaurantName}：${d.title}`);el.setAttribute("aria-pressed",String(d.id===selectedId));el.addEventListener("click",()=>callbacks.current.onSelect(d.id));
        return L.marker([d.latitude,d.longitude],{keyboard:false,icon:L.divIcon({html:el,className:"leaflet-deal-pin",iconSize:[56,36],iconAnchor:[28,42]})}).addTo(map.current!);
      });
    });return()=>{disposed=true;};
  },[deals,selectedId,ready]);
  useEffect(()=>{const d=latestDeals.current.find(d=>d.id===selectedId);if(d&&ready&&map.current)map.current.flyTo([d.latitude,d.longitude],Math.max(14,map.current.getZoom()),{duration:.6});},[selectedId,ready]);
  useEffect(()=>{if(ready&&map.current&&latestDeals.current.length)map.current.fitBounds(latestDeals.current.map(d=>[d.latitude,d.longitude] as [number,number]),{padding:[65,65],maxZoom:13,animate:true});},[fitKey,ready]);
  return <><div ref={container} className="map-canvas raster-map" aria-label="餐厅优惠交互地图"/><button className="locate-button" aria-label="定位我的位置" onClick={()=>{setError("");map.current?.locate({setView:true,maxZoom:14});}}><LocateFixed size={18}/></button>{!ready&&!error&&<div className="map-loading" role="status">正在加载地图…</div>}{error&&<div className="map-error" role="status">{error}</div>}</>;
}
