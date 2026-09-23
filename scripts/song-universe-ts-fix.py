from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# Shared serializable contracts + Zod inference.
p = Path("src/lib/song-universe.shared.ts")
s = p.read_text()
s = must_replace(
    s,
    "  contextSnapshot: Record<string, unknown>;",
    "  contextSnapshot: SongUniverseContextSnapshot | null;",
    "serializable context snapshot",
)
s = must_replace(
    s,
    "export const songUniverseAnalysisSchema: z.ZodType<SongUniverseAnalysis> = z.object({",
    "export const songUniverseAnalysisSchema = z.object({",
    "analysis schema inference",
)
p.write_text(s)

# Server functions: typed rows, bracket access for dynamic change object, parse context snapshot.
p = Path("src/lib/song-universe.functions.ts")
s = p.read_text()
s = must_replace(
    s,
    "  songUniverseCreativeBibleSchema,\n  songUniverseProjectStatusSchema,",
    "  songUniverseContextSnapshotSchema,\n  songUniverseCreativeBibleSchema,\n  songUniverseProjectStatusSchema,",
    "context snapshot schema import",
)
s = must_replace(
    s,
    "    contextSnapshot:\n      row.context_snapshot && typeof row.context_snapshot === \"object\" ? row.context_snapshot : {},",
    "    contextSnapshot: (() => {\n      const parsed = songUniverseContextSnapshotSchema.safeParse(row.context_snapshot);\n      return parsed.success ? parsed.data : null;\n    })(),",
    "context snapshot mapper",
)
for old, new, label in [
    ("changes.title = data.title;", 'changes["title"] = data.title;', "changes title"),
    ("changes.description = data.description;", 'changes["description"] = data.description;', "changes description"),
    ("changes.universe_type = data.universeType;", 'changes["universe_type"] = data.universeType;', "changes universe type"),
    ("changes.status = data.status;", 'changes["status"] = data.status;', "changes status"),
    ("changes.creative_bible = data.creativeBible;", 'changes["creative_bible"] = data.creativeBible;', "changes creative bible"),
    ("changes.initial_direction = data.initialDirection;", 'changes["initial_direction"] = data.initialDirection;', "changes initial direction"),
    ("changes.universe_role = data.universeRole;", 'changes["universe_role"] = data.universeRole;', "membership role"),
    ("changes.project_status = data.projectStatus;", 'changes["project_status"] = data.projectStatus;', "membership status"),
    ("changes.intentional_outlier = data.intentionalOutlier;", 'changes["intentional_outlier"] = data.intentionalOutlier;', "membership outlier"),
]:
    s = must_replace(s, old, new, label)
p.write_text(s)

# Inspiration panel: explicit serializable wall type.
p = Path("src/components/promptbeats/SongUniverseInspirationPanel.tsx")
s = p.read_text()
insert_anchor = 'import {\n  listSongUniverseInspirationWalls,\n  setSongUniverseInspirationWall,\n} from "@/lib/song-universe-inspiration.functions";\n'
insert = insert_anchor + '''\n
type UniverseWall = {
  id: string;
  title: string;
  description: string | null;
  universeId: string | null;
  connectedProjectId: string | null;
  updatedAt: string;
};
'''
s = must_replace(s, insert_anchor, insert, "wall type insertion")
s = s.replace(".filter((wall) => wall.universeId === universeId)", ".filter((wall: UniverseWall) => wall.universeId === universeId)")
s = s.replace(".filter((wall) => !wall.universeId)", ".filter((wall: UniverseWall) => !wall.universeId)")
s = s.replace("linked.map((wall) =>", "linked.map((wall: UniverseWall) =>")
s = s.replace("available.slice(0, 12).map((wall) =>", "available.slice(0, 12).map((wall: UniverseWall) =>")
p.write_text(s)

# Route: correct feature hook property and explicit project types at broad server return sites.
p = Path("src/routes/song-universe.tsx")
s = p.read_text()
s = s.replace("if (access.loading)", "if (access.isLoading)")
# Add local aliases derived from stable record type and option shape.
anchor = 'const sectionLabels: Record<(typeof SONG_UNIVERSE_BIBLE_SECTIONS)[number], { en: string; el: string }> = {'
if anchor not in s:
    raise SystemExit("missing route type alias anchor")
alias = '''type UniverseProject = Awaited<ReturnType<typeof getSongUniverse>>["projects"][number];
type UniverseProjectOption = { id: string; name: string; updatedAt: string; linked: boolean };

'''
s = s.replace(anchor, alias + anchor, 1)
s = s.replace(".filter((project) => !project.linked)", ".filter((project: UniverseProjectOption) => !project.linked)")
s = s.replace("availableProjects.map((project) =>", "availableProjects.map((project: UniverseProjectOption) =>")
s = s.replace("projects.map((project, index) =>", "projects.map((project: UniverseProject, index: number) =>")
s = s.replace("projects.map((project) => project.id)", "projects.map((project: UniverseProject) => project.id)")
s = s.replace("projects.map((project) => (", "projects.map((project: UniverseProject) => (")
p.write_text(s)

print("Song Universe TypeScript fixes applied")
