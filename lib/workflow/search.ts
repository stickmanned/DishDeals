import { formatVancouverParts } from "../vancouverTime";
import { searchInputSchema, intentSchema, searchRecordSchema, type SearchInput, type SearchIntent,
  type SearchRecord, type SearchCandidate, type RecommendationPlan, type SearchResult, type Fact, type Recommendation } from "./search-contracts";
import { localDate } from "./workflow";
import { WorkflowError } from "./errors";
import { normalizeName } from "./geoapify";

const cuisines: [string, string[]][] = [
  ["ramen", ["拉面", "拉麵", "ramen"]], ["pizza", ["披萨", "披薩", "pizza"]],
  ["sushi", ["寿司", "壽司", "sushi"]], ["burger", ["汉堡", "漢堡", "burger"]],
  ["coffee", ["咖啡", "coffee"]], ["hot pot", ["火锅", "火鍋", "hot pot", "hotpot"]],
  ["bubble tea", ["奶茶", "bubble tea", "boba"]], ["vegetarian", ["素食", "vegetarian"]], ["vegan", ["纯素", "純素", "vegan"]],
];
const cities: [string, string[]][] = [["Richmond", ["列治文", "richmond"]], ["Vancouver", ["温哥华", "溫哥華", "vancouver"]], ["Burnaby", ["本拿比", "burnaby"]]];
export function basicIntent(input: SearchInput): SearchIntent {
  const query = input.query.toLowerCase();
  const excludeKeywords = cuisines.filter(([, terms]) => terms.some(term => new RegExp(`(?:不要|不吃|避开|避開|no |not |avoid )${term}`).test(query))).map(([key]) => key);
  const keywords = cuisines.filter(([key, terms]) => !excludeKeywords.includes(key) && terms.some(term => query.includes(term))).map(([key]) => key);
  if (!keywords.length) {
    keywords.push(...query.split(/[\s,，。!?！？]+/).filter(w => /^[a-z][a-z'-]+$/.test(w) && w.length > 1 &&
      !/^(find|deals?|restaurants?|nearby|cheap|today|please|any|recommend|something|nice|show|me|eat|food|under|cad|usd|not|avoid|no|closest|cheapest)$/.test(w) &&
      !excludeKeywords.some(term => matchesTerm(term, normalizeName(w)))).slice(0, 8));
  }
  const budget = query.match(/(?:under|below|预算|預算|不超过|不超過|最多)\s*(?:cad|usd|\$)?\s*(\d+(?:\.\d+)?)/i) ?? query.match(/(?:\$\s*)?(\d+(?:\.\d+)?)\s*(?:元|刀|dollars?)?\s*(?:以内|以下|以下|or less)/i);
  const radius = query.match(/(\d+(?:\.\d+)?)\s*(?:km|公里)/i);
  const currency = /\bcad\b|加元|加币|加幣/.test(query) ? "CAD" : /\busd\b|美元/.test(query) ? "USD" : null;
  return { keywords, excludeKeywords, city: cities.find(([, aliases]) => aliases.some(a => query.includes(a)))?.[0] ?? null,
    maxPrice: budget ? Number(budget[1]) : null, currency, maxDistanceKm: radius ? Number(radius[1]) : null,
    requiresOrigin: /附近|最近|nearby|near me|closest/.test(query), availableNow: /现在|現在|此刻|right now|available now/.test(query),
    sortBy: /最近|closest|nearest/.test(query) ? "distance" : /最便宜|cheapest/.test(query) ? "price" : /最大折扣|biggest discount/.test(query) ? "discount" : "relevance",
    unsupportedNeeds: [
      ...(/过敏|過敏|allerg|无麸|無麩|gluten.free/.test(query) ? ["Dietary safety must be confirmed with the restaurant."] : []),
      ...(/外卖|外賣|takeout|take.out|delivery|营业|營業|open now|评分|評分|ratings?|今晚|明天|tonight|tomorrow|今天|today/.test(query) ? ["This requirement cannot be reliably checked against the stored offer fields."] : []),
    ],
  };
}
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const dlat = rad(b.latitude - a.latitude), dlon = rad(b.longitude - a.longitude);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))) * 100) / 100;
}
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function previousDate(date: string) { return new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10); }
function onDate(record: SearchRecord, date: string) {
  const d = record.deal;
  return (!d.startDate || date >= d.startDate) && (!d.endDate || date <= d.endDate) &&
    (!d.days.length || d.days.includes(weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()] as typeof d.days[number]));
}
export function availableAt(record: SearchRecord, now: Date): boolean {
  const date = localDate(now, record.timezone), d = record.deal;
  if (!d.startTime || !d.endTime || d.startTime === d.endTime) return false;
  const options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  const parts = record.timezone === "America/Vancouver"
    ? formatVancouverParts(now, "en-GB", options)
    : new Intl.DateTimeFormat("en-GB", { ...options, timeZone: record.timezone }).formatToParts(now);
  const time = `${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`;
  if (d.startTime < d.endTime) return onDate(record, date) && time >= d.startTime && time < d.endTime;
  return time >= d.startTime ? onDate(record, date) : time < d.endTime && onDate(record, previousDate(date));
}
function matchesTerm(term: string, text: string) {
  const normalized = normalizeName(term);
  const group = cuisines.find(([key, aliases]) => key === normalized || aliases.includes(normalized));
  return (group ? [group[0], ...group[1]] : [normalized]).some(t => text.includes(normalizeName(t)));
}
export function findCandidates(records: SearchRecord[], input: SearchInput, intent: SearchIntent, now: Date): SearchCandidate[] {
  const zh = input.language === "zh";
  const candidates: SearchCandidate[] = [];
  for (const record of records) {
    const d = record.deal, p = record.restaurant, today = localDate(now, record.timezone);
    if (d.endDate && d.endDate < today || input.focusDealId && input.focusDealId !== record.dealId) continue;
    const searchCity = intent.city ? cities.find(([, aliases]) => aliases.includes(intent.city!.toLowerCase()))?.[0] ?? intent.city : null;
    if (searchCity && normalizeName(p.city ?? "") !== normalizeName(searchCity)) continue;
    const distance = input.origin ? distanceKm(input.origin, p) : null;
    if (intent.maxDistanceKm !== null && (distance === null || distance > intent.maxDistanceKm)) continue;
    // A percent discount never establishes an absolute meal price.
    if (intent.currency && d.currency !== intent.currency) continue;
    if (intent.maxPrice !== null && (d.price === null || !intent.currency || d.price > intent.maxPrice)) continue;
    if (intent.availableNow && !availableAt(record, now)) continue;
    const text = normalizeName([d.restaurantName, d.title, d.description].join(" "));
    if (intent.excludeKeywords.some(term => matchesTerm(term, text))) continue;
    const matched = intent.keywords.filter(term => matchesTerm(term, text));
    if (intent.keywords.length && !matched.length) continue;
    const facts: Fact[] = [{ id: "offer", kind: "offer", text: d.title }];
    if (d.price !== null && d.currency) facts.push({ id: "price", kind: "price", text: zh ? `已记录的优惠价是 ${d.currency} ${d.price}。` : `The listed offer price is ${d.currency} ${d.price}.` });
    if (d.discountPercent !== null && d.discountPercent > 0) facts.push({ id: "discount", kind: "discount", text: zh ? `优惠明确标注减免 ${d.discountPercent}%。` : `The offer explicitly lists ${d.discountPercent}% off.` });
    if (distance !== null) facts.push({ id: "distance", kind: "distance", text: zh ? `距搜索起点约 ${distance.toFixed(1)} 公里（直线距离）。` : `About ${distance.toFixed(1)} km from the search origin in a straight line.` });
    if (matched.length) facts.push({ id: "match", kind: "match", text: zh ? "店铺或优惠信息匹配了你想找的类型。" : "The restaurant or offer matches your search terms." });
    if (d.startTime && d.endTime) facts.push({ id: "time", kind: "time", text: zh ? `优惠时段为 ${d.startTime}–${d.endTime}（${record.timezone}）。` : `Offer hours are ${d.startTime}–${d.endTime} (${record.timezone}).` });
    const caveats = [...d.conditions, ...d.warnings];
    if (d.days.length) caveats.push(zh ? `适用星期：${d.days.join(", ")}。` : `Eligible days: ${d.days.join(", ")}.`);
    if (d.startDate && d.startDate > today) caveats.push(zh ? `此优惠从 ${d.startDate} 开始。` : `This offer starts on ${d.startDate}.`);
    if (d.endDate) caveats.push(zh ? `有效至 ${d.endDate}。` : `Valid through ${d.endDate}.`);
    if (d.price === null) caveats.push(zh ? "未记录最终餐价，请向店铺确认。" : "Final meal price is not recorded; confirm with the restaurant.");
    if (!intent.availableNow) caveats.push(zh ? "请确认适用日期与时段；这不是店铺营业状态。" : "Check eligible days and hours; this is not confirmation that the restaurant is open.");
    else caveats.push(zh ? "优惠时段匹配当前时间；店铺实际营业和库存仍需确认。" : "The offer schedule matches now; confirm actual opening and availability.");
    const score = matched.length * 10 + (d.discountPercent ?? 0) / 100 + (distance === null ? 0 : 1 / (distance + 1));
    candidates.push({ ...record, distanceKm: distance, score, facts, caveats: [...new Set(caveats)] });
  }
  return candidates.sort((a, b) => {
    const byPrice = (a.deal.price ?? Infinity) - (b.deal.price ?? Infinity);
    const byDistance = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    return (intent.sortBy === "price" && intent.currency && a.deal.currency === intent.currency && b.deal.currency === intent.currency ? byPrice :
      intent.sortBy === "distance" ? byDistance : intent.sortBy === "discount" ? (b.deal.discountPercent ?? 0) - (a.deal.discountPercent ?? 0) : 0) ||
      b.score - a.score || a.dealId.localeCompare(b.dealId);
  });
}
export function renderRecommendation(candidate: SearchCandidate, selection: RecommendationPlan["selections"][number], language: "zh" | "en"): Recommendation {
  const ids = [...new Set([selection.hookFactId, ...selection.supportFactIds])];
  const facts = ids.map(id => candidate.facts.find(f => f.id === id)).filter((f): f is Fact => !!f);
  const zh = language === "zh";
  const hooks = zh ? {
    value: `如果你想把这顿吃得更划算，可以优先看看 ${candidate.restaurant.name}。`,
    nearby: `如果你不想为吃饭跑太远，可以先看看 ${candidate.restaurant.name}。`,
    craving: `既然你在找这个类型，${candidate.restaurant.name} 值得放进你的候选。`,
    discover: `${candidate.restaurant.name} 有一条值得你看看、比较的优惠。`,
  } : {
    value: `Looking to make this meal better value? Consider ${candidate.restaurant.name}.`,
    nearby: `Prefer staying nearby? Take a look at ${candidate.restaurant.name}.`,
    craving: `For the kind of meal you are looking for, consider ${candidate.restaurant.name}.`,
    discover: `${candidate.restaurant.name} has an offer worth comparing.`,
  };
  return { ...candidate, pitch: `${hooks[selection.angle]} ${facts.map(f => f.text).join(" ")} ${zh ? "条件适合你的话，点开路线，再决定要不要去。" : "If the conditions work for you, check the route and decide whether to visit."}`,
    whyGo: facts.map(f => f.text), citedFactIds: facts.map(f => f.id),
    cta: { label: zh ? "查看路线" : "Check directions", url: `https://www.google.com/maps/dir/?api=1&destination=${candidate.restaurant.latitude},${candidate.restaurant.longitude}` } };
}
function basicPlan(candidates: SearchCandidate[], limit: number): RecommendationPlan {
  return { selections: candidates.slice(0, limit).map(c => ({ dealId: c.dealId,
    hookFactId: c.facts.find(f => f.kind === "price" || f.kind === "discount")?.id ?? "offer",
    supportFactIds: c.facts.filter(f => f.kind === "distance" || f.kind === "match").map(f => f.id).slice(0, 2),
    angle: c.facts.some(f => f.kind === "match") ? "craving" : c.distanceKm !== null ? "nearby" : "discover" })) };
}
export type SearchDependencies = {
  records: SearchRecord[]; now?: () => Date;
  understand?: (input: SearchInput) => Promise<SearchIntent>;
  recommend?: (input: SearchInput, intent: SearchIntent, candidates: SearchCandidate[]) => Promise<RecommendationPlan>;
};
export async function searchDeals(raw: unknown, deps: SearchDependencies): Promise<SearchResult> {
  const parsed = searchInputSchema.safeParse(raw);
  if (!parsed.success) throw new WorkflowError("INVALID_INPUT", "Invalid search query or filters.");
  const input = parsed.data, zh = input.language === "zh", warnings: string[] = [];
  let mode: SearchResult["mode"] = "basic", intent = basicIntent(input);
  if (deps.understand) {
    try { intent = intentSchema.parse(await deps.understand(input)); mode = "gemini"; }
    catch { warnings.push(zh ? "AI 理解暂不可用，已使用基础搜索。" : "AI understanding is unavailable; basic search was used."); }
  }
  intent = intentSchema.parse({ ...intent, city: input.city ?? intent.city, maxPrice: input.maxPrice ?? intent.maxPrice,
    currency: input.currency ?? intent.currency, maxDistanceKm: input.maxDistanceKm ?? intent.maxDistanceKm,
    availableNow: input.availableNow ?? intent.availableNow });
  if (intent.requiresOrigin && intent.maxDistanceKm === null) intent.maxDistanceKm = 5;
  const missingOrigin = (intent.requiresOrigin || intent.maxDistanceKm !== null || intent.sortBy === "distance") && !input.origin;
  const missingCurrency = (intent.maxPrice !== null || intent.sortBy === "price") && !intent.currency;
  if (missingOrigin || missingCurrency || intent.unsupportedNeeds.length) return { mode, scope: "published_deals", intent,
    recommendations: [], totalMatches: 0, warnings, message: intent.unsupportedNeeds.length ?
      (zh ? "已有优惠数据不足以确认这些要求，请进一步说明或向店铺确认。" : "The stored offers cannot confirm these requirements; clarify or check with the restaurant.") : missingOrigin ?
      (zh ? "请提供你的位置，才能按附近或距离搜索。" : "Provide your location to search nearby or by distance.") :
      (zh ? "请说明预算币种，例如 CAD 15，才能准确筛选价格。" : "Specify a budget currency, such as CAD 15, to filter prices accurately.") };
  const now = deps.now?.() ?? new Date();
  const records = deps.records.map(record => searchRecordSchema.parse(record));
  const candidates = findCandidates(records, input, intent, now);
  if (!candidates.length) return { mode, scope: "published_deals", intent, recommendations: [], totalMatches: 0, warnings,
    message: zh ? "现有优惠中没有找到符合条件的结果。可以调整预算、距离或关键词。" : "No stored offers match. Try adjusting the budget, distance or keywords." };
  const shortlist = candidates.slice(0, 20);
  let plan = basicPlan(shortlist, input.limit);
  if (mode === "gemini" && deps.recommend) {
    try {
      const proposed = await deps.recommend(input, intent, shortlist);
      const used = new Set<string>();
      if (!proposed.selections.length || proposed.selections.length > input.limit) throw new Error("Invalid recommendation count");
      for (const selection of proposed.selections) {
        const c = shortlist.find(c => c.dealId === selection.dealId);
        if (!c || used.has(c.dealId) || ![selection.hookFactId, ...selection.supportFactIds].every(id => c.facts.some(f => f.id === id))) throw new Error("Invented evidence or duplicate deal");
        if (selection.angle === "nearby" && c.distanceKm === null || selection.angle === "craving" && !c.facts.some(f => f.kind === "match") ||
          selection.angle === "value" && !c.facts.some(f => f.kind === "price" || f.kind === "discount")) throw new Error("Unsupported recommendation angle");
        used.add(c.dealId);
      }
      if (intent.sortBy !== "relevance") {
        // Explicit cheapest/nearest/biggest-discount requests keep deterministic ordering.
        const expected = shortlist.slice(0, input.limit).map(c => c.dealId);
        if (expected.some(id => !used.has(id))) throw new Error("AI ranking ignored explicit sort order");
        proposed.selections.sort((a, b) => expected.indexOf(a.dealId) - expected.indexOf(b.dealId));
      }
      plan = proposed;
    } catch { warnings.push(zh ? "AI 推荐暂不可用，已根据真实数据生成推荐理由。" : "AI ranking is unavailable; recommendations use recorded facts."); }
  }
  return { mode, scope: "published_deals", intent, totalMatches: candidates.length, warnings,
    recommendations: plan.selections.map(s => renderRecommendation(shortlist.find(c => c.dealId === s.dealId)!, s, input.language)),
    message: zh ? `找到 ${candidates.length} 条符合条件的入库优惠，以下是值得考虑的选择。` : `Found ${candidates.length} matching stored offers. Here are options to consider.` };
}
