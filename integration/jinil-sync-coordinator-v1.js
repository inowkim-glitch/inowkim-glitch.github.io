/**
 * Jinil V72 integration - sync coordinator (stage 5, non-production).
 * Seoul timezone, 06:00-19:00 inclusive hourly; overnight 22:00, 01:00, 04:00.
 * Attach a validated server transport only after V72 key/button mapping is complete.
 * Never writes to existing Supabase tables without an explicitly supplied transport.
 */
export class JinilSyncCoordinator {
  constructor({ transport, onState = () => {}, clock = () => new Date(), timeZone = "Asia/Seoul" }) {
    if (typeof transport !== "function") throw new TypeError("transport callback required");
    this.transport = transport;
    this.onState = onState;
    this.clock = clock;
    this.timeZone = timeZone;
    this.pending = new Map();
    this.running = null;
    this.timer = null;
    this.lastScheduledMinute = null;
  }

  localParts(date = this.clock()) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.timeZone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    const obj = Object.fromEntries(fmt.formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
    return { day: obj.year + "-" + obj.month + "-" + obj.day, hour: Number(obj.hour), minute: Number(obj.minute) };
  }

  scheduledNow(date = this.clock()) {
    const { hour, minute } = this.localParts(date);
    return minute === 0 && ((hour >= 6 && hour <= 19) || [22, 1, 4].includes(hour));
  }

  tick() {
    const now = this.clock();
    if (!this.scheduledNow(now)) return;
    const p = this.localParts(now);
    const key = p.day + ":" + String(p.hour).padStart(2, "0");
    if (this.lastScheduledMinute === key) return;
    this.lastScheduledMinute = key;
    this.request({ reason: "scheduled", key: "scheduled:" + key });
  }

  start() {
    if (this.timer !== null) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 15000);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  // Call on actual saved/edited/deleted business button actions, not every navigation click.
  request({ reason = "button", key = "manual", payload = null } = {}) {
    this.pending.set(key, { reason, key, payload, requestedAt: this.clock().toISOString() });
    this.onState({ status: "queued", pending: this.pending.size });
    return this.flush();
  }

  async flush() {
    if (this.running) return this.running;
    this.running = (async () => {
      while (this.pending.size) {
        const [key, job] = this.pending.entries().next().value;
        this.pending.delete(key);
        this.onState({ status: "syncing", job, pending: this.pending.size });
        try {
          await this.transport(job); // must confirm durable write and verify response
          this.onState({ status: "synced", job, pending: this.pending.size });
        } catch (error) {
          this.pending.set(key, job); // retain for next online/manual retry
          this.onState({ status: "error", message: String(error?.message ?? error), job });
          break; // no tight retry loop
        }
      }
    })();
    try { await this.running; } finally { this.running = null; }
  }
}
