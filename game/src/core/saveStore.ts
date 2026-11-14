// セーブデータの保存先。iPhoneのSafariでも使える IndexedDB に入れる。
// IndexedDB が使えない環境(プライベートブラウズなど)では、ページを閉じると消える一時保存に切り替える。
import type { SaveData } from "../sim/save";

const DB_NAME = "goko-ranka";
const STORE = "saves";

export interface SaveRecord {
  slot: string;
  data: SaveData;
}

export class SaveStore {
  /** 端末に残る保存先が使えているか */
  persistent = true;
  private readonly memory = new Map<string, SaveRecord>();
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "slot" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("blocked"));
      });
    }
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /** 保存先が使えなければ、一時保存に切り替える */
  private async guard<T>(work: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.persistent) {
      try {
        return await work();
      } catch (err) {
        console.warn("IndexedDB が使えないため、一時保存に切り替えます", err);
        this.persistent = false;
        this.db = null;
      }
    }
    return fallback();
  }

  list(): Promise<SaveRecord[]> {
    return this.guard(() => this.run<SaveRecord[]>("readonly", (s) => s.getAll()), () => [...this.memory.values()]);
  }

  get(slot: string): Promise<SaveRecord | undefined> {
    return this.guard(() => this.run<SaveRecord | undefined>("readonly", (s) => s.get(slot)), () => this.memory.get(slot));
  }

  async put(slot: string, data: SaveData): Promise<void> {
    const record = { slot, data };
    await this.guard(
      async () => {
        await this.run("readwrite", (s) => s.put(record));
      },
      () => {
        this.memory.set(slot, record);
      },
    );
  }

  async remove(slot: string): Promise<void> {
    await this.guard(
      async () => {
        await this.run("readwrite", (s) => s.delete(slot));
      },
      () => {
        this.memory.delete(slot);
      },
    );
  }
}
