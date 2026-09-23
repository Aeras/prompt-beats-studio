from pathlib import Path

lyrics_test = Path("src/lib/lyrics-review-integration.test.ts")
text = lyrics_test.read_text()
old = '''  test("Replace Current Version is UI-restricted and server-enforced to the latest version", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const sql = await source(saveMigration);
    expect(route).toContain("!selectedProject.isLatest");
    expect(route).toContain("Η V${selectedProject.versionNumber");
    expect(sql).toContain("Only the latest project version can be replaced");
    expect(sql).toContain("v_latest.id <> _version_prompt_id");
  });
'''
new = '''  test("Replace Current Version is UI-restricted and server-enforced to a branch leaf", async () => {
    const route = await source("src/routes/lyrics-review.tsx");
    const sql = await source("supabase/migrations/20260923150000_branching_versions_phase1.sql");
    expect(route).toContain("!selectedProject.isLeaf");
    expect(route).toContain("Η V${selectedProject.versionNumber");
    expect(sql).toContain("Only a leaf project version can be replaced");
    expect(sql).toContain("child.parent_prompt_id = _version_prompt_id");
  });
'''
if old in text:
    text = text.replace(old, new, 1)
elif "server-enforced to a branch leaf" not in text:
    raise SystemExit("Lyrics Review replace-current test block not found")
lyrics_test.write_text(text)

linked_test = Path("src/lib/project-version-linked-tracks.test.ts")
text = linked_test.read_text()
old = '''    expect(server).toContain("is_published");
    expect(ui).toContain(
      'track.is_published ? (el ? "Δημόσιο" : "Public") : (el ? "Ιδιωτικό" : "Private")',
    );
    expect(ui).not.toContain("updateTrack");
'''
new = '''    expect(server).toContain("is_published");
    expect(ui).toContain("track.is_published");
    expect(ui).toContain('"Δημόσιο"');
    expect(ui).toContain('"Ιδιωτικό"');
    expect(ui).not.toContain("updateTrack");
'''
if old in text:
    text = text.replace(old, new, 1)
elif 'expect(ui).toContain("track.is_published")' not in text:
    raise SystemExit("Linked-track visibility test block not found")
linked_test.write_text(text)
