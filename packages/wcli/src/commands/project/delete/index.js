import { pLimit } from "plimit-lit"
import { WakatimeApi, WakatimeProject } from "wakatimejs"
import { PbPool } from "../../../pbpool.js"
import { command, string, number, option } from "cmd-ts";
import { ProgressBar } from "@opentf/cli-pbar";
import { mapProgressBar, progressBar } from "../../../bar.js";
import { cookieArgs } from "../../../arguments/cookies.js";
import * as fs from "node:fs"
import * as readline from "node:readline"

async function fetchProjectsWithProgress(api) {
  const bar = new ProgressBar({ prefix: 'Fetching projects', value: 0, showCount: true, autoClear: true })
  try {
    return await api.getProjects(mapProgressBar(bar))
  } finally {
    bar.stop()
  }
}

async function runPooled(title, dataset, func, limit = 4) {
  const queue = pLimit(limit)
  const tasks = []

  const pool = new PbPool(limit + 1)
  const total = pool.newBar({
    prefix: title,
    value: 0,
    total: dataset.length,
    progress: true,
    autoClear: true,
    showCount: true
  })

  let failed = 0

  try {
    for (const data of dataset) {
      tasks.push(queue(progressBar(pool, async (bar) => {
        try {
          const ret = await func(data, bar)
          total.inc()
          return ret
        } catch (err) {
          bar.update({ prefix: `Error: ${err.message}`, progress: false })
          total.update({ total: dataset.length - ++failed })
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      })))
    }

    return await Promise.all(tasks)
  } finally {
    pool.dispose()
  }
}

async function resolveForDeletion(projects, check) {
  await runPooled('Fetching projects', projects, async (project, bar) => {
    bar.update({ prefix: project.name })
    await project.getSummary(mapProgressBar(bar))
  })

  return projects
    .filter(project => project.summary && check(project.summary))
}

async function deleteProj(projects) {
  return runPooled('Deleting projects', projects, async (project, bar) => project.delete(mapProgressBar(bar)))
}

async function prompt(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => rl.question(message, answer => {
    rl.close();
    resolve(answer)
  }))
}

export const deleteProjects = command({
  name: "delete",
  description: "delete projects matching criteria",
  args: {
    total_seconds: option({
      long: "totalSeconds",
      short: "s",
      description: "delete projects with total seconds lesser than this value",
      type: number
    }),
    session: option({
      long: "session",
      description: "cache project resolving time",
      type: string,
      defaultValue: () => null
    }),
    ...cookieArgs
  },
  handler: async (args) => {
    const api = new WakatimeApi(args.cookies.cookie, args.cookies.csrf_token);

    let forDeletion = null
    if (args.session) {
      try {
        forDeletion = JSON.parse(fs.readFileSync(args.session)).map(project => new WakatimeProject(project, api))
      } catch (e) { }
    }

    if (!forDeletion) {
      const projects = await fetchProjectsWithProgress(api)

      forDeletion = await resolveForDeletion(projects, (summary) => summary.total_seconds < args.total_seconds)

      if (args.session) {
        fs.writeFileSync(args.session, JSON.stringify(forDeletion, null, 2))
      }
    }

    if (!forDeletion.length) {
      console.log('No projects to delete')
      return
    }

    for (const project of forDeletion) {
      console.log(`${project.name} [${project.summary.text}]`)
    }

    if (await prompt(`About to delete ${forDeletion.length} projects continue? (y/n) `) === 'y') {
      await deleteProj(forDeletion)
    }
  }
})
