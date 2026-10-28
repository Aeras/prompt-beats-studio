# AI Music Inspiration — Independent pre-release review (2026-10-28)

**Scope:** Draft PR #451, reviewed HEAD `6e6063a87f6cede290dd013fadc7e45a4d5aea27`. Read-only assessment; **not** a production pilot, deployment approval, or musicological certification.

## Confirmed

- The three GitHub checks `validate`, `browser-quality` and `replay` report success on the exact reviewed HEAD.
- Server-side model/role checks and owner-isolated durable jobs/profile flows are present; research uses real fixed-origin Tavily basic search. Current runtime Atlas returns no approved evidence from research-only RC1. Pending source receipts include extract hashes, and exact claim passages are checked for substring provenance.
- Missing Tavily configuration/verified model prices fails closed. Application monetary reservation is an estimate, not a provider-side hard billing guarantee. No live-call or production verification has occurred.

## External public pricing evidence (NOT account contract)

- Official Tavily pricing (https://www.tavily.com/pricing), retrieved 2026-10-28: Researcher free tier advertises 1,000 credits/month; Pay As You Go price $0.008/credit.
- Official Tavily basic-vs-advanced documentation (https://help.tavily.com/articles/6938147944-basic-vs-advanced-search-what-s-the-difference), updated 2026-02-03: basic search costs 1 credit, advanced 2 credits. This feature uses basic depth for both modes.
- Therefore 2 standard searches correspond to $0.016 and 5 extended searches to $0.040 **search-only** at public Pay As You Go pricing; AI costs extra. Verify actual account pricing and provider spending controls before configuring `MUSIC_INSPIRATION_SEARCH_CREDIT_USD`. Do not set an unverified value or create a paid request.

## Review observations — pre-pilot product quality, not newly certified defects

1. **Depth of research vs product promise (P1 quality risk).** `INSPIRATION_LIMITS` standard permits 2 searches×3 results, extended 5×3, but both invoke Tavily `search_depth: "basic"`; synthesis passes the first 1,500 characters of each maximum 10 documents. Two largely generic English queries may miss specialized Cyrillic, Greek, regional/instrument/recording citations. The prompt demands scores, harmony, historical credits and equipment detail that these budgets may often not yield. Test realistically with consenting bounded live cases once separately approved; consider controlled query-planning per artist language, artist/recording disambiguation and per-dimension coverage thresholds; report honest partial findings rather than fill gaps.
2. **Tavily receipt is textual provenance, not musicology (evidence limitation).** Substring checks and trusted retrieval establish that the quoted text appeared in supplied accessible extracts. They do not certify a claim's interpretation, source reliability or historically correct equipment/tempo. Preserve prominent uncertainty labeling and review representative pilot citations independently.
3. **Financial/ops prerequisites (release blocker).** Verify actual Tavily contract price, selected AI model pricing/cache rates and true provider account spending ceilings. Confirm durable job runner/hosting schedule, service secrets, request deadlines and rollback. No provider-side hard spend cap has been independently verified.
4. **Atlas-first currently contributes zero approved facts (known intended limitation).** Do not activate RC1/V4 research-only techniques or claim the whole Atlas has been consulted as authoritative.

## Safe next gate

Keep the PR Draft pending independent technical/security review and product-quality acceptance. Current CI PASS remains valid for the reviewed HEAD; any future changes require all gates on the new exact HEAD. Release requires separate owner decisions on merge, isolated production migration, app publish and tightly bounded live pilot; never equate any one with the others. No change to production credentials, prices, paid provider calls, or the paused Atlas PR #450 is authorized by this review.
