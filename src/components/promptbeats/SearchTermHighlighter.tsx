import { useEffect } from "react";

const HIGHLIGHT_NAME = "promptbeats-search-match";
const MAX_RANGES = 400;

type HighlightRegistryLike = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

type HighlightConstructor = new (...ranges: Range[]) => unknown;
type WindowWithHighlight = typeof window & { Highlight?: HighlightConstructor };

export function searchHighlightTerms(query: string): string[] {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) return [];

  const tokens = trimmed.split(" ").filter((token) => token.length >= 2);
  return Array.from(new Set([trimmed, ...tokens])).sort((a, b) => b.length - a.length);
}

function looksLikeSearchInput(input: HTMLInputElement): boolean {
  if (input.type === "search" || input.name === "q") return true;
  const hint = `${input.placeholder} ${input.getAttribute("aria-label") ?? ""}`.toLocaleLowerCase();
  return hint.includes("search") || hint.includes("αναζήτ");
}

function initialQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function rangesForQuery(root: HTMLElement, query: string): Range[] {
  const terms = searchHighlightTerms(query);
  if (!terms.length) return [];

  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest(
          "script, style, input, textarea, select, option, [contenteditable='true'], [data-pb-no-search-highlight]",
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode();
  while (node && ranges.length < MAX_RANGES) {
    const text = node.nodeValue ?? "";
    const lowered = text.toLocaleLowerCase();
    const occupied: Array<[number, number]> = [];

    for (const term of terms) {
      const needle = term.toLocaleLowerCase();
      let from = 0;
      while (from < lowered.length && ranges.length < MAX_RANGES) {
        const start = lowered.indexOf(needle, from);
        if (start < 0) break;
        const end = start + needle.length;
        const overlaps = occupied.some(([a, b]) => start < b && end > a);
        if (!overlaps) {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          ranges.push(range);
          occupied.push([start, end]);
        }
        from = Math.max(end, start + 1);
      }
    }

    node = walker.nextNode();
  }

  return ranges;
}

export function SearchTermHighlighter() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof CSS === "undefined") return;

    const registry = (CSS as typeof CSS & { highlights?: HighlightRegistryLike }).highlights;
    const HighlightCtor = (window as WindowWithHighlight).Highlight;
    if (!registry || !HighlightCtor) return;

    const root = document.querySelector<HTMLElement>("[data-pb-search-highlight-root]");
    if (!root) return;

    let query = initialQuery();
    let frame = 0;

    const render = () => {
      frame = 0;
      registry.delete(HIGHLIGHT_NAME);
      const ranges = rangesForQuery(root, query);
      if (ranges.length) registry.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges));
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };

    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !looksLikeSearchInput(target)) return;
      query = target.value;
      schedule();
    };

    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !looksLikeSearchInput(target)) return;
      query = target.value || initialQuery();
      schedule();
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onFocus, true);
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    schedule();

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusin", onFocus, true);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      registry.delete(HIGHLIGHT_NAME);
    };
  }, []);

  return (
    <style>{`
      ::highlight(${HIGHLIGHT_NAME}) {
        background: rgb(34 211 238 / 0.95);
        color: #041014;
        text-shadow: none;
      }
    `}</style>
  );
}
