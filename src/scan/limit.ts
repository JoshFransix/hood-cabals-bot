/** Sliding one-minute window per user. */
export class RateLimiter {
  private hits = new Map<number, number[]>();

  /** Returns seconds to wait, or 0 if the action is allowed (and counts it). */
  take(userId: number, perMinute: number, now = Date.now()): number {
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) {
      this.hits.set(userId, recent);
      return Math.ceil((60_000 - (now - recent[0]!)) / 1000);
    }
    recent.push(now);
    this.hits.set(userId, recent);
    return 0;
  }
}
