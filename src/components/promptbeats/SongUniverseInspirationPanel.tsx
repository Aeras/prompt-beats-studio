import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Link2, Unlink } from "lucide-react";

import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import {
  listSongUniverseInspirationWalls,
  setSongUniverseInspirationWall,
} from "@/lib/song-universe-inspiration.functions";

type UniverseWall = {
  id: string;
  title: string;
  description: string | null;
  universeId: string | null;
  connectedProjectId: string | null;
  updatedAt: string;
};

export function SongUniverseInspirationPanel({ universeId }: { universeId: string }) {
  const { language } = useI18n();
  const el = language === "el";
  const access = useFeatureAccess("inspiration_wall");
  const qc = useQueryClient();
  const walls = useQuery({
    queryKey: ["song-universe-inspiration-walls", universeId],
    queryFn: () => listSongUniverseInspirationWalls({ data: { universeId } }),
    enabled: access.allowed,
  });

  if (!access.allowed) return null;
  const linked = (walls.data?.walls ?? []).filter(
    (wall: UniverseWall) => wall.universeId === universeId,
  );
  const available = (walls.data?.walls ?? []).filter((wall: UniverseWall) => !wall.universeId);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["song-universe-inspiration-walls", universeId] });

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Lightbulb className="h-4 w-4 text-accent" />
            {el ? "Συνδεδεμένη έμπνευση" : "Connected Inspiration"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {el
              ? "Σύνδεσε προαιρετικά ένα Inspiration Wall με το συνολικό δημιουργικό κόσμο. Τα Project Walls παραμένουν ανεξάρτητα."
              : "Optionally link an Inspiration Wall to the overall creative world. Project Walls remain independent."}
          </p>
        </div>
        <Link
          to="/inspiration-wall"
          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-accent"
        >
          {el ? "Άνοιγμα Inspiration Wall" : "Open Inspiration Wall"}
        </Link>
      </div>

      {linked.length > 0 && (
        <div className="mt-4 space-y-2">
          {linked.map((wall: UniverseWall) => (
            <div
              key={wall.id}
              className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{wall.title}</div>
                {wall.description && (
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {wall.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  void setSongUniverseInspirationWall({
                    data: { universeId, wallId: wall.id, linked: false },
                  }).then(refresh)
                }
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground"
                title={el ? "Αποσύνδεση" : "Unlink"}
              >
                <Unlink className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {el ? "Διαθέσιμα Walls" : "Available Walls"}
          </div>
          <div className="flex flex-wrap gap-2">
            {available.slice(0, 12).map((wall: UniverseWall) => (
              <button
                key={wall.id}
                type="button"
                onClick={() =>
                  void setSongUniverseInspirationWall({
                    data: { universeId, wallId: wall.id, linked: true },
                  }).then(refresh)
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-accent/40"
              >
                <Link2 className="h-3.5 w-3.5" /> {wall.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {!walls.isLoading && linked.length === 0 && available.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {el
            ? "Δεν υπάρχει διαθέσιμο Inspiration Wall ακόμη."
            : "No Inspiration Wall is available yet."}
        </p>
      )}
    </div>
  );
}
