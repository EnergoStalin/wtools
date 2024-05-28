import { subcommands } from "cmd-ts";
import { deleteProjects } from "./delete/index.js";

export const project = subcommands({
  name: "project",
  description: "project management",
  cmds: {
    delete: deleteProjects,
  }
});
