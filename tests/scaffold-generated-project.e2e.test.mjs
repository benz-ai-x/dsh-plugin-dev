import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { createProject } from '../skills/dsh-plugin-dev/scripts/create-project.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = resolve(repositoryRoot, '..', 'deepseek-harness')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 20 * 1024 * 1024,
  })
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(' ')} failed in ${cwd}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'),
  )
  return result.stdout
}

test('an unrelated empty directory becomes a fully verified DSH Tool project', { timeout: 300_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-scaffold-e2e-'))
  try {
    const result = await createProject({
      target: join(root, 'repository-audit'),
      name: '@example/dsh-repository-audit',
      pluginName: 'repository-audit',
      toolName: 'audit_repository',
      description: 'Inspect a repository path and return a deterministic audit summary.',
      harnessRoot,
    })

    run('pnpm', ['install'], result.target)
    const verification = run('pnpm', ['verify'], result.target)
    assert.match(verification, /context check passed:/)
    assert.match(verification, /Test Files\s+2 passed/)
    assert.match(verification, /Tests\s+6 passed/)
    assert.match(verification, /packed artifact check passed:/)

    const lockfile = await readFile(join(result.target, 'pnpm-lock.yaml'), 'utf8')
    assert.match(lockfile, /specifier: 3\.18\.1/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
