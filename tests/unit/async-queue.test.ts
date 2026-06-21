import { expect, it } from 'vitest'
import { createQueue } from '../../src/lib/async-queue.js'

it('delivers values emitted before and after a waiter, then closes', async () => {
  const onCloseCalls: number[] = []
  const q = createQueue<number>(() => {
    onCloseCalls.push(1)
  })
  const it = q.iterator[Symbol.asyncIterator]()

  q.emit(1) // buffered before consumer
  expect((await it.next()).value).toBe(1)

  const pending = it.next() // waiter registered first
  q.emit(2)
  expect((await pending).value).toBe(2)

  await q.close()
  expect(onCloseCalls).toEqual([1])
  expect((await it.next()).done).toBe(true)
})

it('return() closes the queue and runs onClose', async () => {
  let closed = false
  const q = createQueue<number>(() => {
    closed = true
  })
  const it = q.iterator[Symbol.asyncIterator]()
  await it.return!()
  expect(closed).toBe(true)
  expect((await it.next()).done).toBe(true)
})
