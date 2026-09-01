/* ============================================================
 * Idle asset warmer.
 *
 * Getting into a match is dominated by fetching and decoding the
 * character GLBs. Menus are almost entirely idle, so we spend that
 * time pulling bytes into the HTTP cache ahead of need:
 *
 *   title screen   → warm the gameplay music and, slowly, the roster
 *   character grid → the character under a cursor jumps the queue
 *   locked in      → that model is wanted for sure (highest priority)
 *
 * This only warms the *network* — no parsing, no GPU work, nothing
 * touching the scene — so a speculative guess that turns out wrong
 * costs bandwidth and nothing else. The real loader later reads
 * straight from the browser cache.
 * ============================================================ */

export type WarmPriority = 'idle' | 'likely' | 'certain';

const PRIORITY_RANK: Record<WarmPriority, number> = { idle: 0, likely: 1, certain: 2 };

interface WarmEntry {
  url: string;
  priority: WarmPriority;
  /** monotonically increasing; later requests win ties (most recent dwell) */
  seq: number;
}

/** how many speculative fetches may be in flight at once */
const MAX_CONCURRENT = 2;

/** true when the connection is metered or very slow — don't speculate */
function shouldHoldBack(): boolean {
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
}

type IdleHandle = number;
function onIdle(fn: () => void, timeout = 250): IdleHandle {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) return w.requestIdleCallback(fn, { timeout });
  return window.setTimeout(fn, 60);
}

export class AssetWarmer {
  private queue: WarmEntry[] = [];
  private done = new Set<string>();
  private inFlight = new Set<string>();
  private seq = 0;
  private scheduled = false;
  /** paused while the game is doing foreground loading */
  private paused = false;

  /** queue a URL, or raise the priority of one already queued */
  warm(url: string, priority: WarmPriority = 'idle'): void {
    if (this.done.has(url) || this.inFlight.has(url)) return;
    const existing = this.queue.find((e) => e.url === url);
    if (existing) {
      if (PRIORITY_RANK[priority] >= PRIORITY_RANK[existing.priority]) {
        existing.priority = priority;
        existing.seq = ++this.seq;
      }
      return;
    }
    this.queue.push({ url, priority, seq: ++this.seq });
    this.schedule();
  }

  warmAll(urls: readonly string[], priority: WarmPriority = 'idle'): void {
    for (const u of urls) this.warm(u, priority);
  }

  /** counts for diagnostics/tests */
  stats(): { warmed: number; queued: number; inFlight: number } {
    return { warmed: this.done.size, queued: this.queue.length, inFlight: this.inFlight.size };
  }

  /** has this URL already been pulled into cache? */
  isWarm(url: string): boolean {
    return this.done.has(url);
  }

  /** stop speculating (foreground load in progress); queue is kept */
  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || this.paused) return;
    if (!this.queue.length || this.inFlight.size >= MAX_CONCURRENT) return;
    this.scheduled = true;
    onIdle(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    if (this.paused || shouldHoldBack()) return;
    while (this.inFlight.size < MAX_CONCURRENT && this.queue.length) {
      // highest priority first, then most recently requested
      let bestIdx = 0;
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i];
        const b = this.queue[bestIdx];
        if (PRIORITY_RANK[a.priority] > PRIORITY_RANK[b.priority]
          || (PRIORITY_RANK[a.priority] === PRIORITY_RANK[b.priority] && a.seq > b.seq)) {
          bestIdx = i;
        }
      }
      const entry = this.queue.splice(bestIdx, 1)[0];
      void this.fetchOne(entry.url);
    }
  }

  private async fetchOne(url: string): Promise<void> {
    this.inFlight.add(url);
    try {
      // cache-first: if it is already stored this resolves without traffic
      const res = await fetch(url, { cache: 'force-cache', mode: 'same-origin' });
      // drain the body so the response is actually committed to cache
      if (res.ok) await res.arrayBuffer();
      this.done.add(url);
    } catch {
      // speculative only — a failure just means the real loader will fetch it
    } finally {
      this.inFlight.delete(url);
      // already mid-burst: keep the pipe full rather than waiting for another
      // idle slot between every single asset
      if (!this.paused) this.pump();
      else this.schedule();
    }
  }
}
