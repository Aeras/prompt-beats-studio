from pathlib import Path

path = Path("scripts/story-map-integrate-v4.py")
text = path.read_text()
old = r'.join("\n")}`'
new = r'.join("\\n")}`'
if old not in text:
    raise SystemExit("join newline escape anchor not found")
path.write_text(text.replace(old, new, 1))
print("Story Map integration escape fixed")
