type Processor<T> = (msg: T) => Promise<void>;

export class MessageQueue<T> {
  private queue: T[] = [];
  private _processing = false;
  private processor: Processor<T> | null = null;
  private idleResolvers: Array<() => void> = [];

  setProcessor(fn: Processor<T>): void {
    this.processor = fn;
  }

  enqueue(msg: T): void {
    this.queue.push(msg);
    this.processNext();
  }

  get isProcessing(): boolean {
    return this._processing;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  idle(): Promise<void> {
    if (!this._processing && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private processNext(): void {
    if (this._processing || this.queue.length === 0 || !this.processor) return;

    this._processing = true;
    const msg = this.queue.shift();
    if (!msg) {
      this._processing = false;
      return;
    }

    this.processor(msg)
      .catch(() => {})
      .finally(() => {
        this._processing = false;
        if (this.queue.length === 0) {
          for (const r of this.idleResolvers) {
            r();
          }
          this.idleResolvers = [];
        } else {
          this.processNext();
        }
      });
  }
}
