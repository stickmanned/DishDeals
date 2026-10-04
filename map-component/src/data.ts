import type {MapDeal,MapViewport} from "./types";
export const DEFAULT_TILE_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_ATTRIBUTION='© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
/** Fail early on invalid feed data instead of silently inventing a location. */
export function parseMapDeals(input:unknown):MapDeal[]{
  if(!Array.isArray(input))throw new Error("Expected an array of deals.");
  const ids=new Set<string>();
  return input.map((row,index)=>{
    const fail=(message:string):never=>{throw new Error(`Deal ${index+1}: ${message}`);};
    if(!row||typeof row!=="object")return fail("expected an object.");
    const d=row as Record<string,unknown>;
    for(const k of ["id","restaurantName","title"])if(typeof d[k]!=="string"||!(d[k] as string).trim())fail(`${k} must be a non-empty string.`);
    if(ids.has(d.id as string))fail("id must be unique.");ids.add(d.id as string);
    if(typeof d.latitude!=="number"||!Number.isFinite(d.latitude)||Math.abs(d.latitude)>85.05112878)fail("latitude must be within the Web Mercator range (-85.05112878 to 85.05112878).");
    if(typeof d.longitude!=="number"||!Number.isFinite(d.longitude)||Math.abs(d.longitude)>180)fail("longitude must be between -180 and 180.");
    for(const k of ["price","discountPercent"])if(d[k]!==undefined&&(typeof d[k]!=="number"||!Number.isFinite(d[k])||(d[k] as number)<0))fail(`${k} must be a finite, non-negative number.`);
    if(typeof d.discountPercent==="number"&&d.discountPercent>100)fail("discountPercent cannot exceed 100.");
    for(const k of ["address","currency","sourceUrl","expiresAt"])if(d[k]!==undefined&&typeof d[k]!=="string")fail(`${k} must be a string.`);
    if(d.isDemo!==undefined&&typeof d.isDemo!=="boolean")fail("isDemo must be boolean.");
    if(d.expiresAt!==undefined&&!Number.isFinite(Date.parse(d.expiresAt as string)))fail("expiresAt must be a valid date.");
    if(d.sourceUrl){let url:URL;try{url=new URL(d.sourceUrl as string);}catch{return fail("sourceUrl must be an absolute URL.");}if(!["http:","https:"].includes(url.protocol))fail("sourceUrl must use HTTP or HTTPS.");}
    const result:MapDeal={id:d.id as string,restaurantName:d.restaurantName as string,title:d.title as string,latitude:d.latitude as number,longitude:d.longitude as number};
    for(const k of ["address","price","currency","discountPercent","sourceUrl","expiresAt","isDemo"] as const)if(d[k]!==undefined)Object.assign(result,{[k]:d[k]});
    return result;
  });
}
const wrap=(value:number)=>((value+180)%360+360)%360-180;
/** Handles a viewport crossing the antimeridian or spanning the full world. */
export function isDealInViewport(deal:MapDeal,viewport:MapViewport):boolean{
  if(deal.latitude<viewport.south||deal.latitude>viewport.north)return false;
  if(viewport.east-viewport.west>=360)return true;
  const west=wrap(viewport.west),east=wrap(viewport.east),lng=wrap(deal.longitude);
  return west<=east?lng>=west&&lng<=east:lng>=west||lng<=east;
}
