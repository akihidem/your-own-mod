#!/usr/bin/env node
import { main } from '../src/cli.mjs'

// Let Node flush captured output instead of terminating pending stream writes.
process.exitCode = await main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd(),
})
