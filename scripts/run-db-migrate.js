// Cross-platform helper for the `db-server:file` / `db-server:memory` npm
// scripts (package.json). pglite-server's `--run` flag spawns its argument
// directly (no shell), so the previous value `cmd /c npm run db:migrate`
// only worked on Windows (where `cmd` resolves) and failed with
// `spawn cmd ENOENT` on Linux/macOS, including every GitHub Actions CI run
// (ubuntu-latest) — this was the cause of the "Build with 24.x" job always
// failing (found 2026-07-16 while investigating repeated CI failure emails,
// unrelated to that day's prompt-enhancement work).
//
// Fix: point `--run` at this script instead (`node scripts/run-db-migrate.js`).
// `node <path>` is a plain command + arg — Node itself is a real executable
// on PATH on every platform (unlike `npm`/`cmd`, which are wrapper scripts on
// Windows), so no shell is needed to spawn it. Once inside this script,
// `execSync` runs `npm run db:migrate` through Node's own platform-default
// shell (cmd.exe on Windows, /bin/sh elsewhere), which correctly resolves
// `npm` on both.
require('node:child_process').execSync('npm run db:migrate', { stdio: 'inherit' });
