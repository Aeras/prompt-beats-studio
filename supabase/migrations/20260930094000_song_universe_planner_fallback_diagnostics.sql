alter table public.song_universe_planner_briefs
  add column if not exists fallback_diagnostics jsonb;

comment on column public.song_universe_planner_briefs.fallback_diagnostics is
  'Safe machine-readable diagnostics recorded only when the semantic Next Song Planner falls back.';
