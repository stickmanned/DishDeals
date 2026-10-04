import type {MapDeal} from "./types";
import {MapIcon} from "./MapIcon";
export function DealCard({deal}:{deal:MapDeal}){
  const price=deal.price!==undefined?(deal.currency?`${deal.currency} ${deal.price.toFixed(2)}`:`${deal.price.toFixed(2)} · currency unknown`):null;
  return <article className="bitemap-card" aria-label="Selected restaurant offer" aria-live="polite">
    <div className="bitemap-card-heading"><div className="bitemap-card-heading-text"><h3>{deal.restaurantName}</h3><p className="bitemap-card-kicker">{deal.isDemo?"Demo restaurant":"Restaurant offer"}</p></div>{deal.discountPercent!==undefined&&<span className="bitemap-offer-badge">{deal.discountPercent}% off</span>}</div>
    <p className="bitemap-card-title">{deal.title}</p>{deal.address&&<p className="bitemap-card-address">{deal.address}</p>}
    <div className="bitemap-card-footer"><div>{price?<><span className="bitemap-price">{price}</span><span className="bitemap-card-note">Listed offer price</span></>:<span className="bitemap-card-note">Check the offer for prices and conditions</span>}</div><a className="bitemap-card-link" href={`https://www.google.com/maps/dir/?api=1&destination=${deal.latitude},${deal.longitude}`} target="_blank" rel="noopener noreferrer">Directions <MapIcon name="arrow"/></a></div>
    {deal.sourceUrl&&<a className="bitemap-source-link" href={deal.sourceUrl} target="_blank" rel="noopener noreferrer">View original offer <MapIcon name="arrow" width="14" height="14"/></a>}
  </article>;
}
