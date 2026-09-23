from pathlib import Path

# Shared serializable contracts + Zod inference.
p = Path("src/lib/song-universe.shared.ts")
s = p.read_text()
s = s.replace("  contextSnapshot: Record<string, unknown>;", "  contextSnapshot: SongUniverseContextSnapshot | null;")
s = s.replace(
    "export const songUniverseAnalysisSchema: z.ZodType<SongUniverseAnalysis> = z.object({",
    "export const songUniverseAnalysisSchema = z.object({",
)
p.write_text(s)

# Server functions: serializable snapshots and bracket access for dynamic objects.
p = Path("src/lib/song-universe.functions.ts")
s = p.read_text()
if "songUniverseContextSnapshotSchema" not in s.split('from "@/lib/song-universe.shared";')[0]:
    s = s.replace(
        "  songUniverseCreativeBibleSchema,\n",
        "  songUniverseContextSnapshotSchema,\n  songUniverseCreativeBibleSchema,\n",
        1,
    )
s = s.replace(
    '    contextSnapshot:\n      row.context_snapshot && typeof row.context_snapshot === "object" ? row.context_snapshot : {},',
    '    contextSnapshot: (() => {\n      const parsed = songUniverseContextSnapshotSchema.safeParse(row.context_snapshot);\n      return parsed.success ? parsed.data : null;\n    })(),',
)
for old, new in {
    "changes.title = data.title;": 'changes["title"] = data.title;',
    "changes.description = data.description;": 'changes["description"] = data.description;',
    "changes.universe_type = data.universeType;": 'changes["universe_type"] = data.universeType;',
    "changes.status = data.status;": 'changes["status"] = data.status;',
    "changes.creative_bible = data.creativeBible;": 'changes["creative_bible"] = data.creativeBible;',
    "changes.initial_direction = data.initialDirection;": 'changes["initial_direction"] = data.initialDirection;',
    "changes.universe_role = data.universeRole;": 'changes["universe_role"] = data.universeRole;',
    "changes.project_status = data.projectStatus;": 'changes["project_status"] = data.projectStatus;',
    "changes.intentional_outlier = data.intentionalOutlier;": 'changes["intentional_outlier"] = data.intentionalOutlier;',
}.items():
    s = s.replace(old, new)
p.write_text(s)

# Inspiration panel: explicit wall type.
p = Path("src/components/promptbeats/SongUniverseInspirationPanel.tsx")
s = p.read_text()
if "type UniverseWall =" not in s:
    anchor = '} from "@/lib/song-universe-inspiration.functions";\n'
    type_def = '''\n\ntype UniverseWall = {
  id: string;
  title: string;
  description: string | null;
  universeId: string | null;
  connectedProjectId: string | null;
  updatedAt: string;
};
'''
    s = s.replace(anchor, anchor + type_def, 1)
s = s.replace(".filter((wall) => wall.universeId === universeId)", ".filter((wall: UniverseWall) => wall.universeId === universeId)")
s = s.replace(".filter((wall) => !wall.universeId)", ".filter((wall: UniverseWall) => !wall.universeId)")
s = s.replace("linked.map((wall) =>", "linked.map((wall: UniverseWall) =>")
s = s.replace("available.slice(0, 12).map((wall) =>", "available.slice(0, 12).map((wall: UniverseWall) =>")
p.write_text(s)

# Route: correct feature hook property and explicit project types.
p = Path("src/routes/song-universe.tsx")
s = p.read_text()
s = s.replace("if (access.loading)", "if (access.isLoading)")
if "type UniverseProject =" not in s:
    anchor = "export const Route = createFileRoute(\"/song-universe\")({ component: SongUniversePage });\n\n"
    alias = '''type UniverseProject = Awaited<ReturnType<typeof getSongUniverse>>["projects"][number];
type UniverseProjectOption = { id: string; name: string; updatedAt: string; linked: boolean };

'''
    if anchor not in s:
        raise SystemExit("missing Song Universe route alias anchor")
    s = s.replace(anchor, anchor + alias, 1)
s = s.replace(".filter((project) => !project.linked)", ".filter((project: UniverseProjectOption) => !project.linked)")
s = s.replace("availableProjects.map((project) =>", "availableProjects.map((project: UniverseProjectOption) =>")
s = s.replace("projects.map((project, index) =>", "projects.map((project: UniverseProject, index: number) =>")
s = s.replace("projects.map((project) => project.id)", "projects.map((project: UniverseProject) => project.id)")
s = s.replace("projects.map((project) => (", "projects.map((project: UniverseProject) => (")
p.write_text(s)

print("Song Universe TypeScript fixes applied")
