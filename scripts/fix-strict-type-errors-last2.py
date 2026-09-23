from pathlib import Path
p = Path("src/lib/library-folders.functions.ts")
text = p.read_text()
old = '''    if (error) throw new Error(error.message);\n    return { results: results ?? [] };\n  });'''
new = '''    if (error) throw new Error(error.message);\n    return {\n      results: (results ?? []) as Array<{\n        item_type: "folder" | "project" | "prompt";\n        item_id: string;\n        folder_id: string | null;\n        name: string;\n        path: string;\n      }>,\n    };\n  });'''
if text.count(old) != 1:
    raise SystemExit(f"unexpected search result return match count: {text.count(old)}")
p.write_text(text.replace(old, new))
print("last strict type fix applied")
