import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sparkles } from "lucide-react";

import { useI18n } from "@/i18n";

/** Menu item only: the owning TrackCard keeps the dialog mounted after menu dismissal. */
export function SimilarSongsMenuItem({ onOpen }: { onOpen: () => void }) {
  const { language } = useI18n();
  const label = language === "el" ? "Παρόμοια τραγούδια" : "Similar songs";

  return (
    <DropdownMenu.Item
      onSelect={onOpen}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
    >
      <Sparkles className="h-4 w-4" /> {label}
    </DropdownMenu.Item>
  );
}
