"use client";
import { DraftReview } from "./ReelIntake";
const draft = { restaurant: "Example Cafe", address: null, dealText: "Lunch bowl for $8", price: 8, currency: null, validDays: ["mon"], validStart: "11:00", validEnd: "14:00", expiresOn: null, conditions: ["Dine-in only"] };
const fixture = { caption: "Example Cafe: Lunch bowl for $8 on Mondays, 11am–2pm. Dine-in only.", draftJson: JSON.stringify([draft]),
  extractionJson: JSON.stringify({ isDeal: true, drafts: [draft], transcript: "Lunch bowl for eight dollars.", warnings: ["Currency and expiry are unknown."], evidence: [{ draftIndex: 0, field: "price", channel: "visual", quote: "$8", timestampSeconds: 4 }] }) };
export function LayoutPreview() { return <div className="narrow-page reel-page"><div className="page-heading"><h1>Your Reel save.</h1><p>Synthetic layout fixture. No Reel retrieved. Saves are disabled.</p></div><DraftReview item={fixture} onSave={async () => { throw new Error("Preview does not save"); }} /></div>; }
