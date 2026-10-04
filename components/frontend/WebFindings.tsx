"use client";
import { useMemo } from "react";
import DOMPurify from "dompurify";
import type { WebDiscovery } from "@/lib/workflow/web-discovery";

export function WebFindings({ findings }: { findings: WebDiscovery }) {
  const suggestions = useMemo(() => DOMPurify.sanitize(findings.searchSuggestionsHtml, {
    ADD_TAGS: ["style"], ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "textarea"],
  }), [findings.searchSuggestionsHtml]);
  return <section className="web-findings panel" aria-label="Online search findings">
    <p className="eyebrow">From the web</p>
    <h2>What we found online</h2>
    <p className="muted">These are web findings. Confirm the branch, dates and availability before visiting.</p>
    <div className="web-answer">{findings.text}</div>
    <div className="web-sources"><h3>Sources</h3><ul>{findings.sources.map(s =>
      <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul></div>
    <p className="muted">Searched {new Date(findings.queriedAt).toLocaleString("en-CA")}. These findings have not been added to the community feed.</p>
    {/* Google Search grounding requires the associated provider search suggestions. */}
    <div className="web-suggestions" dangerouslySetInnerHTML={{ __html: suggestions }} />
  </section>;
}
