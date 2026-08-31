import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

import {
  ScaffoldError,
  createProject,
  harnessWorktreeChanges,
  nodeSatisfies,
  parseArgs,
  validateHarnessArtifacts,
} from '../skills/dsh-plugin-dev/scripts/create-project.mjs'

interface BaselineFileRecord {
  catalog: { path: string }
  registry: { status: string }
  localResolution: { fallbackRelativePath: string }
}

interface RepositoryLockFile {
  defaultChannel: string
  channels: Record<string, BaselineFileRecord>
}

interface CatalogFile {
  packages: Array<{ name: string; version: string }>
}

interface GeneratedManifest {
  description: string
  private: boolean
  packageManager: string
  engines: { node: string }
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string | undefined>
  exports: Record<string, string>
  files: string[]
  publishConfig?: { access: string } | undefined
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
const linkedPackageLocations = [
  'vendor/cordis',
  'vendor/loader',
  'vendor/include',
  'packages/llm/llm',
  'packages/core/system-prompt',
  'packages/core/tools',
]

async function withTemporaryDirectory<T>(
  prefix: string,
  operation: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  try {
    return await operation(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ScaffoldError)
    assert.equal(error.code, code)
    return true
  }
}

async function createLinkedArtifactFixture(root: string): Promise<void> {
  for (const [index, location] of linkedPackageLocations.entries()) {
    const packageRoot = join(root, location)
    await mkdir(join(packageRoot, 'src'), { recursive: true })
    await mkdir(join(packageRoot, 'lib', 'types'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: `@fixture/linked-${index}`,
      main: 'lib/index.js',
      types: 'lib/types/index.d.ts',
    }))
    await writeFile(join(packageRoot, 'src', 'index.ts'), 'export const source = true\n')
    await writeFile(join(packageRoot, 'lib', 'index.js'), 'export const built = true\n')
    await writeFile(join(packageRoot, 'lib', 'types', 'index.d.ts'), 'export declare const built: true\n')
  }
}

test('creates a deterministic source-linked Tool project without overwriting it', async () => {
  await withTemporaryDirectory('dsh-generator-unit-', async root => {
    const requestedTarget = join(root, 'repository-audit')
    const result = await createProject({
      target: requestedTarget,
      description: '  Inspect a repository   and return an audit summary.  ',
      harnessRoot,
    })

    assert.equal(result.kind, 'tool')
    assert.equal(result.channel, baselineChannel)
    assert.equal(result.delivery, 'source')
    assert.equal(result.packageName, 'dsh-repository-audit')
    assert.equal(result.pluginName, 'repository-audit')
    assert.equal(result.toolName, 'repository_audit')
    assert.ok(result.files.includes('.gitignore'))
    assert.ok(result.files.includes('CLAUDE.md'))
    assert.ok(result.files.includes('src/index.ts'))
    assert.ok(result.files.includes('tests/loader.spec.ts'))

    const manifest = JSON.parse(
      await readFile(join(result.target, 'package.json'), 'utf8'),
    ) as GeneratedManifest
    assert.equal(manifest.description, 'Inspect a repository and return an audit summary.')
    assert.equal(manifest.private, true)
    assert.equal(manifest.packageManager, 'pnpm@11.7.0')
    assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0')
    assert.equal(
      manifest.dependencies['@deepseek-ai/schemastery'],
      selectedCatalog.packages.find(entry => entry.name === '@deepseek-ai/schemastery')!.version,
    )
    assert.equal(manifest.devDependencies.typescript, '^6.0.3')
    assert.equal(
      manifest.scripts['context:sync'],
      'node scripts/verify-dsh-context.mjs --sync-links --require-source && pnpm install --no-frozen-lockfile',
    )
    assert.equal(manifest.exports['./cordis.patch.yml'], './cordis.patch.yml')
    assert.equal(manifest.files.some(path => path.endsWith('.map')), false)
    assert.equal(await readFile(join(result.target, 'dsh-registry.lock.json'), 'utf8').catch(() => undefined), undefined)

    const toolsLink = manifest.devDependencies['@deepseek-ai/dsh-tools']
    assert.ok(toolsLink !== undefined)
    assert.match(toolsLink, /^link:/)
    assert.equal(
      await realpath(resolve(result.target, toolsLink.slice('link:'.length))),
      await realpath(join(harnessRoot, 'packages/core/tools')),
    )

    const source = await readFile(join(result.target, 'src/index.ts'), 'utf8')
    assert.match(source, /export const name = 'repository-audit'/)
    assert.match(source, /name: 'repository_audit'/)
    assert.doesNotMatch(source, /__[A-Z0-9_]+__/)

    await assert.rejects(
      createProject({
        target: requestedTarget,
        description: 'A second request must not replace project material.',
        harnessRoot,
      }),
      hasCode('DSH_SCAFFOLD_TARGET_NOT_EMPTY'),
    )
  })
})

