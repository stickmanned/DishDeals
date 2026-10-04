// Local verification harness only; excluded from the distributable package.
import {StrictMode,useState} from "react";
import {createRoot} from "react-dom/client";
import {DealMap,type MapDeal,type MapViewport} from "../dist/index.js";
import "../dist/map.css";
const deals:MapDeal[]=[
  {id:"demo-1",restaurantName:"Example Ramen",title:"Second bowl 50% off",latitude:49.2842,longitude:-123.1264,discountPercent:50,isDemo:true},
  {id:"demo-2",restaurantName:"Example Coffee",title:"Coffee and pastry for CAD 7",latitude:49.2744,longitude:-123.1227,price:7,currency:"CAD",isDemo:true},
  {id:"demo-3",restaurantName:"Example Kitchen",title:"20% off lunch",latitude:49.2794,longitude:-123.116,discountPercent:20,isDemo:true},
];
function Preview(){const [selected,setSelected]=useState<MapDeal|null>(null),[viewport,setViewport]=useState<MapViewport|null>(null),[count,setCount]=useState(3),[engine,setEngine]=useState(""),[raster,setRaster]=useState(false);return <><div style={{height:"calc(100dvh - 92px)"}}><DealMap engine={raster?"raster":"auto"} deals={deals.slice(0,count)} selectedId={selected?.id??null} onSelect={setSelected} onViewportChange={setViewport} onReady={setEngine}/></div><div style={{padding:"10px 16px",font:"12px Arial",lineHeight:1.8}}><span>Component preview · Demo deals · Engine: {engine}</span><br/><span aria-live="polite">Selected: {selected?`${selected.restaurantName} — ${selected.title}`:"none"} · Zoom: {viewport?.zoom.toFixed(1)??"loading"}</span> <button onClick={()=>{setCount(count===3?1:3);setSelected(null);}}>Toggle dataset</button><button onClick={()=>setSelected(deals[2])}>Select Kitchen</button><button onClick={()=>setCount(0)}>Clear dataset</button><button onClick={()=>setRaster(!raster)}>Toggle renderer</button></div></>;}
createRoot(document.getElementById("root")!).render(<StrictMode><Preview/></StrictMode>);

