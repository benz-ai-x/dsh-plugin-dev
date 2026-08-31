import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

import { createProject } from '../skills/dsh-plugin-dev/scripts/create-project.mjs'

interface BaselineFileRecord {
  catalog: { path: string }
  registry: { status: string }
  localResolution: { fallbackRelativePath: string }
  upstream: {
    tag: string
    packageManager: string
  }
}

interface RepositoryLockFile {
  defaultChannel: string
  channels: Record<string, BaselineFileRecord>
}

interface CatalogFile {
  packages: Array<{ name: string; version: string }>
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryLock = JSON.parse(
  await readFile(join(repositoryRoot, 'dsh-reference.lock.json'), 'utf8'),
) as RepositoryLockFile
const baselineChannel = process.env.DSH_BASELINE_CHANNEL ?? repositoryLock.defaultChannel
const selectedBaseline = repositoryLock.channels[baselineChannel]!
const selectedCatalog = JSON.parse(
  await readFile(join(repositoryRoot, selectedBaseline.catalog.path), 'utf8'),
) as CatalogFile
const harnessRoot = resolve(
  process.env.DSH_HARNESS_BASELINE_ROOT
    ?? join(repositoryRoot, selectedBaseline.localResolution.fallbackRelativePath),
)

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  extraEnvironment: Readonly<Record<string, string>> = {},
): string {
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

function packProject(projectRoot: string, destination: string): string {
  const output = run(
    'pnpm',
    ['pack', '--json', '--pack-destination', destination],
    projectRoot,
    { npm_config_ignore_scripts: 'true' },
  )
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  const packed = JSON.parse(output.slice(start, end + 1)) as { filename?: unknown }
  assert.equal(typeof packed.filename, 'string')
  return packed.filename as string
}

async function bootAndStopProfile(
  cwd: string,
  profile: string,
  environment: Readonly<Record<string, string>>,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [join(cwd, 'apps', 'cli', 'lib', 'bin.js'), '--profile', profile], {
      cwd,
      env: {
        ...process.env,
        CI: '1',
        DSH_TELEMETRY_DISABLED: '1',
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })

    const stop = setTimeout(() => child.kill('SIGTERM'), 4_000)
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      rejectPromise(new Error(`profile boot did not settle after SIGTERM\n${stdout}\n${stderr}`))
    }, 30_000)
    child.once('error', error => {
      clearTimeout(stop)
      clearTimeout(timeout)
      rejectPromise(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(stop)
      clearTimeout(timeout)
      try {
        assert.equal(signal, null, `profile exited from signal ${signal}\n${stdout}\n${stderr}`)
        assert.equal(code, 0, `profile exited ${code}\n${stdout}\n${stderr}`)
        assert.doesNotMatch(`${stdout}\n${stderr}`, /plugin tree failed to load|uncaught|unhandled/i)
        resolvePromise()
      } catch (error) {
        rejectPromise(error)
      }
    })
  })
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
    assert.equal(generatedLock.channel, baselineChannel)
    assert.equal(generatedLock.delivery.mode, 'source')
    assert.equal(generatedLock.upstream.tag, selectedBaseline.upstream.tag)
    assert.equal(generatedLock.upstream.packageManager, 'pnpm@11.7.0')
    assert.match(generatedLock.upstream.catalogDigest, /^[0-9a-f]{64}$/)

    const lockfile = await readFile(join(result.target, 'pnpm-lock.yaml'), 'utf8')
    const schemasteryVersion = selectedCatalog.packages
      .find(entry => entry.name === '@deepseek-ai/schemastery')!.version
    assert.match(lockfile, new RegExp(`specifier: ${schemasteryVersion.replaceAll('.', '\\.')}`))
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

test('a Registry-delivered Tool survives clean install, pack, import, and profile lifecycle', { timeout: 600_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-scaffold-registry-e2e-'))
  const registryChannel = repositoryLock.channels.edge!.registry.status === 'ready' ? 'edge' : 'stable'
  const registryBaseline = repositoryLock.channels[registryChannel]!
  assert.equal(registryBaseline.registry.status, 'ready')
  try {
    const result = await createProject({
      target: join(root, 'registry-audit'),
      channel: registryChannel,
      delivery: 'registry',
      name: '@example/dsh-registry-audit',
      pluginName: 'registry-audit',
      toolName: 'audit_registry',
      description: 'Inspect a Registry-delivered plugin input and return its canonical value.',
    })

    run('pnpm', ['install', '--frozen-lockfile=false'], result.target)
    const verification = run('pnpm', ['verify'], result.target)
    assert.match(verification, /validated Registry evidence/)
    assert.match(verification, /Test Files\s+2 passed/)
    assert.match(verification, /Tests\s+9 passed/)
    assert.match(verification, /built package smoke passed:/)
    assert.match(verification, /packed artifact check passed:/)

    const archive = packProject(result.target, root)
    const consumer = join(root, 'clean-consumer')
    await mkdir(consumer, { recursive: true })
    await writeFile(join(consumer, 'package.json'), `${JSON.stringify({
      name: 'dsh-registry-clean-consumer',
      private: true,
      type: 'module',
    }, null, 2)}\n`)
    run('pnpm', ['add', archive], consumer)
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const plugin = await import(${JSON.stringify(result.packageName)}); if (plugin.name !== 'registry-audit' || typeof plugin.apply !== 'function') process.exit(1)`,
      ],
      consumer,
    )
    const consumerLock = await readFile(join(consumer, 'pnpm-lock.yaml'), 'utf8')
    assert.doesNotMatch(consumerLock, /(?:link:|workspace:|deepseek-harness)/)

    const profileEnvironment = { DSH_HOME: join(root, 'dsh-home') }
    run(
      'pnpm',
      ['dsh', 'plugin', '--profile', 'registry-e2e', 'add', archive],
      harnessRoot,
      profileEnvironment,
    )
    const dump = run(
      'pnpm',
      ['dsh', '--profile', 'registry-e2e', '--dump-config'],
      harnessRoot,
      profileEnvironment,
    )
    assert.match(dump, /id: registry-audit/)
    assert.match(dump, /name: '@example\/dsh-registry-audit'/)
    await bootAndStopProfile(harnessRoot, 'registry-e2e', profileEnvironment)

    run(
      'pnpm',
      ['dsh', 'plugin', '--profile', 'registry-e2e', 'remove', result.packageName],
      harnessRoot,
      profileEnvironment,
    )
    const afterRemove = run(
      'pnpm',
      ['dsh', '--profile', 'registry-e2e', '--dump-config'],
      harnessRoot,
      profileEnvironment,
    )
    assert.doesNotMatch(afterRemove, /id: registry-audit/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