test('creates a publishable Registry-delivered Tool project from ready evidence', async () => {
  await withTemporaryDirectory('dsh-generator-registry-', async root => {
    const edge = repositoryLock.channels.edge!
    assert.equal(edge.registry.status, 'ready')
    const edgeCatalog = JSON.parse(
      await readFile(join(repositoryRoot, edge.catalog.path), 'utf8'),
    ) as CatalogFile
    const target = join(root, 'registry-audit')
    const result = await createProject({
      target,
      channel: 'edge',
      delivery: 'registry',
      name: '@example/dsh-registry-audit',
      description: 'Verify a Registry-delivered plugin project.',
    })

    assert.equal(result.delivery, 'registry')
    assert.equal(result.harnessRoot, undefined)
    const manifest = JSON.parse(
      await readFile(join(target, 'package.json'), 'utf8'),
    ) as GeneratedManifest
    assert.equal(manifest.private, false)
    assert.equal(manifest.publishConfig!.access, 'public')
    assert.equal(manifest.scripts['context:sync'], undefined)
    assert.equal(
      manifest.scripts['context:check:strict'],
      'node scripts/verify-dsh-context.mjs --require-registry',
    )
    for (const packageName of Object.values({
      cordis: '@deepseek-ai/cordis',
      include: '@deepseek-ai/cordis-plugin-include',
      loader: '@deepseek-ai/cordis-plugin-loader',
      llm: '@deepseek-ai/dsh-llm',
      prompt: '@deepseek-ai/dsh-system-prompt',
      tools: '@deepseek-ai/dsh-tools',
    })) {
      const expected = edgeCatalog.packages.find(entry => entry.name === packageName)!.version
      assert.equal(manifest.devDependencies[packageName], expected)
    }
    assert.doesNotMatch(JSON.stringify(manifest), /(?:link:|workspace:)/)

    const generatedLock = JSON.parse(await readFile(join(target, 'dsh-reference.lock.json'), 'utf8'))
    const registryReport = JSON.parse(await readFile(join(target, 'dsh-registry.lock.json'), 'utf8'))
    assert.equal(generatedLock.delivery.mode, 'registry')
    assert.equal(generatedLock.delivery.status, 'ready')
    assert.equal(generatedLock.localResolution, null)
    assert.equal(registryReport.status, 'ready')
    assert.equal(registryReport.catalogSha256, generatedLock.upstream.catalogDigest)

    const verified = spawnSync(
      process.execPath,
      [join(target, 'scripts', 'verify-dsh-context.mjs'), '--require-registry'],
      { cwd: target, encoding: 'utf8' },
    )
    assert.equal(verified.status, 0, verified.stderr)
    assert.match(verified.stdout, /validated Registry evidence/)
  })
})

test('validates project intent before touching the target', async () => {
  await withTemporaryDirectory('dsh-generator-errors-', async root => {
    await assert.rejects(
      createProject({ target: join(root, 'service'), kind: 'service', description: 'Provide a service.' }),
      hasCode('DSH_SCAFFOLD_UNSUPPORTED_KIND'),
    )
    await assert.rejects(
      createProject({ target: join(root, 'delivery'), delivery: 'archive', description: 'Use an unsupported delivery.' }),
      hasCode('DSH_SCAFFOLD_UNSUPPORTED_DELIVERY'),
    )
    await assert.rejects(
      createProject({
        target: join(root, 'registry-source'),
        delivery: 'registry',
        harnessRoot,
        description: 'Reject a source root in Registry delivery.',
      }),
      hasCode('DSH_SCAFFOLD_USAGE'),
    )
    await assert.rejects(
      createProject({ target: join(root, 'blank'), description: '   ' }),
      hasCode('DSH_SCAFFOLD_INVALID_DESCRIPTION'),
    )
    await assert.rejects(
      createProject({ target: join(root, 'bad-name'), name: 'Bad Name', description: 'Do work.' }),
      hasCode('DSH_SCAFFOLD_INVALID_NAME'),
    )
    await assert.rejects(
      createProject({ target: join(root, 'long'), description: 'x'.repeat(301) }),
      hasCode('DSH_SCAFFOLD_INVALID_DESCRIPTION'),
    )
    await assert.rejects(
      createProject({
        target: join(root, 'explicit-reserved'),
        toolName: 'run_code',
        description: 'Attempt to claim the reserved Tool transport.',
      }),
      hasCode('DSH_SCAFFOLD_RESERVED_NAME'),
    )
    await assert.rejects(
      createProject({
        target: join(root, 'run-code'),
        description: 'Derive the reserved Tool transport from the directory.',
      }),
      hasCode('DSH_SCAFFOLD_RESERVED_NAME'),
    )
  })
})

test('reports missing and mismatched Harness checkouts with stable errors', async () => {
  await withTemporaryDirectory('dsh-generator-harness-', async root => {
    await assert.rejects(
      createProject({
        target: join(root, 'missing'),
        description: 'Exercise a missing Harness checkout.',
        harnessRoot: join(root, 'does-not-exist'),
      }),
      hasCode('DSH_SCAFFOLD_HARNESS_NOT_FOUND'),
    )
    await assert.rejects(
      createProject({
        target: join(root, 'mismatch'),
        description: 'Exercise a mismatched Harness checkout.',
        harnessRoot: repositoryRoot,
      }),
      hasCode('DSH_SCAFFOLD_HARNESS_MISMATCH'),
    )
  })
})

