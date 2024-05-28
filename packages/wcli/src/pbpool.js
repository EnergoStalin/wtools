import { ProgressBar } from '@opentf/cli-pbar'

export class PbPool {
  /**
   * @param {number} count
   * @param {number} total
   */
  constructor(count, total = 100) {
    this.bar = new ProgressBar({
      size: 'MEDIUM',
      autoClear: true,
    })

    this.bars = []
    this.occupation = []

    for (let i = 0; i < count; i++) {
      this.bars.push(this.bar.add({ total, progress: false }))
      this.occupation.push(false)
    }
  }

  /**
   * @param {Parameters<ProgressBar.update>} opts
   */
  newBar(opts) {
    const index = this.bars.findIndex((_, i) => !this.occupation[i])
    this.occupation[index] = true

    if (!this.bars[index]) {
      throw new Error(`Pool empty ${index}`)
    }

    this.bars[index].update(opts)

    return this.bars[index]
  }

  /**
   * @param {ReturnType<ProgressBar.add>} bar
   */
  terminate(bar) {
    const index = this.bars.findIndex((b) => b === bar)
    this.occupation[index] = false
  }

  dispose() {
    this.bar.stop()
  }
}

/**
 * @template T
 * @param {BarPool} pool
 * @param {(bar: ProgressBar) => T} func
 * @param {number} [wait=1000]
 */
export function progressBar(pool, func, wait = 1000) {
  return async function() {
    const bar = pool.newBar({ progress: false })

    try {
      return await func(bar)
    } finally {
      await sleep(wait)
      pool.terminate(bar)
    }
  }
}
