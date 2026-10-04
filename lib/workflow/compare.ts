import { comparisonInputSchema, comparisonPlanSchema, type ComparisonInput, type ComparisonPlan,
  type ComparisonRow, type ComparisonResult, type ComparisonFact } from "./compare-contracts";
import { searchRecordSchema, type SearchRecord } from "./search-contracts";
import { WorkflowError } from "./errors";
import { availableAt } from "./search";
import { localDate } from "./workflow";

export type ComparisonDependencies = {
  records: SearchRecord[]; now?: () => Date;
  recommend?: (input: ComparisonInput, rows: ComparisonRow[]) => Promise<ComparisonPlan>;
};

function row(record: SearchRecord, input: ComparisonInput, now: Date): ComparisonRow {
  const d = record.deal;
  const facts: ComparisonFact[] = [];
  const add = (id: string, kind: ComparisonFact["kind"], text: string) => facts.push({ id, kind, text,
    sourceUrl: record.sourceUrl, provenance: "stored_offer" });
  add("offer", "offer", d.title);
  if (d.price !== null && d.currency) add("price", "price", `Listed offer price: ${d.currency} ${d.price.toFixed(2)}.`);
  if (d.discountPercent !== null) add("discount", "discount", `Advertised discount: ${d.discountPercent}% off.`);
  d.conditions.forEach((text, index) => add(`condition-${index}`, "condition", text));
  input.tasteEvidence.filter(e => e.dealId === record.dealId).forEach((e, index) => facts.push({
    id: `taste-${index}`, kind: "taste", text: e.quote, sourceUrl: e.sourceUrl, provenance: "provided_review",
    ...(e.dish ? { dish: e.dish } : {}),
  }));
  const caveats = [...d.conditions, ...d.warnings];
  if (d.price === null) caveats.push("Final meal price is not recorded.");
  if (!d.currency) caveats.push("Price currency is not recorded.");
  if (!d.conditions.length) caveats.push("No restrictions are recorded; this does not confirm unrestricted eligibility.");
  if (d.days.length) caveats.push(`Eligible days: ${d.days.join(", ")}.`);
  if (d.startTime || d.endTime) caveats.push(`Offer hours: ${d.startTime ?? "unknown"}–${d.endTime ?? "unknown"} (${record.timezone}).`);
  if (d.startDate) caveats.push(`Starts on ${d.startDate}.`);
  if (d.endDate) caveats.push(`Valid through ${d.endDate}.`);
  else caveats.push("An end date is not recorded; confirm that this offer is still valid.");
  if (!facts.some(f => f.kind === "taste")) caveats.push("Taste evidence is not provided for this restaurant.");
  else caveats.push("Review excerpts are supplied by the integration and have not been independently verified. Taste is subjective; reviews may describe a different dish.");
  const today = localDate(now, record.timezone);
  const startsLater = !!d.startDate && d.startDate > today;
  const availability = !d.startTime || !d.endTime || d.startTime === d.endTime ?
    (startsLater ? "outside_recorded_schedule" : "unknown") :
    availableAt(record, now) ? "schedule_matches_now" : "outside_recorded_schedule";
  caveats.push("Offer schedules do not confirm restaurant opening, stock, taxes, tips, or the final bill.");
  return { ...record, facts, caveats: [...new Set(caveats)], availability };
}

