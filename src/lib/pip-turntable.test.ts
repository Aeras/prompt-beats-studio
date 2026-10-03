import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  advanceRotation,
  ARM_LENGTH,
  ARM_PIVOT,
  DISC,
  drawPipTurntable,
  needleGeometry,
  playbackProgress,
  PIP_HEIGHT,
  PIP_WIDTH,
  truncatePipText,
} from "./pip-turntable";

describe("PiP-only turntable", () => {
  test("progress uses real audio time and bounds unknown/invalid duration", () => {
    expect(playbackProgress(50, 100)).toBe(0.5);
    expect(playbackProgress(-2, 100)).toBe(0);
    expect(playbackProgress(150, 100)).toBe(1);
    for (const duration of [0, -1, Infinity, NaN]) expect(playbackProgress(10, duration)).toBe(0);
    expect(playbackProgress(NaN, 100)).toBe(0);
  });
  test("needle moves inward with a rigid length and stays clear of label/text", () => {
    let previous = Infinity;
    for (let i = 0; i <= 100; i++) {
      const needle = needleGeometry(i / 100);
      const radius = Math.hypot(needle.x - DISC.x, needle.y - DISC.y);
      expect(radius).toBeLessThanOrEqual(previous + 0.000001);
      expect(radius).toBeGreaterThanOrEqual(179.999);
      expect(radius).toBeLessThan(DISC.radius);
      expect(Math.hypot(needle.x - ARM_PIVOT.x, needle.y - ARM_PIVOT.y)).toBeCloseTo(ARM_LENGTH);
      expect(needle.y).toBeLessThan(700);
      previous = radius;
    }
    expect(needleGeometry(-1)).toEqual(needleGeometry(0));
    expect(needleGeometry(2)).toEqual(needleGeometry(1));
  });
  test("rotation is elapsed-time-based, freezes on pause and continues on resume", () => {
    const angle = advanceRotation(0, 1, true);
    expect(angle).toBeCloseTo(Math.PI / 6);
    expect(advanceRotation(angle, 20, false)).toBe(angle);
    expect(advanceRotation(angle, 1, true)).toBeCloseTo(Math.PI / 3);
    expect(advanceRotation(0, 0.5, true) * 2).toBeCloseTo(angle);
  });
  test("long and multiline titles are safely truncated, preserving Unicode code points", () => {
    const ctx = { measureText: (text: string) => ({ width: Array.from(text).length * 10 }) };
    expect(truncatePipText(ctx as any, "Short title", 200)).toBe("Short title");
    expect(truncatePipText(ctx as any, "one\ntwo", 200)).toBe("one two");
    expect(truncatePipText(ctx as any, "🎵".repeat(100), 40)).toBe("🎵🎵🎵…");
  });
  test("composition draws exactly four supplied assets and two text rows, with one disc/label rotation", () => {
    const draws: unknown[][] = [];
    const texts: unknown[][] = [];
    const rotations: number[] = [];
    const ctx = {
      fillRect() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      rotate: (angle: number) => rotations.push(angle),
      drawImage: (...args: unknown[]) => draws.push(args),
      fillText: (...args: unknown[]) => texts.push(args),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const assets = { shell: {}, vinyl: {}, label: {}, tonearm: {} };
    drawPipTurntable(
      ctx as any,
      assets as any,
      {
        title: "Title",
        creator: "@creator",
        currentTime: 50,
        duration: 100,
        playing: true,
      },
      1.2,
    );
    expect(draws.map((call) => call[0])).toEqual(Object.values(assets));
    expect(rotations).toHaveLength(2);
    expect(rotations[0]).toBe(1.2);
    expect(texts).toEqual([
      ["Title", 600, 750],
      ["@creator", 600, 795],
    ]);
    expect(PIP_WIDTH / PIP_HEIGHT).toBe(4 / 3);
  });
  test("only native hidden video PiP uses renderer; background rendering has no rAF dependency", async () => {
    const hook = await readFile(new URL("../hooks/usePipPlayer.ts", import.meta.url), "utf8");
    const worker = await readFile(new URL("./pip-render.worker.ts", import.meta.url), "utf8");
    const bar = await readFile(
      new URL("../components/promptbeats/PlayerBar.tsx", import.meta.url),
      "utf8",
    );
    expect(hook).toContain("video.requestPictureInPicture()");
    expect(hook).toContain("canvas.captureStream(30)");
    expect(hook).toContain("captureTrack?.requestFrame?.()");
    expect(hook).not.toContain("requestAnimationFrame(");
    expect(worker).toContain("setInterval(");
    expect(worker).toContain("waitingForConsumer");
    expect(worker).toContain("canvas.transferToImageBitmap()");
    expect(hook).toContain("workerRef.current?.terminate()");
    expect(hook).toContain("track.stop()");
    expect(hook).not.toContain("options.art");
    expect(bar.match(/pointer-events-none absolute h-px w-px opacity-0/g)).toHaveLength(2);
  });
  test("worker backpressure, pause/resume and stop lifecycle work without animation frames", async () => {
    const source = await readFile(new URL("./pip-render.worker.ts", import.meta.url), "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    let now = 0;
    let tick: (() => void) | null = null;
    let cleared = false;
    let closed = false;
    const rotations: number[] = [];
    const frames: unknown[] = [];
    const scope = {
      onmessage: (_event: { data: unknown }) => {},
      postMessage: (message: unknown) => frames.push(message),
      close: () => {
        closed = true;
      },
    };
    runInNewContext(code, {
      exports: {},
      require: () => ({
        advanceRotation,
        PIP_WIDTH,
        PIP_HEIGHT,
        drawPipTurntable: (_ctx: unknown, _assets: unknown, _playback: unknown, angle: number) =>
          rotations.push(angle),
      }),
      self: scope,
      performance: { now: () => now },
      setInterval: (callback: () => void) => {
        tick = callback;
        return 1;
      },
      clearInterval: () => {
        cleared = true;
      },
      OffscreenCanvas: class {
        getContext() {
          return {};
        }
        transferToImageBitmap() {
          return {};
        }
      },
    });
    const send = (type: string, playing = true) =>
      scope.onmessage({
        data: {
          type,
          assets: {},
          playback: { title: "Title", creator: "Artist", currentTime: 20, duration: 100, playing },
        },
      });
    const draw = () => {
      now += 1000;
      (tick as unknown as () => void)();
    };
    send("init");
    send("playback");
    draw();
    expect(frames).toHaveLength(1);
    // A timeupdate must not release backpressure before the bitmap was consumed.
    send("playback");
    draw();
    expect(frames).toHaveLength(1);
    send("consumed");
    draw();
    expect(frames).toHaveLength(2);
    send("consumed", false);
    draw();
    expect(rotations[2]).toBe(rotations[1]);
    send("consumed", true);
    draw();
    expect(rotations[3]).not.toBe(rotations[2]);
    send("stop");
    expect(cleared).toBe(true);
    expect(closed).toBe(true);
  });
});
