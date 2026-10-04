"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as LibreMap,Marker} from "maplibre-gl";
import type {DealMapProps} from "./types";
import {makePin} from "./markers";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
type Props=DealMapProps & {tileUrl:string;tileAttribution:string;initialCenter:[number,number];initialZoom:number;onUnsupported?:()=>void};
export function MapLibreView(props:Props){
  const container=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),markers=useRef<Marker[]>([]);
  const latest=useRef(props);latest.current=props;
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let disposed=false;let observer:ResizeObserver|undefined;
    const report=(message:string)=>{if(!disposed){setError(message);latest.current.onError?.(message);}};
    import("maplibre-gl").then(L=>{
      if(disposed||!container.current)return;
      try{
        L.setWorkerUrl(workerUrl);
        const m=new L.Map({container:container.current,center:latest.current.initialCenter,zoom:latest.current.initialZoom,minZoom:2,maxZoom:18,attributionControl:false,renderWorldCopies:true,style:{version:8,sources:{basemap:{type:"raster",tiles:[latest.current.tileUrl],tileSize:256,attribution:latest.current.tileAttribution}},layers:[{id:"basemap",type:"raster",source:"basemap"}]}});map.current=m;
        m.addControl(new L.NavigationControl({showCompass:false}),"top-right");m.addControl(new L.AttributionControl({compact:false}),"bottom-right");m.addControl(new L.ScaleControl({unit:"metric"}),"bottom-left");
        if(latest.current.showLocateControl){const locate=new L.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false});locate.on("error",()=>report("Location is unavailable. Check permission or move the map manually."));m.addControl(locate,"top-right");}
        const emit=()=>{const b=m.getBounds(),c=m.getCenter();latest.current.onViewportChange?.({west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth(),center:[c.lng,c.lat],zoom:m.getZoom()});};
        m.on("moveend",emit);m.on("load",()=>{if(!disposed){setReady(true);emit();latest.current.onReady?.("maplibre");}});
        m.on("error",()=>report("Some map tiles could not load. Check your connection or tile provider."));
        m.on("sourcedata",()=>{if(!disposed&&m.isSourceLoaded("basemap"))setError("");});
        m.on("webglcontextlost",()=>report("Map rendering was interrupted. Reload to continue."));
        observer=new ResizeObserver(()=>m.resize());observer.observe(container.current);
      }catch{try{map.current?.remove();}catch{}map.current=null;if(latest.current.onUnsupported)latest.current.onUnsupported();else report("WebGL is unavailable. Use engine=\"auto\" or engine=\"raster\".");}
    }).catch(()=>report("The map renderer could not load. Please reload."));
    return()=>{disposed=true;observer?.disconnect();markers.current.forEach(m=>m.remove());map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready)return;let disposed=false;
    import("maplibre-gl").then(L=>{
      if(disposed||!map.current)return;markers.current.forEach(m=>m.remove());
      markers.current=props.deals.map(d=>new L.Marker({element:makePin(d,d.id===props.selectedId,()=>latest.current.onSelect?.(d)),anchor:"bottom"}).setLngLat([d.longitude,d.latitude]).addTo(map.current!));
    });return()=>{disposed=true;};
  },[props.deals,props.selectedId,ready]);
  useEffect(()=>{const d=latest.current.deals.find(d=>d.id===props.selectedId);if(ready&&d&&map.current)map.current.flyTo({center:[d.longitude,d.latitude],zoom:Math.max(14,map.current.getZoom()),essential:false});},[props.selectedId,ready]);
  const fit=()=>{const ds=latest.current.deals;if(!map.current||!ds.length)return;const lons=ds.map(d=>d.longitude),lats=ds.map(d=>d.latitude);map.current.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding:55,maxZoom:14,duration:500});};
  const fitted=useRef(false),previousFitKey=useRef(props.fitKey);
  useEffect(()=>{if(!ready)return;const changed=previousFitKey.current!==props.fitKey;previousFitKey.current=props.fitKey;if(changed||(!fitted.current&&props.fitOnLoad!==false&&props.deals.length)){fit();fitted.current=true;}},[ready,props.fitKey,props.deals]);
  return <><div ref={container} className="bitemap-canvas"/><button className="bitemap-fit" onClick={fit} disabled={!props.deals.length}>Show all deals</button>{!ready&&!error&&<div className="bitemap-status" role="status">Loading map…</div>}{error&&<div className="bitemap-error" role="status">{error}</div>}</>;
}

