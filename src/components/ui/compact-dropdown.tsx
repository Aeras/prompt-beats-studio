import { useId, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

export type CompactDropdownOption = {
  value: string;
  label: string;
  secondary?: string | null;
  lang?: string;
  secondaryLang?: string;
  keywords?: string[];
};
type Props = {
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  options: CompactDropdownOption[];
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
};
/** Controlled open state lets the caller coordinate one popover across a filter group. */
export function CompactDropdown({
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  value,
  onValueChange,
  open,
  onOpenChange,
  disabled = false,
}: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = options.find((o) => o.value === value);
  const searchable = options.length >= 8;
  return (
    <Popover open={open && !disabled} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={placeholder}
          aria-expanded={open && !disabled}
          aria-controls={open && !disabled ? id : undefined}
          aria-haspopup="dialog"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              onOpenChange(true);
            }
          }}
          className="h-[42px] w-full min-w-0 justify-between rounded-xl px-3 text-left"
        >
          <span className="truncate" lang={chosen?.lang}>
            {chosen?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {open && !disabled && (
        <PopoverContent
          id={id}
          aria-label={placeholder}
          align="start"
          side="bottom"
          collisionPadding={12}
          className="max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl p-0"
          onCloseAutoFocus={(event) => {
            // Do not steal focus from another dropdown or an outside-click destination.
            event.preventDefault();
          }}
          onEscapeKeyDown={() => trigger.current?.focus()}
        >
          <Command label={searchable ? searchPlaceholder : placeholder}>
            {searchable && (
              <CommandInput
                autoFocus
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
              />
            )}
            <CommandList
              label={placeholder}
              aria-label={placeholder}
              className={
                searchable
                  ? "max-h-[min(280px,calc(var(--radix-popover-content-available-height)-48px))] overscroll-contain"
                  : "max-h-[min(280px,var(--radix-popover-content-available-height))] overscroll-contain"
              }
              tabIndex={searchable ? -1 : 0}
              autoFocus={!searchable}
              onKeyDown={(event) => {
                if (
                  !searchable &&
                  (event.key === "ArrowDown" ||
                    event.key === "ArrowUp" ||
                    event.key === "Home" ||
                    event.key === "End")
                ) {
                  const items = event.currentTarget.querySelectorAll<HTMLElement>(
                    '[cmdk-item]:not([data-disabled="true"])',
                  );
                  const index = [...items].indexOf(document.activeElement as HTMLElement);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? items.length - 1
                        : event.key === "ArrowDown"
                          ? (index + 1) % items.length
                          : index <= 0
                            ? items.length - 1
                            : index - 1;
                  items[next]?.focus();
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, option.secondary ?? "", ...(option.keywords ?? [])]}
                    tabIndex={-1}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onValueChange(option.value);
                        onOpenChange(false);
                        trigger.current?.focus();
                      }
                    }}
                    onSelect={() => {
                      onValueChange(option.value);
                      onOpenChange(false);
                      trigger.current?.focus();
                    }}
                    className="min-h-11 cursor-pointer px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      <span lang={option.lang}>{option.label}</span>
                      {option.secondary && option.secondary !== option.label && (
                        <span
                          lang={option.secondaryLang}
                          className="block text-xs text-muted-foreground"
                        >
                          {option.secondary}
                        </span>
                      )}
                    </span>
                    {value === option.value && <Check aria-hidden="true" className="shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
