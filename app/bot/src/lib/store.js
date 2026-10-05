// Table Storage state (managed identity, no keys):
//   conversations : PK = Teams conversation ID (encoded), RK = inverted time -> newest first
//   ratelimit     : PK = anonymised user, RK = UTC hour bucket (yyyyMMddHH), count
//   pending       : PK = conversation, RK = "rollback", the action awaiting YES
const { TableClient } = require("@azure/data-tables");
const { getCredential } = require("./credential");

const MAX_TICKS = 9999999999999;
const enc = (s) => Buffer.from(String(s)).toString("base64url"); // table keys can't contain / \ # ?
const hourBucket = (d = new Date()) => d.toISOString().slice(0, 13).replace(/[-T]/g, "");

class TableStore {
  constructor(endpoint) {
    const cred = getCredential();
    this.conversations = new TableClient(endpoint, "conversations", cred);
    this.ratelimit = new TableClient(endpoint, "ratelimit", cred);
    this.pending = new TableClient(endpoint, "pending", cred);
  }

  async loadHistory(conversationId, max) {
    const rows = [];
    const iter = this.conversations.listEntities({
      queryOptions: { filter: `PartitionKey eq '${enc(conversationId)}'` },
    });
    for await (const e of iter) {
      rows.push({ role: e.role, content: e.content });
      if (rows.length >= max) break;
    }
    return rows.reverse(); // oldest -> newest
  }

  async appendHistory(conversationId, messages, max) {
    const pk = enc(conversationId);
    let i = 0;
    for (const m of messages) {
      const rk = String(MAX_TICKS - Date.now()).padStart(13, "0") + `-${i++}`;
      await this.conversations.createEntity({
        partitionKey: pk, rowKey: rk, role: m.role, content: String(m.content).slice(0, 30000),
      });
    }
    // keep only the newest `max` messages for this conversation
    let n = 0;
    for await (const e of this.conversations.listEntities({ queryOptions: { filter: `PartitionKey eq '${pk}'` } })) {
      if (++n > max) await this.conversations.deleteEntity(e.partitionKey, e.rowKey);
    }
  }

  // Fixed-window limit per user per UTC hour, optimistic concurrency on the counter
  async hitRateLimit(userKey, limit) {
    const pk = userKey, rk = hourBucket();
    for (let attempt = 0; attempt < 3; attempt++) {
      let entity;
      try { entity = await this.ratelimit.getEntity(pk, rk); } catch (e) { if (e.statusCode !== 404) throw e; }
      const count = entity ? entity.count : 0;
      if (count >= limit) return { allowed: false, count };
      try {
        if (entity) {
          await this.ratelimit.updateEntity({ partitionKey: pk, rowKey: rk, count: count + 1 }, "Merge", { etag: entity.etag });
        } else {
          const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString(); // TTL marker for cleanup
          await this.ratelimit.createEntity({ partitionKey: pk, rowKey: rk, count: 1, expiresAt });
        }
        return { allowed: true, count: count + 1 };
      } catch (e) {
        if (e.statusCode !== 409 && e.statusCode !== 412) throw e; // lost the race - retry
      }
    }
    return { allowed: true, count: limit };
  }

  async getPending(conversationId) {
    try {
      const e = await this.pending.getEntity(enc(conversationId), "rollback");
      return { appName: e.appName, slot: e.slot, expiresAt: e.expiresAt };
    } catch (e) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  async setPending(conversationId, action) {
    await this.pending.upsertEntity({ partitionKey: enc(conversationId), rowKey: "rollback", ...action }, "Replace");
  }

  async clearPending(conversationId) {
    try { await this.pending.deleteEntity(enc(conversationId), "rollback"); } catch (e) { if (e.statusCode !== 404) throw e; }
  }

  // TTL clean-up (timer function): old counters, expired confirmations, stale history
  async purgeExpired(now = new Date()) {
    let removed = 0;
    const oldHour = hourBucket(new Date(now.getTime() - 2 * 3600 * 1000));
    for await (const e of this.ratelimit.listEntities({ queryOptions: { filter: `RowKey lt '${oldHour}'` } })) {
      await this.ratelimit.deleteEntity(e.partitionKey, e.rowKey); removed++;
    }
    for await (const e of this.pending.listEntities()) {
      if (new Date(e.expiresAt) < now) { await this.pending.deleteEntity(e.partitionKey, e.rowKey); removed++; }
    }
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    for await (const e of this.conversations.listEntities({ queryOptions: { filter: `Timestamp lt datetime'${weekAgo}'` } })) {
      await this.conversations.deleteEntity(e.partitionKey, e.rowKey); removed++;
    }
    return removed;
  }
}

// In-memory implementation for unit tests and local runs without Azure
class MemoryStore {
  constructor() { this.history = new Map(); this.counts = new Map(); this.pendings = new Map(); }
  async loadHistory(c, max) { return (this.history.get(c) || []).slice(-max); }
  async appendHistory(c, msgs, max) { this.history.set(c, [...(this.history.get(c) || []), ...msgs].slice(-max)); }
  async hitRateLimit(u, limit) {
    const k = `${u}|${hourBucket()}`; const n = this.counts.get(k) || 0;
    if (n >= limit) return { allowed: false, count: n };
    this.counts.set(k, n + 1); return { allowed: true, count: n + 1 };
  }
  async getPending(c) { return this.pendings.get(c) || null; }
  async setPending(c, a) { this.pendings.set(c, a); }
  async clearPending(c) { this.pendings.delete(c); }
  async purgeExpired() { return 0; }
}

function createStore(endpoint) {
  return endpoint ? new TableStore(endpoint) : new MemoryStore();
}

module.exports = { createStore, TableStore, MemoryStore, hourBucket, enc };
