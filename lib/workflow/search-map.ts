import type { Recommendation } from "./search-contracts";
// Structurally compatible with @restaurant-deals/map's MapDeal; no React dependency.
export function toMapDeals(recommendations: Recommendation[]) {
  return recommendations.map(r => ({
    id: r.dealId, restaurantName: r.restaurant.name, title: r.deal.title,
    latitude: r.restaurant.latitude, longitude: r.restaurant.longitude, address: r.restaurant.address,
    ...(r.deal.price === null ? {} : { price: r.deal.price }),
    ...(r.deal.currency === null ? {} : { currency: r.deal.currency }),
    ...(r.deal.discountPercent === null ? {} : { discountPercent: r.deal.discountPercent }),
    ...(r.sourceUrl === null ? {} : { sourceUrl: r.sourceUrl }),
    ...(r.deal.endDate === null ? {} : { expiresAt: r.deal.endDate }),
  }));
}
