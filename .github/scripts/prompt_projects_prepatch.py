from pathlib import Path
import re

path = Path('.github/scripts/prompt_projects_patch.py')
text = path.read_text()
text, count = re.subn(
    r'# 5\) Generator loads standalone bases.*?# 6\) Library UX:',
    '# 5) Generator changes are applied by the follow-up helper.\n\n# 6) Library UX:',
    text,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'expected one generator patch section, got {count}')
path.write_text(text)
