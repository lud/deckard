// @ts-check
// Plumbing shared by the two hook entry points: autobuild.mjs (Stop) and
// prompt-relay.mjs (UserPromptSubmit).
import { readFileSync } from 'node:fs'

/**
 * The marker the Stop hook leaves in the out dir when a build attempt failed,
 * and the prompt-time relay consumes on the next user prompt. Its content is
 * a recorded failure message when the cause cannot be cheaply re-derived (a
 * renderer crash); empty otherwise, because the relay re-checks everything
 * cheap — lint, kit, renderer — so the model gets the deck's state at prompt
 * time, not last turn's.
 */
export const FLAG_FILE = 'errors-pending'

/** Hooks receive their JSON payload on stdin; `cwd` is the project. */
export function cwdFromStdin() {
  try {
    const parsed = JSON.parse(readFileSync(0, 'utf8'))
    if (typeof parsed?.cwd === 'string') return parsed.cwd
  } catch {
    // No stdin, or not JSON: the process cwd is the next best answer.
  }
  return process.cwd()
}
