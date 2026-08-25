import { normalizeStore, STORE_KEY } from "./core.js";

const LOCAL_KEY = `anna-preview:${STORE_KEY}`;
const STORAGE_PREFIX = "decision-room:v2";
const INDEX_KEY = `${STORAGE_PREFIX}:index`;
const STORAGE_VALUE_BUDGET = 220_000;

const decisionKey = (id, part) => `${STORAGE_PREFIX}:decision:${id}:${part}`;

function storageValue(response) {
  return response?.value ?? response?.result?.value ?? response?.result ?? response;
}

function serialized(value) {
  return JSON.stringify(value);
}

function boundedList(value) {
  const items = Array.isArray(value) ? [...value] : [];
  while (items.length && new TextEncoder().encode(serialized(items)).length > STORAGE_VALUE_BUDGET) items.shift();
  return items;
}

function splitDecision(decision) {
  const { analyses, coach, ...core } = decision;
  const parts = { core, analyses: boundedList(analyses), coach: boundedList(coach) };
  const coreSize = new TextEncoder().encode(serialized(core)).length;
  if (coreSize > STORAGE_VALUE_BUDGET) throw new Error("This decision is too large to sync safely. Export it, then shorten its longest evidence notes.");
  return parts;
}

function llmText(response) {
  return response?.content?.text || response?.result?.content?.text || response?.text || "";
}

export class DecisionPlatform {
  constructor() {
    this.anna = null;
    this.connected = false;
    this.storageMode = "device";
    this.persistedIds = new Set();
    this.fingerprints = new Map();
    this.saveQueue = Promise.resolve();
  }

  async connect() {
    try {
      const { AnnaAppRuntime } = await import("/static/anna-apps/_sdk/latest/index.js");
      this.anna = await Promise.race([
        AnnaAppRuntime.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Anna host handshake timed out")), 2500)),
      ]);
      this.connected = true;
      this.storageMode = "anna";
      await this.anna.window.set_title({ title: "Decision Room AI" });
      await this.anna.window.ready?.({});
    } catch {
      this.anna = null;
      this.connected = false;
      this.storageMode = "device";
    }
    return this;
  }

  async load() {
    if (this.anna?.storage?.get) {
      const index = storageValue(await this.anna.storage.get({ key: INDEX_KEY }));
      if (index?.storageVersion === 2 && Array.isArray(index.decisionIds)) {
        const decisions = (await Promise.all(index.decisionIds.map(async (id) => {
          const [core, analyses, coach] = await Promise.all([
            this.anna.storage.get({ key: decisionKey(id, "core") }).then(storageValue),
            this.anna.storage.get({ key: decisionKey(id, "analyses") }).then(storageValue),
            this.anna.storage.get({ key: decisionKey(id, "coach") }).then(storageValue),
          ]);
          if (!core || typeof core !== "object") return null;
          const parts = { core, analyses: Array.isArray(analyses) ? analyses : [], coach: Array.isArray(coach) ? coach : [] };
          for (const [part, value] of Object.entries(parts)) this.fingerprints.set(decisionKey(id, part), serialized(value));
          return { ...core, analyses: parts.analyses, coach: parts.coach };
        }))).filter(Boolean);
        this.persistedIds = new Set(index.decisionIds);
        this.fingerprints.set(INDEX_KEY, serialized(index));
        return normalizeStore({ version: index.version, preferences: index.preferences, decisions });
      }

      const legacy = storageValue(await this.anna.storage.get({ key: STORE_KEY }));
      const migrated = normalizeStore(legacy && typeof legacy === "object" ? legacy : {});
      if (migrated.decisions.length || legacy?.preferences) {
        await this.save(migrated);
        if (this.anna.storage.delete) await this.anna.storage.delete({ key: STORE_KEY }).catch(() => {});
      }
      return migrated;
    }
    try {
      return normalizeStore(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"));
    } catch {
      return normalizeStore({});
    }
  }

  async save(store) {
    const cleanStore = normalizeStore(store);
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.saveClean(cleanStore));
    return this.saveQueue;
  }

  async saveClean(cleanStore) {
    if (this.anna?.storage?.set) {
      const nextIds = new Set(cleanStore.decisions.map((decision) => decision.id));
      for (const decision of cleanStore.decisions) {
        const parts = splitDecision(decision);
        for (const [part, value] of Object.entries(parts)) {
          const key = decisionKey(decision.id, part);
          const fingerprint = serialized(value);
          if (this.fingerprints.get(key) === fingerprint) continue;
          await this.anna.storage.set({ key, value });
          this.fingerprints.set(key, fingerprint);
        }
      }

      const index = {
        storageVersion: 2,
        version: cleanStore.version,
        decisionIds: cleanStore.decisions.map((decision) => decision.id),
        preferences: cleanStore.preferences,
      };
      const indexFingerprint = serialized(index);
      if (this.fingerprints.get(INDEX_KEY) !== indexFingerprint) {
        await this.anna.storage.set({ key: INDEX_KEY, value: index });
        this.fingerprints.set(INDEX_KEY, indexFingerprint);
      }

      for (const id of this.persistedIds) {
        if (nextIds.has(id)) continue;
        for (const part of ["core", "analyses", "coach"]) {
          const key = decisionKey(id, part);
          if (this.anna.storage.delete) await this.anna.storage.delete({ key }).catch(() => {});
          this.fingerprints.delete(key);
        }
      }
      this.persistedIds = nextIds;
      return;
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cleanStore));
  }

  async clear() {
    await this.saveQueue.catch(() => {});
    if (this.anna?.storage?.delete) {
      for (const id of this.persistedIds) {
        for (const part of ["core", "analyses", "coach"]) await this.anna.storage.delete({ key: decisionKey(id, part) }).catch(() => {});
      }
      await this.anna.storage.delete({ key: INDEX_KEY }).catch(() => {});
      await this.anna.storage.delete({ key: STORE_KEY }).catch(() => {});
      this.persistedIds.clear();
      this.fingerprints.clear();
      return;
    }
    localStorage.removeItem(LOCAL_KEY);
  }

  async complete(request) {
    if (!this.anna?.llm?.complete) {
      throw new Error("Open Decision Room AI inside Anna to run AI analysis. Your scoring workspace still works in preview mode.");
    }
    const response = await this.anna.llm.complete(request, { timeoutMs: 180000 });
    const text = llmText(response);
    if (!text) throw new Error("Anna returned an empty analysis. Please retry.");
    return text;
  }
}
