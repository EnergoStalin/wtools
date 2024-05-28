import { run, subcommands } from "cmd-ts";
import { project } from "./commands/project/index.js";

const app = subcommands({
  name: "wcli",
  description: "wakatime helpers",
  version: "1.0.0",
  cmds: {
    project: project
  }
});

run(app, process.argv.slice(2));
