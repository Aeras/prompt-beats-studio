import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isPb012DefaultDocumentEntry } from "./pb012-entry";

const source = (path: string) => readFileSync(path, "utf8");

function boundary(originalPath = "/", currentPath = originalPath) {
  const code = ts.transpileModule(
    source("src/components/promptbeats/Pb012DefaultEntryBoundary.tsx"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  const values: unknown[] = [];
  const effects: Array<{
    deps: unknown[];
    run: () => (() => void) | void;
    cleanup?: (() => void) | undefined;
  }> = [];
  let cursor = 0;
  let dirty = false;
  let authenticated = true;
  let resolveCount = 0;
  let complete!: (route: { to: string }) => void;
  const pending = new Promise<{ to: string }>((resolve) => {
    complete = resolve;
  });
  const navigations: unknown[] = [];
  const navigate = async (route: { to: string }) => {
    navigations.push(route);
  };
  const location = { href: `https://test.example${currentPath}` };
  const exports: { Pb012DefaultEntryBoundary?: (props: { children: string }) => unknown } = {};
  runInNewContext(code, {
    exports,
    URL,
    window: { location },
    performance: {
      getEntriesByType: () => [{ name: `https://test.example${originalPath}`, type: "navigate" }],
    },
    require: (name: string) => {
      if (name === "react")
        return {
          useState: (initial: unknown) => {
            const i = cursor++;
            if (!(i in values)) values[i] = initial;
            return [
              values[i],
              (next: unknown) => {
                if (values[i] !== next) {
                  values[i] = next;
                  dirty = true;
                }
              },
            ];
          },
          useRef: (initial: unknown) => {
            const i = cursor++;
            if (!(i in values)) values[i] = { current: initial };
            return values[i];
          },
          useEffect: (run: () => (() => void) | void, deps: unknown[]) => {
            const i = cursor++;
            const previous = effects[i];
            if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
              previous?.cleanup?.();
              effects[i] = { deps, run };
              pendingEffects.push(i);
            }
          },
        };
      if (name === "react/jsx-runtime")
        return { jsx: (type: unknown, props: unknown) => ({ type, props }), Fragment: "fragment" };
      if (name.includes("react-router")) return { useNavigate: () => navigate };
      if (name.includes("useAuth"))
        return {
          useAuth: () => ({ user: authenticated ? { id: "owner" } : null, loading: false }),
        };
      if (name.includes("pb012-entry"))
        return {
          isPb012DefaultDocumentEntry,
          resolvePb012EntryRoute: () => {
            resolveCount++;
            return pending;
          },
        };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const pendingEffects: number[] = [];
  function render() {
    let attempts = 0;
    do {
      dirty = false;
      cursor = 0;
      exports.Pb012DefaultEntryBoundary!({ children: "Home" });
      for (const i of pendingEffects.splice(0))
        effects[i]!.cleanup = effects[i]!.run() || undefined;
      if (++attempts > 10) throw new Error("Render loop");
    } while (dirty);
  }
  return {
    render,
    complete,
    navigations,
    location,
    resolveCount: () => resolveCount,
    signOut: () => {
      authenticated = false;
      render();
    },
    strictReplay: () => {
      for (const effect of effects) effect?.cleanup?.();
      for (const effect of effects) if (effect) effect.cleanup = effect.run() || undefined;
      render();
    },
  };
}

describe("PB-012 integration boundaries", () => {
  test("document entry survives StrictMode replay without duplicate redirects", async () => {
    const app = boundary();
    app.render();
    app.strictReplay();
    app.complete({ to: "/discover" });
    await Promise.resolve();
    expect(app.navigations).toHaveLength(1);
  });

  test("a deep-link document later visiting Home does not apply the default", () => {
    const app = boundary("/library?tab=prompts&project=bad", "/");
    app.render();
    expect(app.resolveCount()).toBe(0);
  });

  test("late preference responses cannot override user navigation or sign-out", async () => {
    for (const cancel of ["navigate", "signout"]) {
      const app = boundary();
      app.render();
      if (cancel === "navigate") app.location.href = "https://test.example/create";
      else app.signOut();
      app.complete({ to: "/discover" });
      await Promise.resolve();
      expect(app.navigations).toHaveLength(0);
    }
  });

  test("auth and onboarding use the resolver without removing recovery or mandatory onboarding", () => {
    const auth = source("src/routes/auth.tsx");
    const onboarding = source("src/routes/onboarding.tsx");
    expect(auth.match(/resolvePb012EntryRoute\(next\)/g)).toHaveLength(3);
    expect(onboarding).toContain("resolvePb012EntryRoute(next)");
    expect(auth).toContain('navigate({ to: "/onboarding", search: next ? { next } : {} })');
    expect(auth).toContain('event === "PASSWORD_RECOVERY"');
    expect(auth).toContain("active && !recoveryInUrl");
    expect(auth).toContain("authCallbackUrl(window.location.origin, next)");
    expect(auth.match(/: `\$\{window.location.origin\}\/auth`/g)).toHaveLength(2);
  });

  test("exact destinations are captured only after matching successful owned query settlement", () => {
    for (const [file, checks] of [
      [
        "song-universe",
        [
          "selected.isSuccess",
          "!selected.isFetching",
          "selected.data?.universe.id === selectedId",
          'status !== "archived"',
        ],
      ],
      [
        "story-map",
        ["mapQuery.isSuccess", "!mapQuery.isFetching", "mapQuery.data?.storyMap.id === selectedId"],
      ],
      [
        "inspiration-wall",
        ["wall.isSuccess", "!wall.isFetching", "wall.data?.wall.id === selectedWallId"],
      ],
    ] as const) {
      const route = source(`src/routes/${file}.tsx`);
      expect(route).toContain("usePb012LastWork");
      for (const check of checks) expect(route).toContain(check);
    }
    const library = source("src/routes/library.tsx");
    expect(library).toContain('projectSelection.mode === "valid"');
    expect(library).toContain("projects.isSuccess");
    expect(library).toContain("!projects.isFetching");
    expect(library).toContain("project.id === projectSelection.id");
    expect(library).toContain('type: "project", id: settledProject.id');
    expect(source("src/components/promptbeats/PlaylistLibraryPanel.tsx")).toContain(
      "playlists.isSuccess && !playlists.isFetching",
    );
  });

  test("PWA background/close flushes only Last Work and never triggers an entry redirect", () => {
    const writer = source("src/lib/pb012-last-work.ts");
    expect(writer).toContain('window.addEventListener("pagehide"');
    expect(writer).toContain('document.addEventListener("visibilitychange"');
    expect(writer).toContain('document.visibilityState === "hidden"');
    expect(writer).not.toContain("navigate(");
    expect(writer).not.toContain("localStorage");
    expect(writer).not.toContain("sessionStorage");
  });
});
