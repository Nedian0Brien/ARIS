/**
 * per-key 비동기 직렬화 유틸.
 * 동일 key로 동시에 실행된 task들은 순서대로 실행되며, 서로 다른 key는 병렬 실행된다.
 * tunaPi의 SessionLockMixin(WeakValueDictionary + Semaphore) 패턴을 TypeScript로 구현.
 */
export class ScopeQueue {
  private readonly chains = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();

    let resolve!: () => void;
    const gate = new Promise<void>((res) => {
      resolve = res;
    });
    this.chains.set(key, gate);

    await prev;

    try {
      return await fn();
    } finally {
      resolve();
      // 이 gate가 여전히 최신이면 map에서 정리
      if (this.chains.get(key) === gate) {
        this.chains.delete(key);
      }
    }
  }

  /** 해당 key에 대해 실행 중이거나 대기 중인 task가 있는지 반환 */
  isQueued(key: string): boolean {
    return this.chains.has(key);
  }
}
