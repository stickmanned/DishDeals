# T-32 Liquid Glass integration

William assigned merging the latest Liquid Glass UI with the current deployed functionality. Branch `t-32-liquid-glass-integration`, isolated checkout `/private/tmp/dishdeals-t32-liquid-glass-integration`.

Merged `t-31-liquid-glass-ui` at `61c3ae8e3774a8ac0ecd2b982507e755310c1c7d` into production main `4137b9c0feca3fe7c235fbf1ad5d4f73b482bb5e` with zero conflicts. The original UI branch and working checkout are preserved. Added flex wrapping and spacing to review notice headings after browser verification found a 9px horizontal overflow at 375px. This changes layout only.

Convex, lib, map-component, DealLocationPicker and all native Swift sources match deployed main exactly. T-28 share review routing, T-29 photo extraction and T-30 address search are retained. Mobile navigation follows the supplied UI's Discover / Map / Share a deal / Saved tabs; Profile still uses the existing header avatar and authentication route. Backend credentials, provider gates and data have not been changed or redeployed.

Validation:
- Initial merged `npm run check`: passed, including 86 files / 2295 tests and 23 workflow tests.
- After the notice layout adjustment: map build, TypeScript, ESLint, 86 files / 2295 tests and 23 workflow tests passed. The final Next build initially failed because the sandbox blocked Turbopack's local worker port. A clean generated cache and authorized `npm run build` passed; no source workaround was introduced.
- Browser at 375x812 and 1280x900: navigation, header profile access and layouts checked. Synthetic development-only review fixture: address and weekday edits work, address search becomes `6516 Kingsway, Burnaby, BC` for `Phở Hòa + jázen tea, 6516 Kingsway, Burnaby, BC`; map zoom control works, unselected-location confirmation remains disabled, notices fit with document width 375px. No provider requests, private saves or publications were triggered by QA.
- iPhone asset catalog compiled with `xcrun actool` for iOS 16; exit 0 and Assets.car produced (sandbox simulator-service warnings). No full native rebuild or fresh physical-phone share acceptance was performed for this UI integration. Existing installed app obtains the web UI from production; launcher icon/name changes require a later native rebuild.
- `git diff --check` passed. Root checkout and teammate source branch untouched.

Release scope: GitHub merge and normal Vercel production web deployment, specifically authorized by William's merge request. Backend remains `proper-marmot-82` with the previously verified fixes. Keep previous main and Vercel deployment available for rollback. No next ticket is taken automatically.
