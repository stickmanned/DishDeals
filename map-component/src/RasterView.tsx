"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as RasterMap,Marker} from "leaflet";
import type {DealMapProps} from "./types";
import {makePin} from "./markers";
type Props=DealMapProps & {tileUrl:string;tileAttribution:string;initialCenter:[number,number];initialZoom:number};
export function RasterView(props:Props){
  const container=useRef<HTMLDivElement>(null),map=useRef<RasterMap|null>(null),markers=useRef<Marker[]>([]);
  const latest=useRef(props);latest.current=props;
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let disposed=false;let observer:ResizeObserver|undefined;
    const report=(message:string)=>{if(!disposed){setError(message);latest.current.onError?.(message);}};
    import("leaflet").then(L=>{
      if(disposed||!container.current)return;
      const p=latest.current,m=L.map(container.current,{zoomControl:false,minZoom:2,maxZoom:18}).setView([p.initialCenter[1],p.initialCenter[0]],p.initialZoom);map.current=m;
      L.tileLayer(p.tileUrl,{maxZoom:19,attribution:p.tileAttribution}).on("tileerror",()=>report("Some map tiles could not load. Check your connection or tile provider.")).on("tileload",()=>{if(!disposed)setError("");}).addTo(m);
      L.control.zoom({position:"topright",zoomInTitle:"Zoom in",zoomOutTitle:"Zoom out"}).addTo(m);L.control.scale({imperial:false}).addTo(m);m.attributionControl.setPrefix(false);
      const emit=()=>{const b=m.getBounds(),c=m.getCenter();latest.current.onViewportChange?.({west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth(),center:[c.lng,c.lat],zoom:m.getZoom()});};
      m.on("moveend",emit);m.on("locationerror",()=>report("Location is unavailable. Check permission or move the map manually."));
      observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(container.current);setReady(true);emit();latest.current.onReady?.("raster");
    }).catch(()=>report("The map renderer could not load. Please reload."));
    return()=>{disposed=true;observer?.disconnect();markers.current.forEach(m=>m.remove());map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready)return;let disposed=false;
    import("leaflet").then(L=>{
      if(disposed||!map.current)return;markers.current.forEach(m=>m.remove());
      markers.current=props.deals.map(d=>L.marker([d.latitude,d.longitude],{keyboard:false,icon:L.divIcon({html:makePin(d,d.id===props.selectedId,()=>latest.current.onSelect?.(d)),className:"bitemap-marker",iconSize:[60,36],iconAnchor:[30,42]})}).addTo(map.current!));
    });return()=>{disposed=true;};
  },[props.deals,props.selectedId,ready]);
  useEffect(()=>{const d=latest.current.deals.find(d=>d.id===props.selectedId);if(ready&&d&&map.current)map.current.flyTo([d.latitude,d.longitude],Math.max(14,map.current.getZoom()),{duration:.5});},[props.selectedId,ready]);
  const fit=()=>{if(map.current&&latest.current.deals.length)map.current.fitBounds(latest.current.deals.map(d=>[d.latitude,d.longitude] as [number,number]),{padding:[55,55],maxZoom:14,animate:true});};
  const fitted=useRef(false),previousFitKey=useRef(props.fitKey);
  useEffect(()=>{if(!ready)return;const changed=previousFitKey.current!==props.fitKey;previousFitKey.current=props.fitKey;if(changed||(!fitted.current&&props.fitOnLoad!==false&&props.deals.length)){fit();fitted.current=true;}},[ready,props.fitKey,props.deals]);
  return <><div ref={container} className="bitemap-canvas"/><button className="bitemap-fit" onClick={fit} disabled={!props.deals.length}>Show all deals</button>{props.showLocateControl&&<button className="bitemap-locate" aria-label="Find my location" onClick={()=>{setError("");map.current?.locate({setView:true,maxZoom:14});}}>◎</button>}{!ready&&!error&&<div className="bitemap-status" role="status">Loading map…</div>}{error&&<div className="bitemap-error" role="status">{error}</div>}</>;
}
