// Fallback storage used until Firebase is configured (see src/firebase.ts).
// Keeps the app usable solo on one phone; data won't sync across devices.

type Listener<T> = (items: T[]) => void;

/**
 * `crypto.randomUUID` needs a secure context and Safari 15.4+, and throws
 * outright where either is missing — which would take down the whole "add a
 * place" path. Fall back to a good-enough id rather than lose the write.
 */
function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Thrown when the device refuses the write, so the UI can explain why. */
export class StorageError extends Error {}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // Private browsing and a full storage quota both land here. Without this
    // the failure is silent and the place simply never appears.
    throw new StorageError(
      "この端末に保存できませんでした。Safariのプライベートブラウズを解除するか、空き容量をご確認ください。",
    );
  }
}

export class LocalCollection<T extends { id: string }> {
  private listeners = new Set<Listener<T>>();

  constructor(private key: string) {}

  private read(): T[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) ?? "[]") as T[];
    } catch {
      return [];
    }
  }

  private write(items: T[]) {
    persist(this.key, JSON.stringify(items));
    this.listeners.forEach((listener) => listener(items));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    listener(this.read());
    return () => {
      this.listeners.delete(listener);
    };
  }

  add(item: Omit<T, "id">): T {
    const items = this.read();
    const created = { ...item, id: newId() } as T;
    items.push(created);
    this.write(items);
    return created;
  }

  update(id: string, patch: Partial<T>) {
    this.write(this.read().map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  remove(id: string) {
    this.write(this.read().filter((item) => item.id !== id));
  }
}

export class LocalDoc<T> {
  private listeners = new Set<(value: T) => void>();

  constructor(
    private key: string,
    private defaultValue: T,
  ) {}

  private read(): T {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as T) : this.defaultValue;
    } catch {
      return this.defaultValue;
    }
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    listener(this.read());
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(patch: Partial<T>) {
    const next = { ...this.read(), ...patch };
    persist(this.key, JSON.stringify(next));
    this.listeners.forEach((listener) => listener(next));
  }
}
