import { useEffect } from "react";

const HIGHLIGHT_NAME = "promptbeats-search-match";
const MAX_RANGES = 400;
const MAX_VISITED_TEXT_NODES = 2500;
const HIGHLIGHT_DEBOUNCE_MS = 120;

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

  const needles = terms.map((term) => term.toLocaleLowerCase());
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let visitedTextNodes = 0;
  let node = walker.nextNode();

  while (node && ranges.length < MAX_RANGES && visitedTextNodes < MAX_VISITED_TEXT_NODES) {
    visitedTextNodes += 1;
    const parent = node.parentElement;
    const text = node.nodeValue ?? "";

    if (
      parent &&
      text.trim() &&
      !parent.closest(
        "script, style, input, textarea, select, option, [contenteditable='true'], [data-pb-no-search-highlight]",
      )
    ) {
      const lowered = text.toLocaleLowerCase();
      const occupied: Array<[number, number]> = [];

      for (const needle of needles) {
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
    let activeQuery = searchHighlightTerms(query).length > 0;
    let debounceTimer = 0;
    let frame = 0;

    const cancelScheduledRender = () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
        debounceTimer = 0;
      }
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const render = () => {
      frame = 0;
      registry.delete(HIGHLIGHT_NAME);
      if (!activeQuery) return;
      const ranges = rangesForQuery(root, query);
      if (ranges.length) registry.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges));
    };

    const schedule = (delay = HIGHLIGHT_DEBOUNCE_MS) => {
      if (!activeQuery) return;
      cancelScheduledRender();
      debounceTimer = window.setTimeout(() => {
        debounceTimer = 0;
        frame = requestAnimationFrame(render);
      }, delay);
    };

    const updateQuery = (nextQuery: string) => {
      query = nextQuery;
      activeQuery = searchHighlightTerms(query).length > 0;
      if (!activeQuery) {
        cancelScheduledRender();
        registry.delete(HIGHLIGHT_NAME);
        return;
      }
      schedule();
    };

    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !looksLikeSearchInput(target)) return;
      updateQuery(target.value);
    };

    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !looksLikeSearchInput(target)) return;
      updateQuery(target.value || initialQuery());
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onFocus, true);
    const observer = new MutationObserver(() => {
      if (activeQuery) schedule();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    if (activeQuery) schedule(0);

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusin", onFocus, true);
      observer.disconnect();
      cancelScheduledRender();
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
