from pathlib import Path

path = Path("src/components/promptbeats/InspirationWallDirectionPanel.tsx")
s = path.read_text()

props_anchor = '''type Props = {
  wall: InspirationWallRecord;
  trackLinks: InspirationWallTrackLinkRecord[];
  language: "en" | "el";
  onRefresh: () => Promise<void>;
};
'''
types = '''type Props = {
  wall: InspirationWallRecord;
  trackLinks: InspirationWallTrackLinkRecord[];
  language: "en" | "el";
  onRefresh: () => Promise<void>;
};

type ConnectionProject = {
  id: string;
  name: string;
};

type ConnectionTrack = {
  id: string;
  title: string;
  coverUrl: string | null;
  isPublished: boolean;
  durationSeconds: number | null;
};
'''
if "type ConnectionProject" not in s:
    if props_anchor not in s:
        raise RuntimeError("Props anchor missing")
    s = s.replace(props_anchor, types, 1)

s = s.replace(
    "(options.data?.projects ?? []).map((project) => (",
    "(options.data?.projects ?? []).map((project: ConnectionProject) => (",
    1,
)
s = s.replace(
    "(options.data?.tracks ?? []).map((track) => {",
    "(options.data?.tracks ?? []).map((track: ConnectionTrack) => {",
    1,
)
path.write_text(s)
