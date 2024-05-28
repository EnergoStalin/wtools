/**
 * @template T
 * @param {PbPool} pool
 * @param {(bar: import('@opentf/cli-pbar').ProgressBar) => T} func
 * @param {number} [wait=1000]
 * @returns {Promise<T>}
 */
export function progressBar(pool, func, wait = 1000) {
  return async function() {
    const bar = pool.newBar({ progress: false })

    try {
      return await func(bar)
    } finally {
      await new Promise(resolve => setTimeout(resolve, wait))
      pool.terminate(bar)
    }
  }
}

export function mapProgressBar(bar) {
  return function(obj) {
    let args = {
      prefix: obj.title,
      value: obj.value,
      total: obj.total,
      progress: obj.bar
    }

    Object.keys(args).forEach(key => {
      if (args[key] === undefined) {
        delete args[key];
      }
    });

    bar.update(args)
  }
}
