import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

import { analyzeProject } from '../skills/version-compatibility-analysis/scripts/analyze-project.mjs'
import { compareRevisions } from '../skills/version-compatibility-analysis/scripts/compare-revisions.mjs'
import { dependencyGraph, discoverWorkspace } from '../skills/version-compatibility-analysis/scripts/dependencies.mjs'
import type { Manifest } from '../skills/version-compatibility-analysis/scripts/dependencies.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillRoot = join(repositoryRoot, 'skills/version-compatibility-analysis')

async function temporary(operation: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-compatibility-'))
  try { await operation(root) } finally { await rm(root, { recursive: true, force: true }) }
}

async function file(root: string, path: string, content: string | object): Promise<void> {
  const destination = join(root, path)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, typeof content === 'string' ? content : `${JSON.stringify(content)}\n`)
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=Compatibility Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function fixture(root: string) {
  const harness = join(root, 'candidate with spaces')
  const project = join(root, 'downstream')
  await mkdir(harness)
  git(harness, 'init', '-q')
  await file(harness, 'package.json', { name: 'future-harness', version: '1.0.0', workspaces: ['WRONG/*'] })
  await file(harness, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n  - vendor/*\n  - '!packages/fixture'\nallowBuilds:\n  esbuild: true\n")
  await file(harness, 'packages/api/package.json', {
    name: '@fixture/api', version: '1.0.0', exports: { '.': './index.js', './legacy': './legacy.js' },
    peerDependencies: { '@fixture/core': 'workspace:*' }, optionalDependencies: { '@fixture/native': 'workspace:*' },
    devDependencies: { 'not-a-runtime-root': '99.0.0' },
  })
  await file(harness, 'packages/core/package.json', { name: '@fixture/core', version: '1.0.0', dependencies: { '@fixture/api': 'workspace:*' } })
  await file(harness, 'vendor/native/package.json', { name: '@fixture/native', version: '1.0.0', private: true, os: ['darwin'] })
  await file(harness, 'packages/fixture/package.json', { name: '@fixture/api', version: 'fake' })
  await file(harness, 'skills/example/SKILL.md', '---\nname: example\ndescription: fixture\n---\nRead references/detail.md.\n')
  await file(harness, 'skills/example/references/detail.md', 'Old guidance.\n')
  git(harness, 'add', '.')
  git(harness, 'commit', '-qm', 'old baseline')
  const base = git(harness, 'rev-parse', 'HEAD')
  git(harness, 'tag', 'fixture-old')
  await file(harness, 'package.json', { name: 'future-harness', version: '17.8.9-preview.42', workspaces: ['WRONG/*'] })
  await file(harness, 'pnpm-workspace.yaml', "packages:\n  - packages/*\n  - 'modules/**'\n  - vendor/*\n  - '!packages/fixture'\n")
  await mkdir(join(harness, 'modules/new/deep'), { recursive: true })
  await rename(join(harness, 'packages/core'), join(harness, 'modules/new/deep/core'))
  await file(harness, 'modules/new/deep/core/package.json', { name: '@fixture/core', version: '17.8.9-preview.42', futureContract: { revision: 123 }, dependencies: { '@fixture/api': 'workspace:*' } })
  await file(harness, 'packages/api/package.json', {
    name: '@fixture/api', version: '17.8.9-preview.42', description: '你好，新的契约', exports: { '.': './index.js' },
    peerDependencies: { '@fixture/core': 'workspace:*' }, dependencies: { '@fixture/bridge': 'workspace:*' },
    optionalDependencies: { '@fixture/native': 'workspace:*' },
  })
  await file(harness, 'packages/bridge/package.json', { name: '@fixture/bridge', version: '3.0.0', dependencies: { external: '^5.0.0' } })
  await file(harness, 'skills/example/references/detail.md', 'New source-backed guidance.\n')
  git(harness, 'add', '.')
  git(harness, 'commit', '-qm', 'unknown future release and layout')
  const target = git(harness, 'rev-parse', 'HEAD')
  git(harness, 'tag', 'future-no-version-prefix')
  const catalog = `${JSON.stringify({ capabilities: { actual: { publicationRoots: ['@fixture/api'] } } })}\n`
  await file(project, 'baselines/selected/catalog.json', catalog)
  const entry = {
    upstream: { commit: base, version: '1.0.0' },
    localResolution: { environmentVariable: 'FIXTURE_PINNED_ROOT', fallbackRelativePath: '../missing-old-worktree' },
    catalog: { path: 'baselines/selected/catalog.json', sha256: createHash('sha256').update(catalog).digest('hex') },
  }
  await file(project, 'dsh-reference.lock.json', { schemaVersion: 2, defaultChannel: 'reviewed', channels: { reviewed: entry, edge: entry } })
  return { harness, project, base, target }
}

test('discovers arbitrary future versions/layouts and dependency changes without updating the lock or code', async () => temporary(async root => {
  const { harness, project, base, target } = await fixture(root)
  const lockBefore = await readFile(join(project, 'dsh-reference.lock.json'))
  const indexBefore = await readFile(join(harness, '.git/index'))
  const indexTime = (await stat(join(harness, '.git/index'))).mtimeMs
  const report = analyzeProject({ project, harnessRoot: harness }, {})
  assert.equal(report.base.commit, base)
  assert.equal(report.target.commit, target)
  assert.equal(report.target.rootManifest?.version, '17.8.9-preview.42')
  assert.equal(report.project.channel, 'reviewed')
  assert.match(report.project.dependencyRootsSource, /digest-checked.*actual/)
  assert.equal(report.workspaces.before.packagePaths.length, 3)
  assert.equal(report.workspaces.after.packagePaths.length, 4)
  assert.equal(report.workspaces.after.source, 'pnpm-workspace.yaml')
  assert.equal(report.issues.length, 0)
  assert.deepEqual(report.dependencies.added, ['@fixture/bridge'])
  assert.deepEqual(report.dependencies.removed, [])
  const core = report.dependencies.after.nodes.find(node => node.name === '@fixture/core')!
  assert.equal(core.path, 'modules/new/deep/core/package.json')
  const native = report.dependencies.after.nodes.find(node => node.name === '@fixture/native')!
  assert.equal(native.conditional, true)
  assert.equal(native.private, true)
  assert.ok(!report.dependencies.after.edges.some(edge => edge.name === 'not-a-runtime-root'))
  assert.ok(report.dependencies.after.edges.some(edge => edge.name === 'external' && edge.range === '^5.0.0' && edge.resolution === 'external'))
  assert.equal(report.dependencies.after.registryStatus, 'not-queried')
  const api = report.manifests.contractChanged.find(item => item.name === '@fixture/api')!
  assert.ok(api.changes.some(change => change.field.join('.') === 'exports../legacy' && change.to === undefined))
  assert.equal(report.skillEntrypoints.unchangedCount, 1)
  assert.deepEqual(report.skillResources, [{ entrypoint: 'skills/example/SKILL.md', changedPaths: ['skills/example/references/detail.md'] }])
  assert.match(report.assessment, /not been established/)
  assert.deepEqual(await readFile(join(project, 'dsh-reference.lock.json')), lockBefore)
  assert.deepEqual(await readFile(join(harness, '.git/index')), indexBefore)
  assert.equal((await stat(join(harness, '.git/index'))).mtimeMs, indexTime)
  assert.equal(git(harness, 'rev-parse', 'HEAD'), target)
  assert.equal(git(harness, 'status', '--porcelain'), '')
}))

test('re-reads a later layout and all new manifest keys, never confusing HEAD with the selected target', async () => temporary(async root => {
  const { harness, project, target } = await fixture(root)
  await file(harness, 'package.json', { name: 'future-harness', version: '900.1.0', workspaces: { packages: ['layers/**', 'packages/*', 'vendor/*', '!packages/fixture'] } })
  await rm(join(harness, 'pnpm-workspace.yaml'))
  await mkdir(join(harness, 'layers'), { recursive: true })
  await rename(join(harness, 'modules/new/deep/core'), join(harness, 'layers/engine'))
  await file(harness, 'packages/api/package.json', { name: '@fixture/api', version: '900.1.0', newlyInventedMetadata: { feature: true }, dependencies: { '@fixture/core': 'workspace:*' } })
  git(harness, 'add', '.')
  git(harness, 'commit', '-qm', 'another future layout')
  const next = git(harness, 'rev-parse', 'HEAD')
  const future = analyzeProject({ project, harnessRoot: harness }, {})
  assert.equal(future.target.commit, next)
  assert.equal(future.workspaces.after.source, 'package.json#workspaces')
  assert.equal(future.dependencies.after.nodes.find(node => node.name === '@fixture/core')?.path, 'layers/engine/package.json')
  assert.ok(future.manifests.contractChanged.find(item => item.path === 'packages/api/package.json')?.changes.some(change => change.field[0] === 'newlyInventedMetadata'))
  const selected = analyzeProject({ project, harnessRoot: harness, target: 'future-no-version-prefix' }, {})
  assert.equal(selected.target.commit, target)
  assert.equal(selected.checkout.commit, next)
  await file(harness, 'untracked.txt', 'not part of the candidate')
  const dirty = compareRevisions({ repo: harness, base: target, target: target, roots: ['@fixture/api'] })
  assert.equal(dirty.checkout.dirty, true)
  assert.equal(dirty.diff.changedPaths, 0)
  const reversed = compareRevisions({ repo: harness, base: next, target, roots: ['@fixture/api'] })
  assert.equal(reversed.baseIsAncestor, false)
}))

test('reports missing revisions, unsupported locks and tampered catalogs; explicit inputs remain available', async () => temporary(async root => {
  const { harness, project, base } = await fixture(root)
  assert.throws(() => analyzeProject({ project, harnessRoot: harness, base: 'nonexistent-commit' }, {}), { code: 'COMPAT_GIT_ERROR' })
  assert.throws(() => analyzeProject({ project, harnessRoot: harness, channel: 'missing' }, {}), { code: 'COMPAT_LOCK_CHANNEL' })
  await file(project, 'baselines/selected/catalog.json', {})
  assert.throws(() => analyzeProject({ project, harnessRoot: harness }, {}), { code: 'COMPAT_CATALOG_DIGEST' })
  const explicit = analyzeProject({ project, harnessRoot: harness, roots: ['@fixture/api'] }, {})
  assert.equal(explicit.project.dependencyRootsSource, 'explicit --root-package')
  await file(project, 'dsh-reference.lock.json', { schemaVersion: 200, newContract: { base } })
  assert.throws(() => analyzeProject({ project, harnessRoot: harness }, {}), { code: 'COMPAT_LOCK_SCHEMA' })
  const unknown = analyzeProject({ project, harnessRoot: harness, base, roots: ['@fixture/api'] }, {})
  assert.ok(unknown.issues.some(issue => issue.kind === 'lock-schema'))
  assert.equal(unknown.base.commit, base)
}))

test('honors candidate path precedence and runs as a relocated dependency-free skill', async () => temporary(async root => {
  const { harness, project } = await fixture(root)
  const environment = { DSH_HARNESS_ROOT: harness, FIXTURE_PINNED_ROOT: '/missing-pinned-root' }
  const report = analyzeProject({ project }, environment)
  assert.equal(report.project.candidatePathSource, 'DSH_HARNESS_ROOT')
  assert.equal(analyzeProject({ project, harnessRoot: harness }, { DSH_HARNESS_ROOT: '/invalid' }).project.candidatePathSource, '--harness-root')
  const relocated = join(root, 'plugin-cache/skills/version-compatibility-analysis')
  await cp(skillRoot, relocated, { recursive: true })
  const result = spawnSync(process.execPath, [join(relocated, 'scripts/analyze-project.mjs'), '--project', project, '--harness-root', harness], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).dependencies.after.nodes.length, 4)
  const invalid = spawnSync(process.execPath, [join(relocated, 'scripts/compare-revisions.mjs'), '--repo'], { cwd: root, encoding: 'utf8' })
  assert.equal(invalid.status, 1)
  assert.equal(JSON.parse(invalid.stderr).error, 'COMPAT_USAGE')
}))

test('surfaces unsupported workspace declarations, aliases, duplicate packages and invalid JSON instead of hiding them', async () => temporary(async root => {
  const { harness, base } = await fixture(root)
  await file(harness, 'pnpm-workspace.yaml', 'packages: *future-anchor\n')
  await file(harness, 'fixtures/broken/package.json', '{ privateSecret: "do not echo this"')
  git(harness, 'add', '.')
  git(harness, 'commit', '-qm', 'unsupported input')
  const report = compareRevisions({ repo: harness, base, roots: ['@fixture/api'] })
  assert.equal(report.workspaces.after.status, 'unknown')
  assert.ok(report.issues.some(issue => issue.kind === 'invalid-manifest'))
  assert.ok(report.issues.some(issue => issue.kind === 'workspace-definition'))
  assert.ok(!JSON.stringify(report).includes('do not echo this'))
  assert.deepEqual(report.dependencies.after.unresolvedRoots, ['@fixture/api'])
  const manifests = new Map<string, Manifest>([
    ['package.json', { name: 'root' }],
    ['a/package.json', { name: 'a', dependencies: { duplicate: '*', alias: 'npm:real@1', gone: 'workspace:*' } }],
    ['b/package.json', { name: 'duplicate' }], ['c/package.json', { name: 'duplicate' }],
  ])
  const graph = dependencyGraph(manifests, [...manifests.keys()], ['a'])
  assert.equal(graph.edges.filter(edge => edge.resolution === 'unresolved').length, 3)
  assert.ok(graph.issues.length >= 3)
}))

test('workspace parsing supports exclusions/quotes and optional paths never override required reachability', () => {
  const manifests = new Map<string, Manifest>([
    ['package.json', { name: 'root', workspaces: ['old/*'] }],
    ['packages/a/package.json', { name: 'a', dependencies: { shared: '*' }, optionalDependencies: { optional: '*' } }],
    ['packages/b/package.json', { name: 'optional', dependencies: { shared: '*' }, peerDependencies: { peer: '*' }, peerDependenciesMeta: { peer: { optional: true } } }],
    ['packages/shared/package.json', { name: 'shared', dependencies: { a: '*' } }],
    ['packages/peer/package.json', { name: 'peer' }],
    ['packages/fixtures/package.json', { name: 'a' }],
  ])
  const workspace = discoverWorkspace(manifests, 'packages:\n  - "packages/*" # dynamic\n  - \'!packages/fixtures\'\n')
  assert.equal(workspace.packagePaths.length, 4)
  assert.equal(discoverWorkspace(manifests, 'packages: ["packages/*", "!packages/fixtures"]\n').packagePaths.length, 4)
  const graph = dependencyGraph(manifests, workspace.packagePaths, ['a'])
  assert.equal(graph.nodes.find(node => node.name === 'shared')?.conditional, false)
  assert.equal(graph.nodes.find(node => node.name === 'peer')?.conditional, true)
  assert.equal(graph.issues.length, 0)
})

test('the actual package archive ships a runnable companion with its canonical resources', { timeout: 60_000 }, async () => temporary(async root => {
  const { harness, project } = await fixture(root)
  const archive = join(root, 'tooling.tgz')
  const packed = spawnSync('pnpm', ['pack', '--out', archive], {
    cwd: repositoryRoot, encoding: 'utf8', timeout: 45_000, maxBuffer: 16 * 1024 * 1024,
  })
  assert.equal(packed.status, 0, packed.error?.message ?? packed.stderr)
  const extracted = join(root, 'unpacked')
  await mkdir(extracted)
  const unpacked = spawnSync('tar', ['-xzf', archive, '-C', extracted], { encoding: 'utf8' })
  assert.equal(unpacked.status, 0, unpacked.stderr)
  const packagedSkill = join(extracted, 'package/skills/version-compatibility-analysis')
  for (const path of ['SKILL.md', 'agents/openai.yaml', 'references/node-projects.md', 'references/deepseek-harness.md', 'references/npm-downloads.md', 'scripts/download-packages.mjs']) {
    assert.deepEqual(await readFile(join(packagedSkill, path)), await readFile(join(skillRoot, path)))
  }
  const result = spawnSync(process.execPath, [join(packagedSkill, 'scripts/analyze-project.mjs'), '--project', project, '--harness-root', harness], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.workspaces.after.packagePaths.length, 4)
  assert.deepEqual(report.dependencies.added, ['@fixture/bridge'])
  // A private-only candidate scope exercises the packed opt-in entry and
  // deferred report without a network request or unpublished fixture package.
  const download = spawnSync(process.execPath, [join(packagedSkill, 'scripts/analyze-project.mjs'), '--project', project, '--harness-root', harness,
    '--root-package', '@fixture/native', '--download-missing', '--download-dir', join(root, 'archives')], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  assert.equal(download.status, 2, download.stderr)
  const downloads = JSON.parse(download.stdout).downloads
  assert.equal(downloads.status, 'partial')
  assert.deepEqual(downloads.packages, [])
  assert.equal(downloads.deferred[0].reason, 'private-package')
}))
