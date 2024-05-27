const fs = require("fs")
const pLimit = require("plimit-lit").pLimit

const deletion = pLimit(4)

const API_PREFIX = "https://wakatime.com/api/v1"
const COOKIE = ""
const CSRF_TOKEN = ""

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

async function waitForFullSummary(id, wait = 2000) {
  while (true) {
    const res = await getProjectTotalTime(id)

    if (
      res.error ||
      res.data.is_up_to_date === true
    ) return res

    console.log("Waiting for summary", res.data.percent_calculated)
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

async function deleteProject(name) {
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

  do {
    res = await (await fetch(`${API_PREFIX}/users/current/projects/${encodeURIComponent(name)}/delete_status`, {
      "headers": {
        "cookie": COOKIE,
      }
    })).json()
    if (!res.data.progress) {
      break
    }

    console.log("Progress", name, res.data.progress + "%")
    await new Promise(resolve => setTimeout(resolve, 2000))

    if (progresses.length > 5) {
      progresses = progresses.splice(1, progresses.length - 1)
      if (progresses.reduce((t, e) => t + (e === progresses[0]), 0) === progresses.length) {
        throw new Error(`Dropping slow deletion ${name}`)
      }
    }

    progresses.push(res.data.progress)
  } while (res.data.progress < 100)

  return res
}

async function* projectIterator() {
  let json = await getProjects(1)

  yield json

  while (json.next_page) {
    json = await getProjects(json.next_page)

    yield json
  }
}

async function downloadProjects() {
  const data = []
  for await (const json of projectIterator()) {
    data.push(...json.data)
  }

  fs.writeFileSync("wakatime.json", JSON.stringify(data, null, 2))

  return data
}

async function readProjects() {
  if (!fs.existsSync("wakatime.json")) return downloadProjects()

  return JSON.parse(fs.readFileSync("wakatime.json"))
}

(async () => {
  const projects = await readProjects()
  let deletions = []

  for (const project of projects) {
    const factory = () => deletion(async () => {
      const summary = await waitForFullSummary(project.id)
      if (!summary.data) {
        console.error(`No summary for ${project.name}`)
        return
      }

      if (
        summary.data.total_seconds > 3600
      ) {
        console.log(`Skipping ${project.name} ${summary.data.total_seconds}`)
        return
      }

      console.log(`Deletion ${project.name} ${summary.data.total_seconds}`)
      try {
        await deleteProject(project.name)
      } catch (e) {
        console.error(`Deletion ${project.name} failed.`)
        deletions.push(factory())
      }
    })

    deletions.push(factory())
  }

  await Promise.all(deletions)
  fs.unlinkSync("wakatime.json")
})()

