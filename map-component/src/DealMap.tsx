"use client";
import {useMemo,useState} from "react";
import {MapLibreView} from "./MapLibreView";
import {RasterView} from "./RasterView";
import {DealCard} from "./DealCard";
import {MapIcon} from "./MapIcon";
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
  const activeDeal=validDeals.find(d=>d.id===activeId);
  const actualEngine=engine==="raster"||(engine==="auto"&&fallback)?"raster":"maplibre";
  const coreProps={...props,deals:validDeals,selectedId:activeId,onSelect:select,initialCenter,initialZoom,tileUrl:props.tileUrl??DEFAULT_TILE_URL,tileAttribution:props.tileAttribution??DEFAULT_ATTRIBUTION};
  const configKey=JSON.stringify([coreProps.tileUrl,coreProps.tileAttribution,engine,props.mapStyleUrl,props.tileUrl===undefined]);
  return <div className={`bitemap ${activeDeal&&props.showDealCard!==false?"bitemap-has-card ":""}${props.className??""}`} style={props.style} role="region" aria-label={props.ariaLabel??"Restaurant deals map"}>
    {actualEngine==="raster"?<RasterView key={configKey} {...coreProps}/>:<MapLibreView key={configKey} {...coreProps} useVectorBasemap={props.tileUrl===undefined} onUnsupported={engine==="auto"?()=>setFallback(true):undefined}/>}
    <div className="bitemap-context"><span className="bitemap-context-icon"><MapIcon name="pin" width="28" height="28"/></span><div><strong>Restaurant deals</strong><span>{validDeals.length} {validDeals.length===1?"offer":"offers"} on the map</span></div></div>
    {!validDeals.length&&<div className="bitemap-empty" role="status"><MapIcon name="pin" width="30" height="30"/><strong>No deals to show yet</strong><span>Offers will appear here when your app adds them.</span></div>}
    {activeDeal&&props.showDealCard!==false?<DealCard deal={activeDeal}/>:null}
  </div>;
}
