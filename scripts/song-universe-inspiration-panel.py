from pathlib import Path

p = Path("src/routes/song-universe.tsx")
s = p.read_text()
import_anchor = 'import { AppShell } from "@/components/promptbeats/AppShell";\n'
if 'SongUniverseInspirationPanel' not in s:
    if import_anchor not in s:
        raise SystemExit('missing Song Universe route import anchor')
    s = s.replace(
        import_anchor,
        import_anchor + 'import { SongUniverseInspirationPanel } from "@/components/promptbeats/SongUniverseInspirationPanel";\n',
        1,
    )

render_anchor = '      <UniverseAiPanel universe={universe} projects={projects} onRefresh={refresh} />\n'
if '<SongUniverseInspirationPanel universeId={universe.id}' not in s:
    if render_anchor not in s:
        raise SystemExit('missing Song Universe AI panel render anchor')
    s = s.replace(
        render_anchor,
        render_anchor + '\n      <SongUniverseInspirationPanel universeId={universe.id} />\n',
        1,
    )
p.write_text(s)
