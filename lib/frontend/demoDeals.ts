import type { DealView } from "./deals";
import { demoRestaurants, type DemoCuisine, type DemoRestaurant } from "./demoRestaurants";

/**
 * Placeholder offers for the preview feed. The restaurants are real Burnaby businesses (see
 * demoRestaurants.ts) but every offer is invented for the design preview and is not an actual
 * promotion from that restaurant. Never submitted, mixed into, or labeled live.
 */
const NOT_REAL = "A placeholder offer for the preview; not a real promotion.";

type Window = { days: string[]; start: string; end: string };
const everyDay = (start: string, end: string): Window => ({ days: [], start, end });
const weekdays = (start: string, end: string): Window => ({ days: ["mon", "tue", "wed", "thu", "fri"], start, end });
const weekend = (start: string, end: string): Window => ({ days: ["sat", "sun"], start, end });

type Template = { dealText: string; detail: string; price: number; was: number; when: Window; conditions: string[] };

// Several variants per cuisine so neighbours don't all read alike. A restaurant picks one by name.
const templates: Record<DemoCuisine, Template[]> = {
  ramen: [
    { dealText: "A warm bowl. A small bill.", detail: "Miso ramen with spring onions and a soft egg", price: 9.5, was: 16, when: weekdays("11:00", "15:00"), conditions: ["Dine-in only", "One bowl per person"] },
    { dealText: "Broth after dark, for less.", detail: "Tonkotsu ramen with a marinated egg", price: 11, was: 18, when: everyDay("17:00", "21:00"), conditions: ["Dinner only"] },
    { dealText: "Ramen and gyoza, one price.", detail: "A regular ramen bowl with three gyoza", price: 13, was: 20, when: weekdays("14:00", "17:00"), conditions: ["Set meal", "Dine-in or takeout"] },
  ],
  sushi: [
    { dealText: "Your lunch break, rolled up.", detail: "A sushi set with salmon rolls and pickled ginger", price: 10.5, was: 17, when: weekdays("11:00", "15:00"), conditions: ["Takeout or dine-in", "Weekdays only"] },
    { dealText: "Half-price rolls at happy hour.", detail: "Select rolls at half price", price: 6, was: 12, when: weekdays("15:00", "17:30"), conditions: ["Selected rolls", "Dine-in only"] },
    { dealText: "Sashimi night, kinder prices.", detail: "Eight-piece sashimi plate", price: 14, was: 22, when: everyDay("17:00", "21:30"), conditions: ["While supplies last"] },
  ],
  pizza: [
    { dealText: "Two slices, one happy lunch.", detail: "Two slices of cheese pizza and a can of pop", price: 7, was: 11, when: everyDay("11:00", "16:00"), conditions: ["Selected slices", "While supplies last"] },
    { dealText: "A whole pie, a small ask.", detail: "A 12-inch pepperoni pizza", price: 12, was: 19, when: weekdays("16:00", "21:00"), conditions: ["Pickup only"] },
    { dealText: "Slice night.", detail: "A slice and a salad", price: 8, was: 13, when: everyDay("17:00", "22:00"), conditions: ["Dine-in or takeout"] },
  ],
  burger: [
    { dealText: "A proper burger, pocket change.", detail: "A classic burger with crisp lettuce and a toasted bun", price: 9, was: 15, when: weekdays("11:00", "16:00"), conditions: ["Burger only", "Add-ons extra"] },
    { dealText: "Burger and fries, sorted.", detail: "A cheeseburger with a side of fries", price: 11, was: 17, when: everyDay("11:00", "21:00"), conditions: ["Dine-in or takeout"] },
  ],
  mexican: [
    { dealText: "Big flavour. Little price.", detail: "Two tacos with crisp vegetables, lime, and salsa", price: 7, was: 12, when: weekdays("11:00", "17:00"), conditions: ["Choice of filling", "Dine-in or takeout"] },
    { dealText: "Burrito Tuesday, every day.", detail: "A burrito with rice, beans, and your choice of filling", price: 9, was: 14, when: everyDay("11:00", "20:00"), conditions: ["Regular size only"] },
  ],
  tea: [
    { dealText: "Cold, sweet, and under six.", detail: "A signature milk tea with pearls", price: 5.5, was: 7.5, when: everyDay("12:00", "21:00"), conditions: ["Regular size", "Extra toppings cost more"] },
    { dealText: "Second cup half price.", detail: "Buy one fruit tea, get the second half off", price: 6, was: 8, when: weekdays("14:00", "18:00"), conditions: ["Same-visit purchase"] },
  ],
  coffee: [
    { dealText: "A little pick-me-up for less.", detail: "A freshly brewed latte for your next study break", price: 3.75, was: 6, when: weekdays("07:00", "11:00"), conditions: ["Regular size", "Dairy alternatives extra"] },
    { dealText: "Coffee and a bite.", detail: "A drip coffee and a muffin", price: 5, was: 8, when: everyDay("07:00", "12:00"), conditions: ["Muffin of the day"] },
    { dealText: "Weekend brunch, gently priced.", detail: "Eggs on toast with a coffee", price: 11, was: 16, when: weekend("09:00", "14:00"), conditions: ["Weekends only"] },
  ],
  bakery: [
    { dealText: "Fresh from the oven, easier on the wallet.", detail: "Any two pastries from the morning bake", price: 5.5, was: 8.5, when: everyDay("08:00", "12:00"), conditions: ["Morning bake only", "While supplies last"] },
    { dealText: "End-of-day box.", detail: "A mixed box of four pastries", price: 8, was: 14, when: everyDay("17:00", "19:00"), conditions: ["Selection varies"] },
  ],
  bbq: [
    { dealText: "Fire, smoke, and a fair price.", detail: "Two grilled meats with rice and banchan", price: 17, was: 26, when: weekdays("11:30", "15:00"), conditions: ["Lunch set", "Dine-in only"] },
    { dealText: "Late-night grill special.", detail: "A pork belly set for two", price: 32, was: 46, when: everyDay("21:00", "01:00"), conditions: ["Dine-in only", "Two people minimum"] },
  ],
  chinese: [
    { dealText: "Dim sum, three plates in.", detail: "Three steamer baskets of your pick", price: 14, was: 21, when: weekend("10:00", "14:00"), conditions: ["Weekends only", "Dine-in only"] },
    { dealText: "Noodles for the lunch crowd.", detail: "A bowl of noodles with a drink", price: 10, was: 15, when: weekdays("11:00", "15:00"), conditions: ["Choice of broth", "One per person"] },
    { dealText: "Family dinner, simpler maths.", detail: "A four-dish dinner set for two", price: 34, was: 52, when: everyDay("17:00", "21:30"), conditions: ["Set menu", "Dine-in only"] },
  ],
  viet: [
    { dealText: "A steaming bowl, a small price.", detail: "A regular beef pho with a Vietnamese iced coffee", price: 12, was: 17, when: weekdays("11:00", "16:00"), conditions: ["Regular size", "One per person"] },
    { dealText: "Banh mi and a drink.", detail: "A grilled pork banh mi and a can of pop", price: 8.5, was: 12, when: everyDay("11:00", "17:00"), conditions: ["Takeout or dine-in"] },
  ],
  indian: [
    { dealText: "Thali time, thoughtfully priced.", detail: "A thali with two curries, rice, naan, and dessert", price: 13, was: 19, when: weekdays("11:30", "15:00"), conditions: ["Lunch only", "Vegetarian option available"] },
    { dealText: "Dosa for dinner.", detail: "A crisp masala dosa with sambar and chutneys", price: 9.5, was: 14, when: everyDay("17:00", "21:00"), conditions: ["Dine-in or takeout"] },
  ],
  mediterranean: [
    { dealText: "A plate of sunshine.", detail: "A chicken souvlaki plate with rice, salad, and pita", price: 12, was: 18, when: weekdays("11:00", "16:00"), conditions: ["Lunch only"] },
    { dealText: "Wraps and a drink.", detail: "A shawarma wrap with a drink", price: 9, was: 13, when: everyDay("11:00", "20:00"), conditions: ["Regular size"] },
  ],
  chicken: [
    { dealText: "Crispy for less.", detail: "Four pieces of fried chicken with a side", price: 12, was: 18, when: everyDay("11:30", "20:00"), conditions: ["Dine-in or takeout"] },
    { dealText: "Half a bird, a short bill.", detail: "A half flame-grilled chicken with a side", price: 13, was: 19, when: weekdays("11:00", "15:00"), conditions: ["Lunch only"] },
  ],
  sandwich: [
    { dealText: "Footlong, short price.", detail: "A footlong sub with a drink", price: 9.5, was: 14, when: everyDay("11:00", "20:00"), conditions: ["Selected subs"] },
    { dealText: "Lunch combo, no fuss.", detail: "A sandwich, chips, and a cookie", price: 8, was: 12, when: weekdays("11:00", "15:00"), conditions: ["Regular size"] },
  ],
  diner: [
    { dealText: "Comfort food, cheaper.", detail: "A hearty breakfast of eggs, bacon, and toast", price: 9, was: 14, when: everyDay("07:00", "11:30"), conditions: ["Until 11:30 am"] },
    { dealText: "Daily special, plated.", detail: "The daily special with soup", price: 12, was: 17, when: weekdays("11:00", "15:00"), conditions: ["Menu changes daily"] },
  ],
  finedining: [
    { dealText: "Afternoon tea, gently priced.", detail: "A tea service with sandwiches and sweets", price: 28, was: 42, when: weekend("13:00", "16:00"), conditions: ["Reservation recommended", "Weekends only"] },
    { dealText: "Prix fixe, thoughtfully priced.", detail: "A three-course prix fixe menu", price: 38, was: 55, when: weekdays("17:00", "20:30"), conditions: ["Dine-in only"] },
  ],
};

