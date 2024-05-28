import { pLimit } from "plimit-lit"
import * as fs from "node:fs"
import { ProgressBar } from '@opentf/cli-pbar'

const deletion = pLimit(4)

const API_PREFIX = "https://wakatime.com/api/v1"
const COOKIE = ""
const CSRF_TOKEN = ""

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getProjects(page) {
  return (await fetch(`${API_PREFIX}/users/current/projects?page=${page}`, {
    headers: {
      "cookie": COOKIE
    }
  })).json()
}

async function getProjectTotalTime(id) {
  return (await fetch(`${API_PREFIX}/users/current/all_time_since_today?project=${id}&svg=false`, {
    headers: {
      "cookie": COOKIE
    }
  })).json()
}

async function waitForFullSummary(project, bar, wait = 2000) {
  bar.update({ value: 0, prefix: `Summary ${project.name}` })

  while (true) {
    const res = await getProjectTotalTime(project.id)

    if (
      res.error ||
      res.data.is_up_to_date === true
    ) return res

    bar.update({ value: res.data.percent_calculated, progress: true })
    await new Promise(resolve => setTimeout(resolve, wait))
  }
}

async function deleteAbort(name) {
  const res = await fetch(`${API_PREFIX}/users/current/projects/${encodeURIComponent(name)}/delete_abort`, {
    "headers": {
      "cookie": COOKIE,
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.5",
      "Content-Type": "application/json",
      "X-CSRFToken": CSRF_TOKEN,
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin"
    },
    "referrer": `https://wakatime.com/projects`,
    "method": "POST",
    "mode": "cors"
  });

  console.log("Abort", res.status, name)

  return res
}

async function deleteProject(name, bar) {
  let res = await fetch(`${API_PREFIX}/users/current/projects/${encodeURIComponent(name)}`, {
    "headers": {
      "cookie": COOKIE,
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.5",
      "X-CSRFToken": CSRF_TOKEN,
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin"
    },
    "referrer": `https://wakatime.com/projects`,
    "method": "DELETE",
    "mode": "cors"
  });

  let progresses = []

  bar.update({ value: 0, prefix: `Deleting ${name}` })

  do {
    res = await (await fetch(`${API_PREFIX}/users/current/projects/${encodeURIComponent(name)}/delete_status`, {
      "headers": {
        "cookie": COOKIE,
      }
    })).json()
    if (!res.data.progress) {
      break
    }

    await new Promise(resolve => setTimeout(resolve, 2000))

    if (progresses.length > 5) {
      progresses = progresses.splice(1, progresses.length - 1)
      if (progresses.reduce((t, e) => t + (e === progresses[0]), 0) === progresses.length) {
        throw new Error(`Dropping slow deletion ${name}`)
      }
    }

    bar.update({ value: res.data.progress, progress: true })
    progresses.push(res.data.progress)
  } while (res.data.progress < 100)

  return res
}

async function* projectIterator(bar) {
  let json = await getProjects(1)
  bar.update({ value: 0, progress: true, total: json.total_pages, showCount: true, prefix: `Fetching projects` })

  yield json

  while (json.next_page) {
    json = await getProjects(json.next_page)
    bar.inc()

    yield json
  }
}

async function downloadProjects(bar) {
  bar.update({ value: 0 })

  const data = []
  for await (const json of projectIterator(bar)) {
    data.push(...json.data)
  }

  fs.writeFileSync("wakatime.json", JSON.stringify(data, null, 2))

  return data
}

async function readProjects(bar) {
  if (!fs.existsSync("wakatime.json")) return downloadProjects(bar)

  return JSON.parse(fs.readFileSync("wakatime.json"))
}

class BarPool {
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

  newBar(opts) {
    const index = this.bars.findIndex((_, i) => !this.occupation[i])
    this.occupation[index] = true

    this.bars[index].update(opts)

    return this.bars[index]
  }

  terminate(bar) {
    const index = this.bars.findIndex((b) => b === bar)
    this.occupation[index] = false
  }

  dispose() {
    this.bar.stop()
  }
}

function progressBar(pool, func, wait = 1000) {
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

(async () => {
  let deletions = []
  const pool = new BarPool(5)
  const projects = await progressBar(pool, readProjects, 200)()
  const total = pool.newBar({ prefix: 'Total', value: 0, progress: true, total: projects.length, showCount: true })

  const incTotal = (func) => {
    return async function() {
      if (await func()) total.inc()
    }
  }

  for (const project of projects) {
    const factory = () => deletion(
      incTotal(
        progressBar(pool, async (bar) => {
          const summary = await waitForFullSummary(project, bar)
          if (!summary.data) {
            bar.update({ prefix: `No summary for ${project.name} ${summary.error}`, progress: false })
            return true
          }

          if (
            summary.data.total_seconds > 3600
          ) {
            bar.update({ prefix: `Skipping ${project.name} ${summary.data.total_seconds}`, progress: false })
            return true
          }

          try {
            await deleteProject(project.name, bar)
            return true
          } catch (e) {
            bar.update({ prefix: e, progress: false })
            deletions.push(factory())
          }
        }, 200)
      )
    )

    deletions.push(factory())
  }

  await Promise.all(deletions)
  fs.unlinkSync("wakatime.json")

  pool.dispose()
})()

