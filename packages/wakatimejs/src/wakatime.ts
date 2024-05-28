import type { Project, ProjectBadge, ProjectPager } from "@requests/Project"
import type { ProjectTotalTimeData } from "@requests/TotalTime"

type Progress = Partial<{
  title: string
  value: number
  total: number
  bar: boolean
}>

type ProgressCallback = (progress: Progress) => void | null

export class WakatimeProject implements Project {
  #api

  id: string
  name: string
  color: null
  first_heartbeat_at: null
  last_heartbeat_at: Date
  created_at: Date
  badge: ProjectBadge | null
  clients: any[]
  human_readable_last_heartbeat_at: string
  url: string
  repository: null
  has_public_url: boolean
  urlencoded_name: string
  human_readable_first_heartbeat_at: null

  summary: ProjectTotalTimeData | null

  constructor(data: Project & { summary: ProjectTotalTimeData | null }, api: WakatimeApi) {
    this.#api = api

    this.id = data.id
    this.name = data.name
    this.color = data.color
    this.first_heartbeat_at = data.first_heartbeat_at
    this.last_heartbeat_at = data.last_heartbeat_at
    this.created_at = data.created_at
    this.badge = data.badge
    this.clients = data.clients
    this.human_readable_last_heartbeat_at = data.human_readable_last_heartbeat_at
    this.url = data.url
    this.repository = data.repository
    this.has_public_url = data.has_public_url
    this.urlencoded_name = data.urlencoded_name
    this.human_readable_first_heartbeat_at = data.human_readable_first_heartbeat_at

    this.summary = data.summary
  }

  async getTotalTime(): Promise<ProjectTotalTimeData> {
    const res = await (await this.#api.fetch(`/users/current/all_time_since_today?project=${this.id}&svg=false`)).json()
    if (res.error) throw new Error(res.error)

    return res.data
  }

  async abortDeletion() {
    const res = await this.#api.fetch(`/users/current/projects/${encodeURIComponent(this.name)}/delete_abort`, {
      method: "POST",
      referrer: `https://wakatime.com/projects`,
    })

    return res.status
  }

  async delete(progress: ProgressCallback) {
    progress?.({ title: `Deleting ${this.name}`, value: 0, total: 100 })

    const base = `/users/current/projects/${encodeURIComponent(this.name)}`
    let res: any = await this.#api.fetch(base, {
      method: "DELETE",
      referrer: `https://wakatime.com/projects`,
    })

    progress?.({ title: `Deleting ${this.name} ${res.status}` })

    let progresses: any[] = []

    do {
      res = await this.#api.fetch(`${base}/delete_status`)
      if (!res.ok) {
        progress?.({ title: `Progress unabaliable ${this.name} ${res.status}`, bar: false })
        break
      }
      res = await res.json()

      if (progresses.length > 5) {
        progresses = progresses.splice(1, progresses.length - 1)
        if (progresses.reduce((t, e) => t + (e === progresses[0]), 0) === progresses.length) {
          throw new Error(`Dropping slow deletion ${this.name}`)
        }
      }

      progress?.({ title: `Deleting ${this.name}`, value: res.data.progress, bar: true })
      progresses.push(res.data.progress)

      await new Promise(resolve => setTimeout(resolve, 2000))
    } while (res.data.progress < 100)

    return res
  }

  async getSummary(progress: ProgressCallback, wait = 2000) {
    if (this.summary) {
      progress?.({ value: 0, title: `Summary ${this.name} (cached)` })
      return this.summary
    }
    progress?.({ value: 0, title: `Summary ${this.name}` })

    while (true) {
      const data = await this.getTotalTime()

      if (
        data.is_up_to_date === true
      ) {
        this.summary = data
        return data
      }

      progress?.({ value: data.percent_calculated, bar: true })
      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }

}

export class WakatimeApi {
  API_PREFIX = "https://wakatime.com/api/v1"

  constructor(private cookie: string, private csrftoken: string) { }

  async fetch(url: string, options: RequestInit = {}) {
    return fetch(`${this.API_PREFIX}${url}`, {
      ...options,
      headers: {
        "cookie": this.cookie,
        "X-CSRFToken": this.csrftoken,
        ...(options.headers || {})
      }
    })
  }

  async getProjectPage(page: number) {
    const res = await (await this.fetch(`/users/current/projects?page=${page}`)).json() as ProjectPager
    if (res.error) throw new Error(res.error)

    res.data = res.data.map(data => new WakatimeProject(data, this))
    return res
  }

  async getProjects(progress: ProgressCallback) {
    const data: WakatimeProject[] = []

    /* @ts-ignore */
    for await (const json of this.projectIterator(progress)) {
      progress?.({ bar: true, value: json.page, total: json.total_pages })
      data.push(...json.data)
    }

    return data
  }

  async *projectIterator() {
    let json = await this.getProjectPage(1)

    yield json

    while (json.next_page) {
      json = await this.getProjectPage(json.next_page)
      yield json
    }
  }
}
