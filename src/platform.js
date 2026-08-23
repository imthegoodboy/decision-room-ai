import { normalizeStore, STORE_KEY } from "./core.js";

const LOCAL_KEY = `anna-preview:${STORE_KEY}`;

function llmText(response) {
  return response?.content?.text || response?.result?.content?.text || response?.text || "";
}

export class DecisionPlatform {
  constructor() {
    this.anna = null;
    this.connected = false;
    this.storageMode = "device";
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
      const response = await this.anna.storage.get({ key: STORE_KEY });
      const value = response?.value ?? response?.result?.value ?? response?.result ?? response;
      return normalizeStore(value && typeof value === "object" ? value : {});
    }
    try {
      return normalizeStore(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"));
    } catch {
      return normalizeStore({});
    }
  }

  async save(store) {
    const cleanStore = normalizeStore(store);
    if (this.anna?.storage?.set) {
      await this.anna.storage.set({ key: STORE_KEY, value: cleanStore });
      return;
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cleanStore));
  }

  async clear() {
    if (this.anna?.storage?.delete) {
      await this.anna.storage.delete({ key: STORE_KEY });
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