type Photo = { url: string; alt: string };
// Only cuisines with a matching stock photo get one; the rest use the card's neutral placeholder.
const photos: Partial<Record<DemoCuisine, Photo>> = {
  ramen: { url: "/images/ramen.jpg", alt: "A bowl of ramen with egg and spring onions" },
  sushi: { url: "/images/sushi.jpg", alt: "A sushi set with salmon rolls and pickled ginger" },
  pizza: { url: "/images/pizza.jpg", alt: "Golden cheese pizza slices topped with basil" },
  burger: { url: "/images/burger.jpg", alt: "A burger with a toasted bun, lettuce, and tomato" },
  mexican: { url: "/images/tacos.jpg", alt: "Two tacos with fresh vegetables, coriander, and lime" },
  coffee: { url: "/images/coffee.jpg", alt: "A latte with leaf-shaped foam art in a ceramic cup" },
};

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const slug = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function build(restaurant: DemoRestaurant, index: number): DealView {
  const seed = hash(restaurant.name);
  const choices = templates[restaurant.cuisine];
  const t = choices[seed % choices.length];
  const photo = photos[restaurant.cuisine];
  const expiry = seed % 11 === 0 ? { expiresOn: "2026-09-30" } : seed % 5 === 0 ? { expiresOn: "2026-12-31" } : {};
  return {
    id: `demo-${slug(restaurant.name)}`,
    restaurant: restaurant.name,
    dealText: t.dealText,
    description: `${t.detail}. ${NOT_REAL}`,
    priceCad: t.price,
    originalPrice: t.was,
    currency: "CAD",
    address: `${restaurant.address}, Burnaby`,
    lat: restaurant.lat,
    lng: restaurant.lng,
    validDays: t.when.days,
    validStart: t.when.start,
    validEnd: t.when.end,
    ...expiry,
    conditions: t.conditions,
    createdAt: demoRestaurants.length - index,
    ...(photo ? { imageUrl: photo.url, imageAlt: photo.alt } : {}),
    authorName: "Sample community",
    stillOnCount: 2 + ((seed >>> 4) % 23),
    expiredCount: (seed >>> 9) % 3 === 0 ? 1 : 0,
    isDemo: true,
  };
}

export const demoDeals: DealView[] = demoRestaurants.map(build);

/**
 * A few of the placeholder deals recast as the signed-in preview user's own posts, so Profile,
 * author controls and Discover have something to show. They are copies with distinct ids.
 */
export function previewSeedPosts(authorName: string): DealView[] {
  const picks = ["Kinton Ramen Gilmore", "Waves Coffee House", "Pho 24", "La Taqueria Pinche Taco Shop"];
  return picks.flatMap((name, i) => {
    const source = demoDeals.find((d) => d.restaurant === name);
    return source
      ? [{ ...source, id: `mine-${slug(name)}`, authorName, createdAt: 1000 - i, stillOnCount: 3 + i, expiredCount: 0 }]
      : [];
  });
}
