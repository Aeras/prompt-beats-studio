type RegisteredProject = {
  id: string;
  name: string;
};

type ProjectBulkSelectionSnapshot = {
  active: boolean;
  visibleProjects: RegisteredProject[];
  selectedIds: string[];
  controllerId: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
const registered = new Map<string, RegisteredProject>();
const selected = new Set<string>();
let active = false;
let snapshot: ProjectBulkSelectionSnapshot = {
  active: false,
  visibleProjects: [],
  selectedIds: [],
  controllerId: null,
};

function rebuildSnapshot() {
  const visibleProjects = Array.from(registered.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const id of Array.from(selected)) {
    if (!registered.has(id)) selected.delete(id);
  }
  if (active && registered.size === 0) active = false;
  snapshot = {
    active,
    visibleProjects,
    selectedIds: Array.from(selected),
    controllerId: visibleProjects[0]?.id ?? null,
  };
  for (const listener of listeners) listener();
}

export function subscribeProjectBulkSelection(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProjectBulkSelectionSnapshot() {
  return snapshot;
}

export function registerBulkSelectableProject(project: RegisteredProject) {
  const existing = registered.get(project.id);
  if (existing?.name === project.name) return () => unregisterBulkSelectableProject(project.id);
  registered.set(project.id, project);
  rebuildSnapshot();
  return () => unregisterBulkSelectableProject(project.id);
}

export function unregisterBulkSelectableProject(projectId: string) {
  if (!registered.delete(projectId)) return;
  selected.delete(projectId);
  rebuildSnapshot();
}

export function activateProjectBulkSelection(projectId?: string) {
  active = true;
  if (projectId && registered.has(projectId)) selected.add(projectId);
  rebuildSnapshot();
}

export function exitProjectBulkSelection() {
  active = false;
  selected.clear();
  rebuildSnapshot();
}

export function toggleProjectBulkSelection(projectId: string) {
  if (!registered.has(projectId)) return;
  active = true;
  if (selected.has(projectId)) selected.delete(projectId);
  else selected.add(projectId);
  rebuildSnapshot();
}

export function selectAllVisibleProjects() {
  active = true;
  for (const id of registered.keys()) selected.add(id);
  rebuildSnapshot();
}

export function clearAllVisibleProjectSelections() {
  selected.clear();
  rebuildSnapshot();
}

export function isProjectBulkSelectionActive() {
  return active;
}

export function projectBulkSelectionIdFromElement(element: Element | null) {
  const article = element?.closest("article");
  const marker = article?.querySelector<HTMLElement>("[data-pb-project-bulk-id]");
  return marker?.dataset.pbProjectBulkId ?? null;
}
