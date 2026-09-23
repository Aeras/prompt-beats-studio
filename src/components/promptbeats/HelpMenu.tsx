import { useState } from "react";
import { Link } from "@tanstack/react-router";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CircleHelp, Copyright, FileText, LifeBuoy, Mail, ShieldCheck } from "lucide-react";

import { useI18n } from "@/i18n";

export function HelpMenu() {
  const { language } = useI18n();
  const el = language === "el";
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={el ? "Βοήθεια και επικοινωνία" : "Help and contact"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
        >
          <CircleHelp className="h-5 w-5" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="glass-strong z-50 w-[300px] rounded-2xl border border-white/10 p-2 shadow-2xl shadow-black/50"
        >
          <div className="px-3 pb-2 pt-1">
            <p className="font-display text-sm font-bold">
              {el ? "Βοήθεια & Πληροφορίες" : "Help & Information"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {el
                ? "Υποστήριξη και νομικές πληροφορίες PromptBeats"
                : "PromptBeats support and legal information"}
            </p>
          </div>

          <Link
            to="/help"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            <LifeBuoy className="h-4 w-4 shrink-0" />
            <span>{el ? "Βοήθεια" : "Help"}</span>
          </Link>

          <Link
            to="/contact"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            <Mail className="h-4 w-4 shrink-0" />
            <span>{el ? "Επικοινωνία" : "Contact Us"}</span>
          </Link>

          <div className="my-1 h-px bg-white/10" />

          <Link
            to="/terms"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>{el ? "Όροι Χρήσης" : "Terms of Use"}</span>
          </Link>

          <Link
            to="/privacy"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>{el ? "Πολιτική Απορρήτου" : "Privacy Policy"}</span>
          </Link>

          <Link
            to="/copyright-ip"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            <Copyright className="h-4 w-4 shrink-0" />
            <span>{el ? "Copyright / Πνευματική Ιδιοκτησία" : "Copyright / IP Policy"}</span>
          </Link>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
