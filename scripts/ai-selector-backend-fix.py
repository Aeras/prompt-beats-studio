from pathlib import Path

p = Path("src/lib/song-universe-ai.functions.ts")
s = p.read_text()


def once(old: str, new: str, label: str) -> None:
    global s
    if old not in s:
        raise SystemExit(f"missing anchor: {label}")
    s = s.replace(old, new, 1)


anchor = "});\n\nconst CREATIVE_BIBLE_SYSTEM"
if "type SongUniverseProjectFit" not in s:
    once(
        anchor,
        "});\ntype SongUniverseProjectFit = z.infer<typeof projectFitSchema>;\n\nconst CREATIVE_BIBLE_SYSTEM",
        "project fit type",
    )

s = s.replace("requestedModel: data.model,", "requestedModel: data.model ?? null,")

needle = "runStructured({"
positions = []
start = 0
while True:
    index = s.find(needle, start)
    if index < 0:
        break
    positions.append(index)
    start = index + len(needle)
if len(positions) < 4:
    raise SystemExit(f"expected at least 4 runStructured calls, found {len(positions)}")

replacements = [
    "runStructured<SongUniverseCreativeBible>({",
    "runStructured<SongUniverseCreativeBible>({",
    "runStructured<SongUniverseAnalysis>({",
    "runStructured<SongUniverseProjectFit>({",
]
offset = 0
for position, replacement in zip(positions[:4], replacements):
    position += offset
    s = s[:position] + replacement + s[position + len(needle) :]
    offset += len(replacement) - len(needle)

once(
    "    return result;\n  });\n\nconst refineBibleInput",
    "    return {\n      creativeBible: result.value,\n      model: result.model,\n      provider: result.provider,\n      modelLabel: result.modelLabel,\n    };\n  });\n\nconst refineBibleInput",
    "generate response",
)
once(
    "    return result;\n  });\n\nconst continuityInput",
    "    return {\n      creativeBible: result.value,\n      model: result.model,\n      provider: result.provider,\n      modelLabel: result.modelLabel,\n    };\n  });\n\nconst continuityInput",
    "refine response",
)
once(
    'await context.supabase.from("song_universe_ai_analyses").insert({',
    'await (context.supabase as any).from("song_universe_ai_analyses").insert({',
    "analysis insert typing",
)
once(
    "    return result;\n  });\n\nconst projectFitInput",
    "    return {\n      analysis: result.value,\n      model: result.model,\n      provider: result.provider,\n      modelLabel: result.modelLabel,\n    };\n  });\n\nconst projectFitInput",
    "continuity response",
)
once(
    "    return runStructured<SongUniverseProjectFit>({",
    "    const result = await runStructured<SongUniverseProjectFit>({",
    "fit await",
)
once(
    '      operation: "universe_project_fit",\n    });\n  });\n\nexport const getLatestSongUniverseContinuity',
    '      operation: "universe_project_fit",\n    });\n    return {\n      fit: result.value,\n      model: result.model,\n      provider: result.provider,\n      modelLabel: result.modelLabel,\n    };\n  });\n\nexport const getLatestSongUniverseContinuity',
    "fit response",
)
once(
    'const { data: row, error } = await context.supabase\n      .from("song_universe_ai_analyses")',
    'const { data: row, error } = await (context.supabase as any)\n      .from("song_universe_ai_analyses")',
    "latest analysis typing",
)
once(
    "    if (error) throw new Error(error.message);\n    return { analysis: row ?? null };\n  });",
    '    if (error) throw new Error(error.message);\n    if (!row) return { analysis: null, model: null, createdAt: null };\n    return {\n      analysis: songUniverseAnalysisSchema.parse(row.result),\n      model: typeof row.model === "string" ? row.model : null,\n      createdAt: typeof row.created_at === "string" ? row.created_at : null,\n    };\n  });',
    "latest analysis response",
)

p.write_text(s)
print("patched Song Universe AI contracts")
