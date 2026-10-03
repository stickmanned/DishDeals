"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowUpRight,Clock,Coffee,ExternalLink,MapPin,RotateCcw,Search,UtensilsCrossed,X} from "lucide-react";
import DealMap,{type MapBounds} from "./DealMap";
import {demoDeals,validateDeals,type Cuisine,type Deal} from "../lib/deals";

export type DealExplorerProps={deals?:Deal[];isDemo?:boolean;loading?:boolean;error?:string};
const cities=["全部地区","Vancouver","Richmond","Burnaby"];
const cuisines: Array<Cuisine|"全部">=["全部","日料","中餐","咖啡","西餐"];
const inside=(d:Deal,b:MapBounds)=>d.latitude>=b.south&&d.latitude<=b.north&&d.longitude>=b.west&&d.longitude<=b.east;

/** Drop-in map surface. Pass live Convex query results through deals. */
export function DealExplorer({deals=demoDeals,isDemo=true,loading=false,error=""}:DealExplorerProps){
  const [query,setQuery]=useState(""),[city,setCity]=useState("全部地区"),[cuisine,setCuisine]=useState<Cuisine|"全部">("全部");
  const [sort,setSort]=useState("recommended"),[budget,setBudget]=useState(false),[inView,setInView]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null),[bounds,setBounds]=useState<MapBounds|null>(null),[fitVersion,setFitVersion]=useState(0);
  const candidates=useMemo(()=>deals.filter(d=>(city==="全部地区"||d.city===city)&&(cuisine==="全部"||d.cuisine===cuisine)&&(!budget||(d.currency??"CAD")==="CAD"&&d.price!==undefined&&d.price<=15)&&`${d.restaurantName} ${d.title} ${d.address} ${d.city} ${d.cuisine}`.toLowerCase().includes(query.trim().toLowerCase())),[deals,city,cuisine,budget,query]);
  const filtered=useMemo(()=>{const ds=candidates.filter(d=>!inView||!bounds||inside(d,bounds));return sort==="price"?[...ds].sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)):sort==="discount"?[...ds].sort((a,b)=>(b.discountPercent??0)-(a.discountPercent??0)):ds;},[candidates,inView,bounds,sort]);
  const selected=candidates.find(d=>d.id===selectedId);
  useEffect(()=>{if(selectedId&&!candidates.some(d=>d.id===selectedId))setSelectedId(null);},[candidates,selectedId]);
  useEffect(()=>{if(selectedId)document.getElementById(`card-${selectedId}`)?.scrollIntoView({block:"nearest",behavior:"smooth"});},[selectedId]);
  const reset=()=>{setQuery("");setCity("全部地区");setCuisine("全部");setBudget(false);setInView(false);setSort("recommended");setSelectedId(null);setFitVersion(v=>v+1);};
  const toolData=useRef({deals:filtered,isDemo});toolData.current={deals:filtered,isDemo};
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,opts:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;const lifecycle=new AbortController();
    try{Promise.resolve(context.registerTool({name:"list_visible_deals",description:"Read the restaurant deals currently shown in the list, respecting search and map filters. Demo data is explicitly marked.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(input:unknown)=>{if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw new Error("Expected an empty object.");return {isDemo:toolData.current.isDemo,deals:toolData.current.deals};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
    return()=>lifecycle.abort();
  },[]);
  return <main className="explorer">
    <header className="app-header"><a className="brand" href="/" aria-label="BiteMap 首页"><span className="brand-icon"><UtensilsCrossed size={22}/></span>BiteMap<span className="brand-caption">好吃，也划算。</span></a><div className="header-right"><span className="region"><MapPin size={15}/>Metro Vancouver</span><span className="demo-badge">{isDemo?"示例预览":"餐厅优惠"}</span></div></header>
    <div className="workspace"><aside className="sidebar"><div className="sidebar-head"><div className="eyebrow">FIND YOUR NEXT BITE</div><h1>下一顿，<br/>吃点划算的。</h1><p>在地图上，发现附近的餐厅优惠。</p>
      <label className="search-box"><Search size={18}/><input value={query} onChange={e=>{setQuery(e.target.value);setSelectedId(null);}} placeholder="搜索餐厅、优惠或地区" aria-label="搜索餐厅、优惠或地区"/>{query&&<button onClick={()=>setQuery("")} aria-label="清除搜索"><X size={16}/></button>}</label>
      <div className="filter-row"><label className="city-select"><MapPin size={13}/><select aria-label="地区" value={city} onChange={e=>{setCity(e.target.value);setInView(false);setSelectedId(null);setFitVersion(v=>v+1);}}>{cities.map(c=><option key={c}>{c}</option>)}</select></label><button className={"budget-filter "+(budget?"chosen":"")} aria-pressed={budget} onClick={()=>setBudget(!budget)}>CAD $15 以内</button></div>
      <div className="cuisine-tabs" aria-label="餐厅分类">{cuisines.map(c=><button key={c} aria-pressed={cuisine===c} className={cuisine===c?"chosen":""} onClick={()=>setCuisine(c)}>{c}</button>)}</div>
      <div className="results-heading"><span aria-live="polite"><strong>{filtered.length}</strong> 个优惠等你发现</span><select aria-label="排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">默认排序</option><option value="price">价格从低到高</option><option value="discount">折扣从高到低</option></select></div>
    </div>
    <div className="deal-list" aria-label="餐厅优惠列表">{loading&&<div className="empty-state" role="status">正在获取优惠…</div>}{error&&<div className="data-error" role="status">{error}</div>}{filtered.map(d=><button id={`card-${d.id}`} key={d.id} className={"deal-card "+(selectedId===d.id?"active":"")} aria-pressed={selectedId===d.id} onClick={()=>setSelectedId(d.id)}><div className={"food-art "+d.cuisine}>{d.cuisine==="咖啡"?<Coffee size={27}/>:<UtensilsCrossed size={27}/>}<span>{d.cuisine}</span></div><div className="card-copy"><div className="restaurant">{d.restaurantName}</div><h2>{d.title}</h2><p><MapPin size={11}/>{d.city}</p><div className="card-bottom">{d.discountPercent!==undefined?<span className="discount">省 {d.discountPercent}%</span>:<span className="discount">餐厅优惠</span>}{d.price!==undefined&&<span className="price">${d.price.toFixed(2)} <small>{d.currency??"CAD"} 起</small></span>}</div></div><ArrowUpRight className="card-arrow" size={16}/></button>)}{!loading&&!filtered.length&&<div className="empty-state"><Search size={27}/><h2>这里暂时没有优惠</h2><p>{inView?"试试移动地图，或取消「只看地图范围」。":"换个关键词，或者放宽一下筛选。"}</p><button onClick={reset}>重置筛选</button></div>}</div>
    <footer className="sidebar-footer"><span className="status-dot"/>{isDemo?"示例餐厅与优惠，不代表真实商家活动":"优惠信息以来源及商家公布为准"}</footer></aside>
    <section className="map-panel"><DealMap deals={candidates} selectedId={selectedId} onSelect={setSelectedId} onBoundsChange={setBounds} fitKey={`${city}-${fitVersion}`}/><div className="map-topline"><span><MapPin size={14}/>{city==="全部地区"?"大温地区":city}</span><span>拖动地图，探索下一顿</span></div>
    <div className="map-actions"><button className={inView?"chosen":""} aria-pressed={inView} onClick={()=>setInView(!inView)}>只看地图范围</button><button onClick={()=>{setInView(false);setSelectedId(null);setFitVersion(v=>v+1);}} aria-label="显示全部筛选结果"><RotateCcw size={14}/>查看全部</button></div>
    <div className="map-note"><span className="status-dot"/>{isDemo?"真实地图 · 示例优惠":"餐厅优惠地图"}</div>
    {selected&&<article className="detail-card" aria-label="优惠详情"><button className="close-detail" aria-label="关闭优惠详情" onClick={()=>setSelectedId(null)}><X size={18}/></button><div className="eyebrow">{selected.cuisine} · {selected.city}{selected.isDemo?" · 示例":""}</div><h2>{selected.restaurantName}</h2><h3>{selected.title}</h3><p>{selected.description}</p><div className="detail-line"><MapPin size={15}/>{selected.address}</div>{selected.schedule&&<div className="detail-line"><Clock size={15}/>{selected.schedule}</div>}{selected.conditions?.length&&<ul className="conditions">{selected.conditions.map((c,i)=><li key={i}>{c}</li>)}</ul>}<div className="detail-actions"><a href={`https://www.openstreetmap.org/directions?to=${selected.latitude}%2C${selected.longitude}`} target="_blank" rel="noopener noreferrer">查看路线<ArrowUpRight size={15}/></a>{selected.sourceUrl&&<a className="source-link" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">优惠来源<ExternalLink size={13}/></a>}</div></article>}
    </section></div></main>;
}

/** Optional read-only JSON endpoint adapter; no secrets or AI calls in the browser. */
export default function DealExplorerPage(){
  const endpoint=process.env.NEXT_PUBLIC_DEALS_URL;
  const [deals,setDeals]=useState<Deal[]>(endpoint?[]:demoDeals),[error,setError]=useState(""),[loading,setLoading]=useState(Boolean(endpoint));
  useEffect(()=>{
    if(!endpoint)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
    const refresh=async()=>{controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(endpoint,{signal:controller.signal});if(!response.ok)throw new Error("获取优惠失败。");const body=await response.json();const next=validateDeals(Array.isArray(body)?body:body.deals).filter(d=>!d.expiresAt||Date.parse(d.expiresAt)>Date.now());if(!stopped){setDeals(next);setError("");}}catch{if(!stopped)setError("优惠暂时无法更新，请稍后重试。");}finally{clearTimeout(timeout);if(!stopped){setLoading(false);timer=setTimeout(refresh,30000);}}};
    void refresh();return()=>{stopped=true;clearTimeout(timer);controller?.abort();};
  },[endpoint]);
  return <DealExplorer deals={deals} isDemo={!endpoint||deals.some(d=>d.isDemo)} loading={loading} error={error}/>;
}
