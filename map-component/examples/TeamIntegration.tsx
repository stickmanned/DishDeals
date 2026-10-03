"use client";
import {useMemo,useState} from "react";
import {DealMap,isDealInViewport,parseMapDeals,type MapDeal,type MapViewport} from "@restaurant-deals/map";
/** Pass the result of your teammate's Convex query or existing API here. */
export function TeamIntegration({dealRecords}:{dealRecords:unknown[]}){
  const deals=useMemo(()=>parseMapDeals(dealRecords),[dealRecords]);
  const [selected,setSelected]=useState<MapDeal|null>(null);
  const [viewport,setViewport]=useState<MapViewport|null>(null);
  const visible=viewport?deals.filter(deal=>isDealInViewport(deal,viewport)):deals;
  return <section>
    <div style={{height:480}}><DealMap deals={deals} selectedId={selected?.id??null} onSelect={setSelected} onViewportChange={setViewport}/></div>
    <p>{visible.length} deals in the current map area</p>
    {selected&&<div>{selected.restaurantName}: {selected.title}</div>}
  </section>;
}
