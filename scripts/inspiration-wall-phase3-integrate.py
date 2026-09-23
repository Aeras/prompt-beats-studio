from pathlib import Path

route = Path("src/routes/inspiration-wall.tsx")
s = route.read_text()

import_anchor = 'import { AppShell } from "@/components/promptbeats/AppShell";\n'
panel_import = 'import { InspirationWallDirectionPanel } from "@/components/promptbeats/InspirationWallDirectionPanel";\n'
if panel_import not in s:
    if import_anchor not in s:
        raise RuntimeError("AppShell import anchor missing")
    s = s.replace(import_anchor, import_anchor + panel_import, 1)

old = '''              <WallWorkspace
                wall={wall.data.wall}
                cards={wall.data.cards}
                language={language}
                userId={user!.id}
                onRefresh={() => refresh(selectedWallId)}
                onDeleteWall={removeWall}
              />'''
new = '''              <WallWorkspace
                wall={wall.data.wall}
                cards={wall.data.cards}
                trackLinks={wall.data.trackLinks}
                language={language}
                userId={user!.id}
                onRefresh={() => refresh(selectedWallId)}
                onDeleteWall={removeWall}
              />'''
if old not in s:
    raise RuntimeError("WallWorkspace call anchor missing")
s = s.replace(old, new, 1)

old = '''function WallWorkspace({
  wall,
  cards,
  language,
  userId,
  onRefresh,
  onDeleteWall,
}: {
  wall: Awaited<ReturnType<typeof getInspirationWall>>["wall"];
  cards: InspirationWallCardRecord[];
  language: "en" | "el";
  userId: string;
  onRefresh: () => Promise<void>;
  onDeleteWall: () => Promise<void>;
}) {'''
new = '''function WallWorkspace({
  wall,
  cards,
  trackLinks,
  language,
  userId,
  onRefresh,
  onDeleteWall,
}: {
  wall: Awaited<ReturnType<typeof getInspirationWall>>["wall"];
  cards: InspirationWallCardRecord[];
  trackLinks: Awaited<ReturnType<typeof getInspirationWall>>["trackLinks"];
  language: "en" | "el";
  userId: string;
  onRefresh: () => Promise<void>;
  onDeleteWall: () => Promise<void>;
}) {'''
if old not in s:
    raise RuntimeError("WallWorkspace signature anchor missing")
s = s.replace(old, new, 1)

marker = '''      <div
        className={cn(
          "relative min-h-[68vh] rounded-3xl border border-white/10 p-4 sm:p-6",'''
insert = '''      <InspirationWallDirectionPanel
        wall={wall}
        trackLinks={trackLinks}
        language={language}
        onRefresh={onRefresh}
      />

'''
if marker not in s:
    raise RuntimeError("Workspace board marker missing")
s = s.replace(marker, insert + marker, 1)
route.write_text(s)

gate = Path(".github/workflows/regression-gate.yml")
g = gate.read_text()
old = '''      - name: Inspiration Wall Phase 2 tests
        run: bun test src/lib/inspiration-wall-phase2.test.ts

      - name: Smart Presets and language catalog tests'''
new = '''      - name: Inspiration Wall Phase 2 tests
        run: bun test src/lib/inspiration-wall-phase2.test.ts

      - name: Inspiration Wall Phase 3 tests
        run: bun test src/lib/inspiration-wall-phase3.test.ts

      - name: Smart Presets and language catalog tests'''
if old not in g:
    raise RuntimeError("Regression gate Phase 2 anchor missing")
gate.write_text(g.replace(old, new, 1))
