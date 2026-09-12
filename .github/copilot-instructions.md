# PromptBeats Copilot Instructions

## Project status
- PromptBeats is an existing production project, not a greenfield app.
- Treat the current repository state as the source of truth, even if older docs say otherwise.
- Before changing anything, inspect the relevant existing routes, components, server functions, migrations, and utilities.
- Preserve current behavior unless the task explicitly requires changing it.
- Keep changes narrowly scoped; do not do unrelated refactors, cleanup, dependency upgrades, or redesigns.

## Stack and architecture
- Frontend and SSR use TanStack Start + TanStack Router with React 19, TypeScript, Vite, and React Query.
- Styling uses Tailwind CSS v4 with shared theme/utilities in `src/styles.css`.
- UI is built from app-specific components in `src/components/promptbeats` plus shadcn/Radix UI primitives in `src/components/ui`.
- Routing is file-based under `src/routes`; `src/routes/__root.tsx` is the app shell root and `src/routeTree.gen.ts` is generated.
- Shared client/server logic lives in `src/lib`, hooks in `src/hooks`, and Supabase/Lovable integrations in `src/integrations`.

## Routing and UI conventions
- Follow TanStack file-routing conventions from `src/routes/README.md`; do not introduce Next.js/Remix-style folders such as `src/pages`.
- Reuse `AppShell`, `PlayerProvider`, existing route patterns, and existing React Query query keys/invalidation patterns when extending screens.
- Match the existing PromptBeats UI language: dark theme, neon/glass styling, rounded surfaces, `font-display`, and utility classes such as `glass`, `glass-strong`, `bg-gradient-neon`, and `text-gradient-neon`.
- Prefer existing promptbeats components and `src/components/ui` primitives over creating parallel UI implementations.

## Supabase and backend conventions
- Supabase is the primary backend. Verify table/view/RPC names from `src/integrations/supabase/types.ts` and `supabase/migrations/*` instead of guessing schemas.
- Public reads typically use `createPublicServerClient()` from `src/lib/supabase-public.server.ts`; authenticated server functions use `requireSupabaseAuth`; privileged operations use the service-role client from `src/integrations/supabase/client.server.ts`.
- In `*.functions.ts` and route files, do not top-level import the service-role client into code that can ship to the client bundle; follow the existing dynamic `await import("@/integrations/supabase/client.server")` pattern inside server handlers.
- Database behavior often lives in Supabase SQL migrations and RPC functions. Preserve those SQL-first workflows and update migrations/code together when database behavior changes are required.
- Do not assume direct production database access; make schema changes through repository migrations.

## Existing important workflows
- Song generation is durable and job-based: browser code starts jobs through `src/lib/generation-jobs.functions.ts`, execution runs in `src/lib/generation-jobs.server.ts`, and recovery/execution is triggered by `src/routes/api/public/jobs/run.ts`.
- Upload handling is implemented through `src/routes/api/upload.ts`, which admits, validates, and uploads audio to Cloudflare R2, while `src/lib/tracks.functions.ts` records tracks and performs rollback/cleanup through database-backed cleanup ledgers.
- Moderation/admin flows rely on Supabase RPCs plus management UI in `src/routes/management.tsx` and `src/lib/admin.functions.ts` / `src/lib/track-moderation.functions.ts`.
- Billing/email integrations already exist in code-first form (`src/lib/stripe.functions.ts`, `src/routes/api/public/webhooks/stripe.ts`, `src/lib/email.functions.ts`, `src/lib/welcome-email.server.ts`) even where UI exposure is limited.

## Generated and sensitive files
- Do not hand-edit generated files unless the task specifically requires regenerating them: `src/routeTree.gen.ts`, `src/integrations/lovable/index.ts`, and the auto-generated files under `src/integrations/supabase`.
- `drizzle/schema.ts` is currently auto-generated/blank; the authoritative database history in this repo is under `supabase/migrations`.
- Never expose, commit, print, or modify secrets or credentials in `.env` or environment-dependent code.

## Coding patterns to follow
- Keep validation close to boundaries with Zod, following the existing `createServerFn(...).inputValidator(...)` pattern.
- Prefer small focused helpers in `src/lib` and existing hooks before adding new abstractions.
- Reuse existing safety patterns for auth, moderation, storage ownership checks, idempotency, and cleanup instead of replacing them.
- Do not silently change behavior outside the requested scope.

## Validation
- Run the relevant existing repository commands after changes when applicable: `npm run lint`, `npm run build`, `npm run format`, `npm run dev`, `npm run preview`.
- There is currently no repository test script and no dedicated type-check script in `package.json`; report that accurately instead of inventing commands.
