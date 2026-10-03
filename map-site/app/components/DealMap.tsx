"use client";
import { useEffect,useRef,useState } from "react";
import type { Map as LibreMap,Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Deal } from "../lib/deals";
import RasterMap from "./RasterMap";
export type MapBounds={west:number;east:number;south:number;north:number};
export type DealMapProps={deals:Deal[];selectedId:string|null;onSelect:(id:string)=>void;onBoundsChange?:(bounds:MapBounds)=>void;fitKey?:string};
export default function DealMap({deals,selectedId,onSelect,onBoundsChange,fitKey}:DealMapProps){
  const container=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),markers=useRef<Marker[]>([]);
  const callbacks=useRef({onSelect,onBoundsChange});callbacks.current={onSelect,onBoundsChange};
  const [ready,setReady]=useState(false),[error,setError]=useState(""),[fallback,setFallback]=useState(false);
  useEffect(()=>{
    let disposed=false;
    import("maplibre-gl").then(({default:libre})=>{
      if(disposed || !container.current)return;
      try{
        const m=new libre.Map({container:container.current,center:[-123.117,49.278],zoom:12.7,minZoom:3,maxZoom:18,attributionControl:false,style:{version:8,sources:{osm:{type:"raster",tiles:[process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}},layers:[{id:"base",type:"raster",source:"osm",paint:{"raster-saturation":-0.62,"raster-contrast":-0.12}}]}});
        map.current=m;m.addControl(new libre.NavigationControl({showCompass:false}),"top-right");m.addControl(new libre.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false}),"top-right");m.addControl(new libre.AttributionControl({compact:false}),"bottom-right");m.addControl(new libre.ScaleControl(),"bottom-left");
        const bounds=()=>{const b=m.getBounds();callbacks.current.onBoundsChange?.({west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()});};
        m.on("moveend",bounds);m.on("load",()=>{setReady(true);bounds();});m.on("error",()=>setError("底图暂时无法加载，请检查网络。优惠列表仍可使用。"));m.on("sourcedata",()=>{if(m.isSourceLoaded("osm"))setError("");});m.on("webglcontextlost",()=>setError("地图显示已中断，请刷新页面。"));
      }catch{map.current?.remove();map.current=null;setFallback(true);}
    }).catch(()=>setError("地图组件加载失败，请刷新重试。"));
    return()=>{disposed=true;markers.current.forEach(m=>m.remove());map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready || !map.current)return;let disposed=false;
    import("maplibre-gl").then(({default:libre})=>{
      if(disposed || !map.current)return;markers.current.forEach(m=>m.remove());
      markers.current=deals.map(d=>{const el=document.createElement("button");el.type="button";el.className="deal-pin"+(d.id===selectedId?" selected":"");el.textContent=d.discountPercent?`${d.discountPercent}%`:(d.price!==undefined?`$${d.price}`:"优惠");el.setAttribute("aria-label",`${d.restaurantName}：${d.title}`);el.setAttribute("aria-pressed",String(d.id===selectedId));el.addEventListener("click",()=>callbacks.current.onSelect(d.id));return new libre.Marker({element:el,anchor:"bottom"}).setLngLat([d.longitude,d.latitude]).addTo(map.current!);});
    });return()=>{disposed=true;};
  },[deals,selectedId,ready]);
  const latestDeals=useRef(deals);latestDeals.current=deals;
  useEffect(()=>{const d=latestDeals.current.find(d=>d.id===selectedId);if(d && ready && map.current)map.current.flyTo({center:[d.longitude,d.latitude],zoom:Math.max(map.current.getZoom(),14),speed:1.5,essential:false});},[selectedId,ready]);
  useEffect(()=>{if(!ready || !map.current || !latestDeals.current.length)return;const ds=latestDeals.current,lngs=ds.map(d=>d.longitude),lats=ds.map(d=>d.latitude);map.current.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:70,maxZoom:13.5,duration:600});},[fitKey,ready]);
  if(fallback)return <RasterMap deals={deals} selectedId={selectedId} onSelect={onSelect} onBoundsChange={onBoundsChange} fitKey={fitKey}/>;
  return <><div ref={container} className="map-canvas" aria-label="餐厅优惠交互地图"/>{!ready&&!error&&<div className="map-loading" role="status">正在加载地图…</div>}{error&&<div className="map-error" role="status">{error}<button onClick={()=>window.location.reload()}>重新加载</button></div>}</>;
}
