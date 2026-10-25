# AI Models admin table — agreed 3 changes (2026-10-25)

Baseline: main `5bdae5a6fff5bf9ea52aed771498344e78891b47`. One cohesive PR. Do not change production or deploy.

## 1 — Inline management

Replace read-only cells in **Installed models** table with:
- Generator and Quality Check: independent **small circular** purple on/off controls, filled with check when on, empty when off; no repeated column captions in cells. Preserve compatibility gating and current defaults protections. Accessible button semantics, accessible labels, focus rings, touch targets.
- Status and Access: compact dark PromptBeats-purple dropdowns (not native Android white sheet), options anchored **under** the clicked field, no unnecessary internal 3–4px scroll. Status: Testing, Enabled, Disabled, Deprecated, Archived. Access: All users, Admin only, Selected users, using existing actual value `admin_only`. Use non-clipped overlays and small-screen viewport collision handling. Do not set fixed tiny popover viewport that causes scroll; use normal page scroll when needed.
- Save each changed field immediately server-side, show save state; rollback UI on error. No lost updates when quickly changing independent fields; avoid sending stale *whole model* data: use partial patch validated on server, compare-and-set/version strategy or serialized per-model requests and server reread, with defaults checked atomically. Preserve current editor for advanced options/pricing/reasoning. Selected-user access must preserve current entitlement workflows; inspect whether dedicated list exists and expose it without inventing access.

## 2 — Bulk permanent uninstall

A trash icon at far left of **Installed models** header/title area. First press toggles selection mode, displaying selection checkboxes in a far-left aligned column (one per installed model). Select multiple. Second press with nonempty selection displays **inline dark burgundy** confirmation panel **directly below the trash button, before the first model row**, NOT an unstyled white native popover and NOT at the very bottom of models list. Beautiful dark red/burgundy background, subtle border, rounded corners, full readable text and `Cancel` / red `Delete` buttons. Cancel confirmation only keeps selections; separate Cancel selection mode clears all. Count and names of selected models, blocked reasons clear, zero-selection behavior clear, focus management on open/close. Appropriate a11y.

Server action atomically deletes *selected installed registry entries* from `public.ai_models` (and only intentionally coupled ephemeral registry data if proven safe); no deletion of past generations, song data, Quality Checks, usage logs, audit, or finance data. User acknowledges hard-uninstall requires fresh add through provider detection/check. Refuse if any model remains Generator/Quality Check/AI Tools default, or has live dependencies; request default reassignment first. Identify foreign keys and other references, including user access / provider discovery, before deciding deletion policy. Server must enforce admin authorization, input count/UUID validation, cross-request transaction/locking/default race protections, all-or-nothing delete, audit log with IDs and names, explicit partial failure handling, revocation/selection user access cleanup where appropriate, no orphaned references. Never run deletion on production as a test.

## 3 — Sticky column header without nested vertical scroll

Page scroll remains exactly one continuous vertical scroll. Above models table default-model settings and provider sections move normally. On arrival of the column header at its natural position immediately below existing fixed main app header, that header sticks while model rows naturally scroll underneath; no separate fixed-height models region, no second scrollbar, no extra reserved blank space. At table end sticky header naturally scrolls away and remaining page resumes. Do not sticky the title card if only column names requested. Preserve horizontal alignment on narrow mobile view when scrolling table sideways; avoid `overflow-x-auto` creating unintended sticky containing block. Validate in browser on real mobile/tablet/desktop viewports, existing fixed shell header and sticky offsets.

## Acceptance, constraints

- Fully preserve existing installed model data, access policies, live defaults, pricing/reasoning, model discovery, health checks and existing AI tools.
- Check API at `src/lib/ai-model-admin.functions.ts` and UI at `src/components/promptbeats/AiModelsPanel.tsx`; tests and e2e, SQL/RLS transaction/race scripts, migrations only if needed and safely verified. Existing `updateAdminAiModel` writes the whole row and separately checks defaults: do not naïvely call in parallel for inline fields. Existing values use `admin_only`, not `admins_only`.
- Tests for guarded defaults, unsupported model compatibility, concurrent change/uninstall, FK/history integrity, audit, admin auth, selected-users policy, rollback on API failure; verify exactly 3 mandatory CI gates at final HEAD.
- Update `docs/WORK-STATUS.md` in this same PR. Keep Draft until independently reviewed. No merge or publish/deploy, no production SQL changes, no live destructive tests.
