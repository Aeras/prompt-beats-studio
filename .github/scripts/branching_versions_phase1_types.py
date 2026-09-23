from pathlib import Path

path = Path("src/lib/ai.functions.ts")
text = path.read_text()
old = '''    const { data: rows, error } = await context.supabase
      .from("saved_prompts")
      .select(
        "id, title, custom_name, version_number, version_label, parent_prompt_id, branch_label, version_change_metadata, version_user_note, created_at",
      )
'''
new = '''    const { data: rows, error } = await (context.supabase.from("saved_prompts") as any)
      .select(
        "id, title, custom_name, version_number, version_label, parent_prompt_id, branch_label, version_change_metadata, version_user_note, created_at",
      )
'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Branch-aware Project Version History select not found")
path.write_text(text)
