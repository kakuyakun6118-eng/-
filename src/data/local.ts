// Fallback storage used until Firebase is configured (see src/firebase.ts).
// Keeps the app usable solo on one phone; data won't sync across devices.

type Listener<T> = (items: T[]) => void;

function newId(): string {
  return crypto.randomUUID();
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
    localStorage.setItem(this.key, JSON.stringify(items));
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
    localStorage.setItem(this.key, JSON.stringify(next));
    this.listeners.forEach((listener) => listener(next));
  }
}
