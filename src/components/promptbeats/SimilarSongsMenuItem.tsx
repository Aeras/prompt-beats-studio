import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sparkles } from "lucide-react";

import { useI18n } from "@/i18n";
import { SimilarSongsDialog } from "@/components/promptbeats/SimilarSongsDialog";

export function SimilarSongsMenuItem({
  trackId,
  trackTitle,
}: {
  trackId: string;
  trackTitle: string;
}) {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const label = language === "el" ? "Παρόμοια τραγούδια" : "Similar songs";

  return (
    <>
      <DropdownMenu.Item
        onSelect={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
      >
        <Sparkles className="h-4 w-4" /> {label}
      </DropdownMenu.Item>
      <SimilarSongsDialog
        trackId={trackId}
        trackTitle={trackTitle}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
