#!/usr/bin/env node
// Extracts the public interface of the source modules (exported declarations with the
// JSDoc block above them) into one Markdown file. Why: a worker that implements the CLI
// needs the signatures of the merged modules, but attaching the full sources exceeds the
// size budget of the delegation channel (100 KB). The digest is regenerated before each
// dispatch so it never drifts from the code. Usage: node docs/design/tools/extract-interfaces.mjs > out.md
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.mjs')) files.push(p)
  }
}
walk(join(root, 'src'))
files.sort()
const out = ['# Public interfaces of the merged modules (generated)\n']
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  out.push(`\n## \`${relative(root, file)}\`\n`)
  for (let i = 0; i < lines.length; i++) {
    if (!/^export\s+(async\s+)?(function|const|let|class)\b/.test(lines[i])) continue
    // walk back over the JSDoc block
    let j = i
    while (j > 0 && /^\s*(\*|\/\*\*|\/\/)/.test(lines[j - 1])) j--
    // the declaration line(s): until the opening brace or the end of a const statement
    let k = i
    while (k < lines.length && !/[{;]\s*$/.test(lines[k]) && k - i < 6) k++
    const decl = lines.slice(i, k + 1).join('\n').replace(/\s*\{\s*$/, '')
    out.push('```js\n' + lines.slice(j, i).join('\n') + (j < i ? '\n' : '') + decl + '\n```\n')
  }
}
process.stdout.write(out.join('\n'))
