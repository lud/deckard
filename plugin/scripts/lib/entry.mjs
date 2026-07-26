// @ts-check
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Node baseline: stable `node --test` and `fs.globSync`, with zero deps. */
export const MIN_NODE_MAJOR = 22

/**
 * Guard a script entry point on the Node baseline. Call it before any work, so
 * an old runtime reports a clear requirement rather than an obscure crash.
 * @param {number} [minimum]
 */
export function requireNode(minimum = MIN_NODE_MAJOR) {
  const major = Number(process.versions.node.split('.')[0])
  if (major < minimum) {
    process.stderr.write(
      `Deckard needs Node ${minimum} or newer — this is Node ${process.versions.node}.\n` +
        `Install a current Node (with nvm: \`nvm install ${minimum}\`) and run again.\n`,
    )
    process.exit(1)
  }
}

/**
 * True when the module at `moduleUrl` was started directly by node, rather than
 * imported. Lets a script expose its functions to tests and still run as a CLI.
 * @param {string} moduleUrl
 */
export function isEntryPoint(moduleUrl) {
  if (!process.argv[1]) return false
  return resolve(process.argv[1]) === fileURLToPath(moduleUrl)
}
