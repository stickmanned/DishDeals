"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as RasterMap,Marker} from "leaflet";
import type {DealMapProps} from "./types";
import {makePin,pinMatches} from "./markers";
import {MapIcon} from "./MapIcon";
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
      L.control.zoom({position:"bottomright",zoomInTitle:"Zoom in",zoomOutTitle:"Zoom out"}).addTo(m);L.control.scale({imperial:false}).addTo(m);m.attributionControl.setPrefix(false);
      const emit=()=>{const b=m.getBounds(),c=m.getCenter();latest.current.onViewportChange?.({west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth(),center:[c.lng,c.lat],zoom:m.getZoom()});};
      m.on("moveend",emit);m.on("locationerror",()=>report("Location is unavailable. Check permission or move the map manually."));
      observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(container.current);setReady(true);emit();latest.current.onReady?.("raster");
    }).catch(()=>report("The map renderer could not load. Please reload."));
    return()=>{disposed=true;observer?.disconnect();markers.current.forEach(m=>m.remove());map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready)return;let disposed=false;
    import("leaflet").then(L=>{
      if(disposed||!map.current)return;
      const previous=new Map(markers.current.map(marker=>[marker.getElement()?.querySelector<HTMLButtonElement>(".bitemap-pin")?.dataset.dealId,marker]));
      markers.current=props.deals.map(d=>{
        const existing=previous.get(d.id);previous.delete(d.id);
        if(existing&&pinMatches(existing.getElement()?.querySelector<HTMLButtonElement>(".bitemap-pin")??undefined,d))return existing;
        existing?.remove();
        return L.marker([d.latitude,d.longitude],{keyboard:false,icon:L.divIcon({html:makePin(d,d.id===latest.current.selectedId,()=>latest.current.onSelect?.(d)),className:"bitemap-marker",iconSize:[34,44],iconAnchor:[17,44]})}).setZIndexOffset(d.id===latest.current.selectedId?1000:0).addTo(map.current!);
      });
      previous.forEach(marker=>marker.remove());
    });return()=>{disposed=true;};
  },[props.deals,ready]);
  useEffect(()=>{markers.current.forEach(marker=>{const button=marker.getElement()?.querySelector<HTMLButtonElement>(".bitemap-pin");if(!button)return;const selected=button.dataset.dealId===props.selectedId;button.classList.toggle("bitemap-pin-selected",selected);button.setAttribute("aria-pressed",String(selected));marker.setZIndexOffset(selected?1000:0);});},[props.selectedId,props.deals,ready]);
  useEffect(()=>{const d=latest.current.deals.find(d=>d.id===props.selectedId);if(ready&&d&&map.current){const zoom=Math.max(14,map.current.getZoom());const center=container.current&&container.current.clientWidth<=480&&latest.current.showDealCard!==false?map.current.unproject(map.current.project([d.latitude,d.longitude],zoom).add([0,45]),zoom):[d.latitude,d.longitude] as [number,number];map.current.flyTo(center,zoom,{duration:.5});}},[props.selectedId,ready]);
  const fit=()=>{if(map.current&&latest.current.deals.length)map.current.fitBounds(latest.current.deals.map(d=>[d.latitude,d.longitude] as [number,number]),{padding:[55,55],maxZoom:14,animate:true});};
  const fitted=useRef(false),previousFitKey=useRef(props.fitKey);
  useEffect(()=>{if(!ready)return;const changed=previousFitKey.current!==props.fitKey;previousFitKey.current=props.fitKey;if(changed||(!fitted.current&&props.fitOnLoad!==false&&props.deals.length)){fit();fitted.current=true;}},[ready,props.fitKey,props.deals]);
  return <><div ref={container} className="bitemap-canvas"/><button type="button" className="bitemap-fit" onClick={fit} disabled={!props.deals.length}><MapIcon name="fit"/>Show all deals</button>{props.showLocateControl&&<button type="button" className="bitemap-locate" aria-label="Find my location" onClick={()=>{setError("");map.current?.locate({setView:true,maxZoom:14});}}><MapIcon name="location"/></button>}{!ready&&!error&&<div className="bitemap-status" role="status"><span className="bitemap-loading-dot"/>Loading map…</div>}{error&&<div className="bitemap-error" role="status">{error}</div>}</>;
}
