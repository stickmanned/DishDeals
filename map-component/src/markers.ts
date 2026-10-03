import type {MapDeal} from "./types";
export function makePin(deal:MapDeal,selected:boolean,onSelect:()=>void):HTMLButtonElement{
  const button=document.createElement("button");button.type="button";
  button.className="bitemap-pin"+(selected?" bitemap-pin-selected":"");
  button.textContent=deal.discountPercent!==undefined?`${deal.discountPercent}%`:(deal.price!==undefined?`${deal.currency??"CAD"} ${deal.price}`:"Deal");
  button.setAttribute("aria-label",`${deal.restaurantName}: ${deal.title}${deal.isDemo?" (demo)":""}`);
  button.setAttribute("aria-pressed",String(selected));button.addEventListener("click",onSelect);
  return button;
}
