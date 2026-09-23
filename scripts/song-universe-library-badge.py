from pathlib import Path

p = Path("src/routes/library.tsx")
s = p.read_text()
import_anchor = 'import { ProjectVersionHistory } from "@/components/promptbeats/ProjectVersionHistory";\n'
if 'SongUniverseProjectBadge' not in s:
    if import_anchor not in s:
        raise SystemExit('missing library import anchor')
    s = s.replace(
        import_anchor,
        import_anchor + 'import { SongUniverseProjectBadge } from "@/components/promptbeats/SongUniverseProjectBadge";\n',
        1,
    )

badge_anchor = '''                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {analysisItems.length} analyses ·{" "}
                            {prompts.filter((p) => p.project_id === openProject.id).length} prompts
                          </p>'''
if '<SongUniverseProjectBadge projectId={openProject.id}' not in s:
    if badge_anchor not in s:
        raise SystemExit('missing open project badge anchor')
    s = s.replace(
        badge_anchor,
        badge_anchor + '\n                          <SongUniverseProjectBadge projectId={openProject.id} />',
        1,
    )
p.write_text(s)
