from pathlib import Path

p = Path("src/routes/song-universe.tsx")
s = p.read_text()
formatted = '''      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-lg font-bold">
          {el ? "Τραγούδια / Projects" : "Songs / Projects"}
        </h2>'''
compact = '''      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-lg font-bold">{el ? "Τραγούδια / Projects" : "Songs / Projects"}</h2>'''
if "function UniverseAiPanel(" not in s:
    if formatted not in s and compact not in s:
        raise SystemExit("missing Song Universe projects section anchor")
    if formatted in s:
        s = s.replace(formatted, compact, 1)
p.write_text(s)
