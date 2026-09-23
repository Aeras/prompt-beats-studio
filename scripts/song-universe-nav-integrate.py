from pathlib import Path

p = Path('src/components/promptbeats/AppShell.tsx')
s = p.read_text()
s = s.replace('  storyMap: "/story-map",\n  library: "/library",', '  storyMap: "/story-map",\n  songUniverse: "/song-universe",\n  library: "/library",')
s = s.replace('    "musicLab" | "songAnalyzer" | "lyricsReview" | "inspirationWall" | "storyMap" | "management"', '    "musicLab" | "songAnalyzer" | "lyricsReview" | "inspirationWall" | "storyMap" | "songUniverse" | "management"')
s = s.replace('  if (pathname.startsWith("/story-map")) return "storyMap";\n  if (pathname.startsWith("/generate"))', '  if (pathname.startsWith("/story-map")) return "storyMap";\n  if (pathname.startsWith("/song-universe")) return "songUniverse";\n  if (pathname.startsWith("/generate"))')
p.write_text(s)
