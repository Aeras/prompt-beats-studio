export type HomeVersionCandidate = {
  id: string;
  project_id: string | null;
  version_number: number | null;
  version_label: string | null;
  created_at: string;
};

export type HomeProjectCandidate = {
  id: string;
  name: string;
};

export type HomeRecentProject = {
  projectId: string;
  projectName: string;
  versionId: string;
  versionNumber: number;
  versionLabel: string | null;
  versionCreatedAt: string;
};

export function selectHomeRecentProject(
  versionCandidates: readonly HomeVersionCandidate[],
  projectCandidates: readonly HomeProjectCandidate[],
): HomeRecentProject | null {
  const projects = new Map(projectCandidates.map((project) => [project.id, project]));
  const ordered = [...versionCandidates].sort((a, b) => {
    const byCreatedAt = b.created_at.localeCompare(a.created_at);
    return byCreatedAt !== 0 ? byCreatedAt : b.id.localeCompare(a.id);
  });

  for (const version of ordered) {
    if (!version.project_id || version.version_number == null) continue;
    const project = projects.get(version.project_id);
    if (!project) continue;
    return {
      projectId: project.id,
      projectName: project.name,
      versionId: version.id,
      versionNumber: version.version_number,
      versionLabel: version.version_label,
      versionCreatedAt: version.created_at,
    };
  }

  return null;
}
