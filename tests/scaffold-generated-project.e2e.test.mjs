import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { createProject } from '../skills/dsh-plugin-dev/scripts/create-project.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = resolve(
  process.env.DSH_HARNESS_BASELINE_ROOT
    ?? join(repositoryRoot, '..', 'deepseek-harness-baseline'),
)

function run(command, args, cwd, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', ...extraEnvironment },
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
    const relocatedHarness = join(root, 'relocated-harness')
    await symlink(harnessRoot, relocatedHarness, 'dir')
    const synchronized = run(
      'pnpm',
      ['context:sync'],
      result.target,
      { DSH_HARNESS_ROOT: relocatedHarness },
    )
    assert.match(synchronized, /synchronized Harness links to/)
    const synchronizedManifest = JSON.parse(await readFile(join(result.target, 'package.json'), 'utf8'))
    for (const packageName of [
      '@deepseek-ai/cordis',
      '@deepseek-ai/cordis-plugin-include',
      '@deepseek-ai/cordis-plugin-loader',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
    ]) {
      assert.match(synchronizedManifest.devDependencies[packageName], /\/relocated-harness\//)
    }
    const verification = run(
      'pnpm',
      ['verify'],
      result.target,
      { DSH_HARNESS_ROOT: relocatedHarness },
    )
    assert.match(verification, /context check passed:/)
    assert.match(verification, /Test Files\s+2 passed/)
    assert.match(verification, /Tests\s+9 passed/)
    assert.match(verification, /built package smoke passed:/)
    assert.match(verification, /packed artifact check passed:/)

    const claude = await readFile(join(result.target, 'CLAUDE.md'), 'utf8')
    assert.match(claude, /\/dsh-plugin-dev/)
    assert.match(claude, /docs\/agent\/PROJECT_CONTRACT\.md/)

    const generatedLock = JSON.parse(await readFile(join(result.target, 'dsh-reference.lock.json'), 'utf8'))
    assert.equal(generatedLock.schemaVersion, 2)
    assert.equal(generatedLock.channel, process.env.DSH_BASELINE_CHANNEL ?? 'stable')
    assert.equal(generatedLock.upstream.tag, 'dsh-v0.1.2-alpha.1')
    assert.equal(generatedLock.upstream.packageManager, 'pnpm@11.7.0')
    assert.match(generatedLock.upstream.catalogDigest, /^[0-9a-f]{64}$/)

    const lockfile = await readFile(join(result.target, 'pnpm-lock.yaml'), 'utf8')
    assert.match(lockfile, /specifier: 3\.18\.1/)
    assert.match(lockfile, /relocated-harness\/vendor\/cordis/)

    const profileEnvironment = { DSH_HOME: join(root, 'dsh-home') }
    run(
      'pnpm',
      ['dsh', 'plugin', '--profile', 'scaffold-e2e', 'add', result.target],
      harnessRoot,
      profileEnvironment,
    )
    const dump = run(
      'pnpm',
      ['dsh', '--profile', 'scaffold-e2e', '--dump-config'],
      harnessRoot,
      profileEnvironment,
    )
    assert.match(dump, /id: repository-audit/)
    assert.match(dump, /name: '@example\/dsh-repository-audit'/)
    assert.match(dump, /maxInputLength: 2000/)

    run(
      'pnpm',
      ['dsh', 'plugin', '--profile', 'scaffold-e2e', 'remove', result.packageName],
      harnessRoot,
      profileEnvironment,
    )
    const afterRemove = run(
      'pnpm',
      ['dsh', '--profile', 'scaffold-e2e', '--dump-config'],
      harnessRoot,
      profileEnvironment,
    )
    assert.doesNotMatch(afterRemove, /id: repository-audit/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
