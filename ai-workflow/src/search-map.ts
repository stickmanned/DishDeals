import type { Recommendation, DiscoveredRestaurant, SearchResult } from "./search-contracts";
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
// Web leads never acquire invented prices or discounts. Only verified branches get map pins.
export function toDiscoveredMapDeals(restaurants: DiscoveredRestaurant[], sources: NonNullable<SearchResult["discovery"]>["sources"]) {
  return restaurants.flatMap(r => r.place ? [{
    id: r.id, restaurantName: r.name, title: "Web discovery · No confirmed offer",
    latitude: r.place.latitude, longitude: r.place.longitude, address: r.place.address,
    sourceUrl: sources.find(s => r.sourceIds.includes(s.id))?.url,
  }] : []);
}
export function searchResultToMapDeals(result: SearchResult) {
  return [...toMapDeals(result.recommendations), ...(result.discovery ?
    toDiscoveredMapDeals(result.discovery.restaurants, result.discovery.sources) : [])];
}