export async function compareRestaurants(raw: unknown, deps: ComparisonDependencies): Promise<ComparisonResult> {
  const parsed = comparisonInputSchema.safeParse(raw);
  if (!parsed.success) throw new WorkflowError("INVALID_INPUT", "Select two to five distinct deals and a comparison priority.");
  const input = parsed.data, now = deps.now?.() ?? new Date();
  const records = input.dealIds.map(id => {
    const record = deps.records.find(r => r.dealId === id);
    if (!record) throw new WorkflowError("INVALID_SELECTION", "A selected published deal is unavailable. Refresh the map.");
    const validated = searchRecordSchema.parse(record);
    if (validated.deal.endDate && validated.deal.endDate < localDate(now, validated.timezone))
      throw new WorkflowError("INVALID_SELECTION", "A selected deal has expired. Refresh the map.");
    return validated;
  });
  if (new Set(records.map(r => r.restaurant.placeId)).size !== records.length)
    throw new WorkflowError("INVALID_SELECTION", "Choose one offer from each of two to five different restaurant locations.");
  const rows = records.map(r => row(r, input, now));
  const currencies = [...new Set(rows.filter(r => r.deal.price !== null && r.deal.currency).map(r => r.deal.currency!))];
  const priceGroups = currencies.map(currency => {
    const group = rows.filter(r => r.deal.currency === currency && r.deal.price !== null);
    const lowestListedPrice = Math.min(...group.map(r => r.deal.price!));
    return { currency, lowestListedPrice, dealIds: group.filter(r => r.deal.price === lowestListedPrice).map(r => r.dealId) };
  });
  const discounts = rows.filter(r => r.deal.discountPercent !== null);
  const maxDiscount = discounts.length ? Math.max(...discounts.map(r => r.deal.discountPercent!)) : null;
  const warnings = ["Listed prices may cover different dishes or portions. A larger percentage discount does not establish better value. No quality score, converted currency, or estimated savings is inferred."];
  const completePrices = priceGroups.length === 1 && rows.every(r => r.deal.price !== null && r.deal.currency === priceGroups[0].currency);
  if (!completePrices) warnings.push("Prices are missing or currencies differ. There is no overall lowest-price restaurant.");
  const tasteCoverage = rows.filter(r => r.facts.some(f => f.kind === "taste")).length;
  if (tasteCoverage < rows.length) warnings.push("Taste evidence is incomplete; missing reviews do not mean worse food.");
  let mode: ComparisonResult["mode"] = "evidence_only", recommendation: ComparisonResult["recommendation"] = null;
  let message = "Compare the recorded offers and restrictions below. Overall value depends on your meal and eligibility.";
  if (input.priority === "price") {
    if (completePrices && priceGroups[0].dealIds.length === 1) {
      const r = rows.find(r => r.dealId === priceGroups[0].dealIds[0])!;
      recommendation = { dealId: r.dealId, label: "Lowest listed offer price", reasons: r.facts.filter(f => f.kind === "price"), caveats: r.caveats };
      message = "This offer has the lowest recorded price in the shared currency. Check dishes, portions and restrictions before deciding.";
    } else message = completePrices ? "The lowest listed price is tied. Compare dishes and restrictions." : "Prices cannot support an overall price recommendation. Compare each currency separately.";
  } else if (input.priority === "taste" && tasteCoverage !== rows.length) {
    message = "Taste-first comparison needs food review evidence for every selected restaurant. Add sourced excerpts; deal size alone cannot tell us how the food tastes.";
  } else if (deps.recommend) {
    try {
      const plan = comparisonPlanSchema.parse(await deps.recommend(input, rows));
      const selected = rows.find(r => r.dealId === plan.suggestedDealId);
      if (plan.suggestedDealId === null && plan.citedFactIds.length) throw new Error("Evidence without a suggestion");
      if (plan.suggestedDealId !== null) {
        if (!selected || !plan.citedFactIds.length || new Set(plan.citedFactIds).size !== plan.citedFactIds.length)
          throw new Error("Invalid selection");
        const reasons = plan.citedFactIds.map(id => selected.facts.find(f => f.id === id));
        if (reasons.some(f => !f) || input.priority === "taste" && !reasons.some(f => f?.kind === "taste") ||
          input.priority === "value" && !reasons.some(f => f?.kind === "offer" || f?.kind === "price" || f?.kind === "discount"))
          throw new Error("Unsupported comparison evidence");
        recommendation = { dealId: selected.dealId, label: input.priority === "taste" ? "Taste-focused suggestion from supplied reviews" : "Offer to consider for value",
          reasons: reasons as ComparisonFact[], caveats: selected.caveats };
      }
      mode = "gemini";
      message = recommendation ? "AI selected an option using the cited evidence. This is a suggestion, not a verified best-food or best-value ranking." :
        "The available evidence does not support a single recommendation. Compare the offers side by side.";
    } catch {
      warnings.push("AI comparison is unavailable or returned unsupported evidence. Recorded facts are shown without an AI recommendation.");
    }
  } else warnings.push("AI comparison is not configured. Only the evidence comparison is available.");
  return { mode, priority: input.priority, scope: "published_deals", comparedAt: now.toISOString(), restaurants: rows,
    priceGroups, largestAdvertisedDiscount: maxDiscount === null ? null : { percent: maxDiscount, dealIds: discounts.filter(r => r.deal.discountPercent === maxDiscount).map(r => r.dealId) },
    recommendation, message, warnings };
}
