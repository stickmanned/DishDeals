import type {MapDeal,DraftLocation} from "./types";
const pinRecords=new WeakMap<HTMLElement,string>();
export function pinMatches(element:HTMLElement|undefined,deal:MapDeal){return !!element&&pinRecords.get(element)===JSON.stringify(deal);}
export function makePin(deal:MapDeal,selected:boolean,onSelect:()=>void):HTMLButtonElement{
  const button=document.createElement("button");button.type="button";
  button.className="bitemap-pin"+(selected?" bitemap-pin-selected":"");
  const icon=document.createElementNS("http://www.w3.org/2000/svg","svg");icon.setAttribute("viewBox","0 0 34 44");icon.setAttribute("aria-hidden","true");icon.classList.add("bitemap-pin-icon");
  // Static icon markup only; restaurant text is assigned with textContent below.
  icon.innerHTML='<path class="bitemap-pin-shape" d="M17 1C8.2 1 1 8.2 1 17c0 11 16 26 16 26s16-15 16-26C33 8.2 25.8 1 17 1Z"/><g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9v7c0 2 5 2 5 0V9m-2.5 0v18m10-18c-4 0-5 10-1 10h1V9Zm0 10v8"/></g>';
  button.appendChild(icon);
  const label=document.createElement("span");label.className="bitemap-pin-label";label.textContent=deal.restaurantName;button.appendChild(label);
  button.dataset.dealId=deal.id;button.title=`${deal.restaurantName} · ${deal.title}`;
  pinRecords.set(button,JSON.stringify(deal));
  button.setAttribute("aria-label",`${deal.restaurantName}: ${deal.title}${deal.isDemo?" (demo)":""}`);
  button.setAttribute("aria-pressed",String(selected));
  button.addEventListener("click",(e)=>{e.stopPropagation();onSelect();});
  return button;
}
export function makeDraftPin(draft:DraftLocation):HTMLDivElement{
  const div=document.createElement("div");
  const confirmed=!!draft.confirmed;
  div.className="bitemap-draft-pin"+(confirmed?" bitemap-draft-pin-confirmed":" bitemap-draft-pin-proposed");
  const icon=document.createElementNS("http://www.w3.org/2000/svg","svg");icon.setAttribute("viewBox","0 0 34 44");icon.setAttribute("aria-hidden","true");icon.classList.add("bitemap-pin-icon");
  icon.innerHTML='<path class="bitemap-pin-shape" d="M17 1C8.2 1 1 8.2 1 17c0 11 16 26 16 26s16-15 16-26C33 8.2 25.8 1 17 1Z"/><circle cx="17" cy="17" r="6" fill="#fff"/>';
  div.appendChild(icon);
  if(draft.label){
    const label=document.createElement("span");label.className="bitemap-pin-label";label.textContent=draft.label;
    div.appendChild(label);
  }
  div.title=confirmed?"Confirmed location":"Proposed location (drag to adjust)";
  div.setAttribute("aria-label",confirmed?`Confirmed location: ${draft.label??""}`:`Proposed location: ${draft.label??""}`);
  div.addEventListener("click",(e)=>{e.stopPropagation();});
  return div;
}
