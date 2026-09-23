from pathlib import Path

types = Path("src/integrations/supabase/types.ts")
text = types.read_text()
row_anchor = '''      saved_prompts: {
        Row: {
          created_at: string;
'''
row_new = '''      saved_prompts: {
        Row: {
          branch_label: string | null;
          created_at: string;
'''
if row_anchor in text:
    text = text.replace(row_anchor, row_new, 1)
elif row_new not in text:
    raise SystemExit("saved_prompts Row anchor not found")
start = text.index("      saved_prompts: {")
end = text.index("      song_analyses: {", start)
prefix, block, suffix = text[:start], text[start:end], text[end:]
insert_anchor = '''        Insert: {
          created_at?: string;
          custom_name?: string | null;
'''
insert_new = '''        Insert: {
          branch_label?: string | null;
          created_at?: string;
          custom_name?: string | null;
'''
if insert_anchor in block:
    block = block.replace(insert_anchor, insert_new, 1)
elif insert_new not in block:
    raise SystemExit("saved_prompts Insert anchor not found")
update_anchor = '''        Update: {
          created_at?: string;
          custom_name?: string | null;
'''
update_new = '''        Update: {
          branch_label?: string | null;
          created_at?: string;
          custom_name?: string | null;
'''
if update_anchor in block:
    block = block.replace(update_anchor, update_new, 1)
elif update_new not in block:
    raise SystemExit("saved_prompts Update anchor not found")
text = prefix + block + suffix
types.write_text(text)

path = Path("src/lib/ai.functions.ts")
text = path.read_text()
casted = '''    const { data: rows, error } = await (context.supabase.from("saved_prompts") as any)
      .select(
        "id, title, custom_name, version_number, version_label, parent_prompt_id, branch_label, version_change_metadata, version_user_note, created_at",
      )
'''
typed = '''    const { data: rows, error } = await context.supabase
      .from("saved_prompts")
      .select(
        "id, title, custom_name, version_number, version_label, parent_prompt_id, branch_label, version_change_metadata, version_user_note, created_at",
      )
'''
if casted in text:
    text = text.replace(casted, typed, 1)
elif typed not in text:
    raise SystemExit("Branch-aware Project Version History select not found")
path.write_text(text)
