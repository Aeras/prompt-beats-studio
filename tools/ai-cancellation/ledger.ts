/**
 * Crash-safe reservation ledger for the AI cancellation harness.
 *
 * - Every billable provider request is RESERVED (durably written) BEFORE dispatch.
 * - Writes are atomic: write temp file, fsync, rename over the ledger.
 * - A lock file (O_EXCL) blocks concurrent harness runs. A stale lock is never
 *   removed automatically; an operator must inspect and delete it manually.
 * - A reservation without a completed result is treated as possibly billed and
 *   permanently blocks that mode from being dispatched again.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { ModeId, ModeResult } from "./harness";

export type Reservation = {
  reservationId: string;
  mode: ModeId;
  reservedAt: string;
  worstCaseCostUsd: number;
  state: "reserved" | "completed";
  completedAt: string | null;
  result: ModeResult | null;
};

export type LedgerData = { version: 2; reservations: Reservation[] };

export interface Ledger {
  read(): LedgerData;
  /** Must durably persist before returning; throws on failure. */
  write(data: LedgerData): void;
  acquireLock(): void;
  releaseLock(): void;
}

const empty = (): LedgerData => ({ version: 2, reservations: [] });

export class FileLedger implements Ledger {
  private locked = false;
  constructor(
    private readonly path: string,
    private readonly lockPath = `${path}.lock`,
  ) {}

  read(): LedgerData {
    if (!existsSync(this.path)) return empty();
    const parsed = JSON.parse(readFileSync(this.path, "utf8")) as LedgerData;
    if (parsed?.version !== 2 || !Array.isArray(parsed.reservations))
      throw new Error("Ledger format not recognised; refusing to continue.");
    return parsed;
  }

  write(data: LedgerData): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify(data, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.path);
  }

  acquireLock(): void {
    mkdirSync(dirname(this.lockPath), { recursive: true });
    let fd: number;
    try {
      fd = openSync(this.lockPath, "wx");
    } catch {
      throw new Error(
        "Another harness run holds the lock (or a previous run crashed). Inspect the ledger, then remove the lock file manually.",
      );
    }
    writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    fsyncSync(fd);
    closeSync(fd);
    this.locked = true;
  }

  releaseLock(): void {
    if (this.locked && existsSync(this.lockPath)) unlinkSync(this.lockPath);
    this.locked = false;
  }
}

/** In-memory ledger for offline tests and dry runs. */
export class MemoryLedger implements Ledger {
  data: LedgerData = empty();
  locked = false;
  failWrites = false;
  read() {
    return structuredClone(this.data);
  }
  write(d: LedgerData) {
    if (this.failWrites) throw new Error("ledger write failed");
    this.data = structuredClone(d);
  }
  acquireLock() {
    if (this.locked) throw new Error("Another harness run holds the lock.");
    this.locked = true;
  }
  releaseLock() {
    this.locked = false;
  }
}
