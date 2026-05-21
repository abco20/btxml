import { startLanguageServer } from "./server.ts";

startLanguageServer().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
