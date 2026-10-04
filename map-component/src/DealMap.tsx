"use client";
import {useMemo,useState} from "react";
import {MapLibreView} from "./MapLibreView";
import {RasterView} from "./RasterView";
import {parseMapDeals,DEFAULT_TILE_URL,DEFAULT_ATTRIBUTION} from "./data";
import type {DealMapProps,MapDeal} from "./types";
import "./styles.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "leaflet/dist/leaflet.css";
export function DealMap(props:DealMapProps){
  const {engine="auto",selectedId,initialCenter=[-123.117,49.278],initialZoom=12,deals}=props;
  const validDeals=useMemo(()=>parseMapDeals(deals),[deals]);
  const [fallback,setFallback]=useState(false),[localSelection,setLocalSelection]=useState<string|null>(null);
  const select=(deal:MapDeal)=>{if(selectedId===undefined)setLocalSelection(deal.id);props.onSelect?.(deal);};
  const resolvedSelection=selectedId===undefined?localSelection:selectedId;
  const activeId=validDeals.some(d=>d.id===resolvedSelection)?resolvedSelection:null;
  const actualEngine=engine==="raster"||(engine==="auto"&&fallback)?"raster":"maplibre";
  const coreProps={...props,deals:validDeals,selectedId:activeId,onSelect:select,initialCenter,initialZoom,tileUrl:props.tileUrl??DEFAULT_TILE_URL,tileAttribution:props.tileAttribution??DEFAULT_ATTRIBUTION};
  const configKey=JSON.stringify([coreProps.tileUrl,coreProps.tileAttribution,engine]);
  return <div className={`bitemap ${props.className??""}`} style={props.style} role="region" aria-label={props.ariaLabel??"Restaurant deals map"}>
    {actualEngine==="raster"?<RasterView key={configKey} {...coreProps}/>:<MapLibreView key={configKey} {...coreProps} onUnsupported={engine==="auto"?()=>setFallback(true):undefined}/>}
  </div>;
}
