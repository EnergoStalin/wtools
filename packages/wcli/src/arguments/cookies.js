import { extendType, option, string } from "cmd-ts"

export const cookies = extendType(string, {
  displayName: "cookies",
  description:
    "Cookie with csrf token present",
  async from(rawValue) {
    const csrftoken = rawValue.match(/csrftoken=([^;]+)/)[1]
    if (!csrftoken) throw new Error("No csrf token present")

    return {
      cookie: rawValue,
      csrf_token: csrftoken,
    }
  },
})

export const cookieArgs = {
  cookies: option({
    long: "cookies",
    short: "c",
    env: "WAKATIME_COOKIES",
    type: cookies
  })
}
