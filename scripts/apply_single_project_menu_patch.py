from pathlib import Path

p = Path('src/routes/library.tsx')
s = p.read_text()
old = '''  const [projectMenuAnchor, setProjectMenuAnchor] = useState<LibraryActionMenuAnchor | null>(null);\n  const [projectActionBusy, setProjectActionBusy] = useState(false);'''
new = '''  const [projectMenuAnchor, setProjectMenuAnchor] = useState<LibraryActionMenuAnchor | null>(null);\n  const [projectActionBusy, setProjectActionBusy] = useState(false);\n\n  useEffect(() => {\n    const closeOtherProjectMenus = (event: Event) => {\n      const detail = (event as CustomEvent<{ promptId: string }>).detail;\n      if (detail?.promptId !== prompt.id) setProjectMenuAnchor(null);\n    };\n    window.addEventListener("pb:project-prompt-menu-open", closeOtherProjectMenus);\n    return () => window.removeEventListener("pb:project-prompt-menu-open", closeOtherProjectMenus);\n  }, [prompt.id]);\n\n  const openProjectMenu = (anchor: LibraryActionMenuAnchor) => {\n    window.dispatchEvent(\n      new CustomEvent("pb:project-prompt-menu-open", { detail: { promptId: prompt.id } }),\n    );\n    setProjectMenuAnchor(anchor);\n  };'''
if old not in s:
    raise SystemExit('state marker not found')
s = s.replace(old, new, 1)
s = s.replace('if (prompt.project_id) setProjectMenuAnchor(point);', 'if (prompt.project_id) openProjectMenu(point);', 1)
s = s.replace('setProjectMenuAnchor({ x: rect.right - 8, y: rect.bottom + 6 });', 'openProjectMenu({ x: rect.right - 8, y: rect.bottom + 6 });', 1)
s = s.replace('if (prompt.project_id) setProjectMenuAnchor(anchor);', 'if (prompt.project_id) openProjectMenu(anchor);', 1)
p.write_text(s)

p = Path('src/components/promptbeats/ProjectPromptActionMenu.tsx')
s = p.read_text()
old = '''      {open && anchor && (\n        <>\n          <button\n            type="button"\n            aria-label={el ? "Κλείσιμο μενού" : "Close menu"}\n            className="fixed inset-0 z-[94] cursor-default bg-transparent"\n            onClick={onClose}\n          />\n          <div\n            ref={menuRef}\n            role="menu"\n            aria-label={el ? `Ενέργειες για ${title}` : `Actions for ${title}`}\n            className="glass-strong fixed z-[95] w-[270px] overflow-hidden rounded-2xl border border-white/10 bg-black/90 p-1.5 shadow-2xl backdrop-blur-xl"\n            style={{ left: position.x, top: position.y }}\n            onClick={(event) => event.stopPropagation()}\n          >\n            <p className="truncate px-3 py-2 text-[11px] font-semibold text-muted-foreground">\n              {title}\n            </p>'''
new = '''      {open && anchor && (\n        <>\n          <button\n            type="button"\n            aria-label={el ? "Κλείσιμο μενού" : "Close menu"}\n            className="fixed inset-0 z-[94] cursor-default bg-black/45 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"\n            onClick={onClose}\n          />\n          <div\n            ref={menuRef}\n            role="menu"\n            aria-label={el ? `Ενέργειες για ${title}` : `Actions for ${title}`}\n            className="glass-strong fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[95] overflow-hidden rounded-2xl border border-white/10 bg-black/95 p-2 shadow-2xl backdrop-blur-xl sm:inset-auto sm:w-[270px] sm:p-1.5"\n            style={\n              typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches\n                ? { left: position.x, top: position.y }\n                : undefined\n            }\n            onClick={(event) => event.stopPropagation()}\n          >\n            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/20 sm:hidden" />\n            <p className="truncate px-3 py-2 text-[11px] font-semibold text-muted-foreground">\n              {title}\n            </p>'''
if old not in s:
    raise SystemExit('menu marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('src/lib/project-version-history.test.ts')
s = p.read_text()
needle = '    expect(menu).toContain("Μετακίνηση σε άλλο Project");\n'
insert = needle + '    expect(menu).toContain("bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]");\n    expect(library).toContain("pb:project-prompt-menu-open");\n'
if needle not in s:
    raise SystemExit('test marker not found')
s = s.replace(needle, insert, 1)
p.write_text(s)
