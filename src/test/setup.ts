/**
 * Vitest 全局前置：保证测试进程内始终有可用的 Web Storage。
 *
 * 背景：Node 22+ 暴露了实验性的 `globalThis.localStorage`（未开启 --localstorage-file
 * 时为 undefined），会遮蔽 jsdom 注入的实现；而 jsdom 在不透明源下访问 storage 会抛
 * SecurityError。两者都会让 `localStorage.clear()` 直接失败。
 *
 * 处理方式：优先复用 jsdom 实现，不可用时回退到内存实现，行为与浏览器 Storage 一致。
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

function resolveStorage(name: 'localStorage' | 'sessionStorage'): Storage {
  try {
    const native = typeof window !== 'undefined' ? window[name] : undefined
    if (native && typeof native.getItem === 'function') return native
  } catch {
    // jsdom 不透明源（about:blank）下访问 storage 会抛 SecurityError，回退内存实现
  }
  return new MemoryStorage()
}

const storageImplementations: Array<[string, Storage]> = [
  ['localStorage', resolveStorage('localStorage')],
  ['sessionStorage', resolveStorage('sessionStorage')],
]

storageImplementations.forEach(([name, storage]) => {
  Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true })
})
