export interface Queue<T> {
  emit(value: T): void
  close(): void | Promise<void>
  iterator: AsyncIterable<T>
}

export function createQueue<T>(onClose?: () => void | Promise<void>): Queue<T> {
  const buffer: T[] = []
  const waiters: Array<(r: IteratorResult<T>) => void> = []
  let closed = false

  function emit(value: T): void {
    if (closed) return
    const w = waiters.shift()
    if (w) w({ value, done: false })
    else buffer.push(value)
  }

  function close(): void | Promise<void> {
    if (closed) return
    closed = true
    for (const w of waiters.splice(0)) w({ value: undefined as never, done: true })
    return onClose?.()
  }

  const iterator: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buffer.length > 0) return Promise.resolve({ value: buffer.shift() as T, done: false })
          if (closed) return Promise.resolve({ value: undefined as never, done: true })
          return new Promise((resolve) => waiters.push(resolve))
        },
        async return(): Promise<IteratorResult<T>> {
          await close()
          return { value: undefined as never, done: true }
        },
      }
    },
  }

  return { emit, close, iterator }
}