test('validates the pinned Node range without accepting the Node 23 gap', () => {
  const range = '^22.19.0 || >=24.0.0'
  assert.equal(nodeSatisfies(range, 'v22.19.0'), true)
  assert.equal(nodeSatisfies(range, 'v22.99.0'), true)
  assert.equal(nodeSatisfies(range, 'v23.0.0'), false)
  assert.equal(nodeSatisfies(range, 'v24.0.0'), true)
})

test('rejects missing and stale linked Harness build entries', async () => {
  await withTemporaryDirectory('dsh-generator-artifacts-', async root => {
    await createLinkedArtifactFixture(root)
    await validateHarnessArtifacts(root)

    const missingTypes = join(root, linkedPackageLocations[0]!, 'lib', 'types', 'index.d.ts')
    await rm(missingTypes)
    await assert.rejects(
      validateHarnessArtifacts(root),
      hasCode('DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING'),
    )

    await writeFile(missingTypes, 'export declare const built: true\n')
    const newerSource = join(root, linkedPackageLocations[1]!, 'src', 'index.ts')
    const future = new Date(Date.now() + 60_000)
    await utimes(newerSource, future, future)
    await assert.rejects(
      validateHarnessArtifacts(root),
      hasCode('DSH_SCAFFOLD_HARNESS_ARTIFACT_STALE'),
    )
  })
})

test('detects changes anywhere in the Harness worktree while respecting ignores', async () => {
  await withTemporaryDirectory('dsh-generator-worktree-', async root => {
    const init = spawnSync('git', ['-C', root, 'init', '--quiet'], { encoding: 'utf8' })
    assert.equal(init.status, 0, init.stderr)
    await writeFile(join(root, '.gitignore'), '**/lib/\n.env\n')
    const add = spawnSync('git', ['-C', root, 'add', '.gitignore'], { encoding: 'utf8' })
    assert.equal(add.status, 0, add.stderr)
    const commit = spawnSync('git', [
      '-C', root,
      '-c', 'user.name=DSH Fixture',
      '-c', 'user.email=dsh-fixture@example.invalid',
      'commit', '--quiet', '-m', 'fixture baseline',
    ], { encoding: 'utf8' })
    assert.equal(commit.status, 0, commit.stderr)

    await mkdir(join(root, 'vendor', 'cordis', 'lib'), { recursive: true })
    await writeFile(join(root, 'vendor', 'cordis', 'lib', 'index.js'), 'ignored build output\n')
    assert.equal(harnessWorktreeChanges(root), '')

    await writeFile(join(root, '.env'), 'DSH_FIXTURE=runtime-input\n')
    const ignoredRuntimeInput = harnessWorktreeChanges(root)
    assert.match(ignoredRuntimeInput, /!! \.env/)
    assert.doesNotMatch(ignoredRuntimeInput, /vendor\/cordis\/lib/)
    await rm(join(root, '.env'))

    await mkdir(join(root, 'apps', 'cli', 'src'), { recursive: true })
    await writeFile(join(root, 'apps', 'cli', 'src', 'dirty.ts'), 'export const dirty = true\n')
    const dirty = harnessWorktreeChanges(root)
    assert.match(dirty, /apps\/cli\/src\/dirty\.ts/)
    assert.doesNotMatch(dirty, /vendor\/cordis\/lib/)
  })
})

test('parses the public generator CLI contract', () => {
  assert.deepEqual(
    parseArgs([
      '--target', '/tmp/example',
      '--kind', 'tool',
      '--name', '@example/dsh-audit',
      '--plugin-name', 'audit',
      '--tool-name', 'audit_repository',
      '--description', 'Audit a repository.',
      '--harness-root', '/tmp/harness',
      '--channel', 'edge',
      '--delivery', 'registry',
      '--json',
    ]),
    {
      target: '/tmp/example',
      kind: 'tool',
      name: '@example/dsh-audit',
      pluginName: 'audit',
      toolName: 'audit_repository',
      description: 'Audit a repository.',
      harnessRoot: '/tmp/harness',
      channel: 'edge',
      delivery: 'registry',
      json: true,
    },
  )
  assert.throws(() => parseArgs(['--unknown']), hasCode('DSH_SCAFFOLD_USAGE'))
  assert.throws(() => parseArgs(['--target']), hasCode('DSH_SCAFFOLD_USAGE'))
})

test('executes the CLI through an installed Skill symlink', async () => {
  await withTemporaryDirectory('dsh-generator-symlink-', async root => {
    const skillLink = join(root, 'dsh-plugin-dev')
    await symlink(join(repositoryRoot, 'skills', 'dsh-plugin-dev'), skillLink, 'dir')

    const result = spawnSync(
      process.execPath,
      [join(skillLink, 'scripts', 'create-project.mjs'), '--help'],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /^Usage: create-project\.mjs/m)
  })
})
