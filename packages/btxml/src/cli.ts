#!/usr/bin/env node
import { runCli } from "./yargs.ts";

runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
