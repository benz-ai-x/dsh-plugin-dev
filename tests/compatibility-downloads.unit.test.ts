import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test } from 'vitest'

import { createDownloadPlan, downloadPackages } from '../skills/version-compatibility-analysis/scripts/download-packages.mjs'
import { dependencyGraph } from '../skills/version-compatibility-analysis/scripts/dependencies.mjs'
import type { DownloadPlan, NpmQuery } from '../skills/version-compatibility-analysis/scripts/download-packages.mjs'

const run = promisify(execFile)
const bytes = Buffer.from('fixture archive bytes')
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
const plan: DownloadPlan = {
  packages: [{ name: '@fixture/core', version: '900.1.0-preview.42', conditional: false }], deferred: [], issues: [],
}

async function temporary(operation: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-download-test-'))
  try { await operation(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('download targets follow future candidate versions, deduplicate exact dependencies and defer unpinned/private inputs', () => {
  const manifests = new Map([
    ['api/package.json', { name: '@fixture/api', version: '900.1.0-preview.42', dependencies: { '@fixture/core': 'workspace:*', exact: '2.3.4', range: '^5' }, optionalDependencies: { private: 'workspace:*' } }],
    ['moved/core/package.json', { name: '@fixture/core', version: '800.0.1', dependencies: { exact: '2.3.4' } }],
    ['private/package.json', { name: 'private', version: '1.0.0', private: true }],
  ])
  const result = createDownloadPlan(dependencyGraph(manifests, [...manifests.keys()], ['@fixture/api']))
  assert.deepEqual(result.packages.map(item => `${item.name}@${item.version}`), ['@fixture/api@900.1.0-preview.42', '@fixture/core@800.0.1', 'exact@2.3.4'])
  assert.ok(result.deferred.some(item => item.name === 'range' && item.reason === 'exact-version-required'))
  assert.ok(result.deferred.some(item => item.name === 'private' && item.conditional && item.reason === 'private-package'))
})

test('verified archives are reused; metadata is rechecked and corrupted cache files are preserved, not overwritten', async () => temporary(async root => {
  let packs = 0
  let queries = 0
  const npm: NpmQuery = async (args, cwd) => {
    assert.ok(args.includes('--ignore-scripts=true'))
    assert.ok(args.includes('--@fixture:registry=https://registry.npmjs.org/'))
    if (args[0] === 'view') { queries++; return { name: '@fixture/core', version: '900.1.0-preview.42', dist: { integrity } } }
    packs++
    await writeFile(join(cwd, 'fixture.tgz'), bytes)
    return [{ name: '@fixture/core', version: '900.1.0-preview.42', filename: 'fixture.tgz' }]
  }
  const options = { directory: join(root, 'downloads'), registry: 'https://registry.npmjs.org' }
  const first = await downloadPackages(plan, options, npm)
  assert.equal(first.packages[0]?.status, 'downloaded')
  const archive = first.packages[0]!.archive!
  assert.deepEqual(await readFile(archive), bytes)
  assert.equal((await downloadPackages(plan, options, npm)).packages[0]?.status, 'cached')
  assert.equal(packs, 1)
  assert.equal(queries, 2)
  await writeFile(archive, 'corrupt but preserve me')
  const damaged = await downloadPackages(plan, options, npm)
  assert.equal(damaged.status, 'partial')
  assert.equal(damaged.packages[0]?.code, 'COMPAT_DOWNLOAD_INTEGRITY')
  assert.equal(await readFile(archive, 'utf8'), 'corrupt but preserve me')
  assert.equal(packs, 1)
  assert.ok(!(await readdir(options.directory)).some(name => name.startsWith('.npm-run-')))
}))

test('unavailable, authentication and network errors remain distinct without leaking npm diagnostics', async () => temporary(async root => {
  for (const [code, status] of [['E404', 'not-found'], ['ETARGET', 'not-found'], ['E401', 'auth-error'], ['E403', 'auth-error'], ['ETIMEDOUT', 'network-error']]) {
    const report = await downloadPackages(plan, { directory: join(root, code!), registry: 'https://registry.npmjs.org' }, async () => {
      throw Object.assign(new Error('secret token in stderr'), { stdout: JSON.stringify({ error: { code, summary: 'secret token' } }) })
    })
    assert.equal(report.status, 'partial')
    assert.equal(report.packages[0]?.status, status)
    assert.ok(!JSON.stringify(report).includes('secret token'))
  }
}))

test('rejects unsafe output, Registry URLs and local/Git specs before any npm invocation', async () => temporary(async root => {
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'package.json'), '{"private":true}')
  const before = await readFile(join(project, 'package.json'))
  const npm: NpmQuery = async () => { assert.fail('must not invoke npm') }
  const options = { directory: project, registry: 'https://registry.npmjs.org', protectedRoots: [project] }
  await assert.rejects(downloadPackages(plan, options, npm), { code: 'COMPAT_DOWNLOAD_DIRECTORY' })
  await assert.rejects(downloadPackages(plan, { ...options, directory: join(project, 'cache') }, npm), { code: 'COMPAT_DOWNLOAD_DIRECTORY' })
  await symlink(project, join(root, 'alias'))
  await assert.rejects(downloadPackages(plan, { ...options, directory: join(root, 'alias/cache') }, npm), { code: 'COMPAT_DOWNLOAD_DIRECTORY' })
  await assert.rejects(downloadPackages(plan, { ...options, directory: root }, npm), { code: 'COMPAT_DOWNLOAD_DIRECTORY' })
  await assert.rejects(downloadPackages(plan, { ...options, directory: join(root, 'new'), registry: 'https://token@example.test/?secret=1' }, npm), { code: 'COMPAT_DOWNLOAD_REGISTRY' })
  await assert.rejects(downloadPackages({ ...plan, packages: [{ name: 'git+https://untrusted.test/a', version: '*', conditional: false }] }, { ...options, directory: join(root, 'new') }, npm), { code: 'COMPAT_DOWNLOAD_SPEC' })
  assert.deepEqual(await readFile(join(project, 'package.json')), before)
  assert.deepEqual(await readdir(project), ['package.json'])
}))

test('rejects changed package identities, unsafe pack filenames and bad tarball integrity', async () => temporary(async root => {
  for (const mode of ['identity', 'filename', 'integrity']) {
    const report = await downloadPackages(plan, { directory: join(root, mode), registry: 'https://registry.npmjs.org' }, async (args, cwd) => {
      if (args[0] === 'view') return { name: '@fixture/core', version: '900.1.0-preview.42', dist: { integrity } }
      await writeFile(join(cwd, 'fixture.tgz'), mode === 'integrity' ? 'bad bytes' : bytes)
      return [{ name: mode === 'identity' ? 'wrong' : '@fixture/core', version: '900.1.0-preview.42', filename: mode === 'filename' ? '../escape.tgz' : 'fixture.tgz' }]
    })
    assert.equal(report.status, 'partial')
    assert.ok(!report.packages[0]?.archive)
    assert.ok(!(await readdir(join(root, mode))).some(name => name.endsWith('.tgz')))
  }
}))

test('real npm downloads a local Registry tarball without installing dependencies or executing lifecycle scripts', { timeout: 45_000 }, async () => temporary(async root => {
  const packageRoot = join(root, 'package')
  await mkdir(packageRoot)
  const marker = join(root, 'lifecycle-ran')
  const script = `node -e 'require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran")'`
  const manifest = { name: '@fixture/core', version: '900.1.0-preview.42', dependencies: { 'must-not-install': '1.0.0' }, scripts: { prepack: script, prepare: script, postpack: script, preinstall: script, install: script, postinstall: script } }
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest))
  const packed = spawnSync('tar', ['-czf', join(root, 'fixture.tgz'), '-C', root, 'package'], { encoding: 'utf8' })
  assert.equal(packed.status, 0, packed.stderr)
  const tarball = await readFile(join(root, 'fixture.tgz'))
  const sri = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
  let registry = ''
  let tarballRequests = 0
  const server = createServer((request, response) => {
    if (request.url === '/fixture.tgz') { tarballRequests++; response.end(tarball); return }
    if (!decodeURIComponent(request.url ?? '').startsWith('/@fixture/core')) { response.writeHead(404); response.end('{"error":"not found"}'); return }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ name: manifest.name, 'dist-tags': { latest: manifest.version }, versions: { [manifest.version]: { ...manifest, dist: { tarball: `${registry}/fixture.tgz`, integrity: sri } } } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  registry = `http://127.0.0.1:${address.port}`
  try {
    const options = { directory: join(root, 'downloads'), registry }
    const report = await downloadPackages(plan, options)
    assert.equal(report.packages[0]?.status, 'downloaded', JSON.stringify(report))
    assert.deepEqual(await readFile(report.packages[0]!.archive!), tarball)
    assert.equal((await downloadPackages(plan, options)).packages[0]?.status, 'cached')
    assert.equal(tarballRequests, 1)
    assert.ok(!(await readdir(root)).includes('lifecycle-ran'))
    assert.ok(!(await readdir(options.directory)).includes('node_modules'))
    const missing = await downloadPackages({ ...plan, packages: [{ ...plan.packages[0]!, version: '900.2.0' }] }, options)
    assert.equal(missing.packages[0]?.status, 'not-found')

    // Exercise the user-facing CLI, not just the module, against the same real
    // Registry. The package archive declares a dependency that npm pack must
    // not install; the committed analysis scope has no such external edge.
    const upstream = join(root, 'upstream')
    const downstream = join(root, 'downstream')
    await mkdir(upstream)
    await mkdir(downstream)
    const input = JSON.stringify({ name: manifest.name, version: manifest.version })
    await writeFile(join(upstream, 'package.json'), input)
    await run('git', ['init', '-q', upstream])
    await run('git', ['-C', upstream, 'add', 'package.json'])
    await run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', upstream, 'commit', '-qm', 'fixture'])
    const cli = fileURLToPath(new URL('../skills/version-compatibility-analysis/scripts/analyze-project.mjs', import.meta.url))
    const args = [cli, '--project', downstream, '--harness-root', upstream, '--base', 'HEAD', '--root-package', manifest.name]
    const readonly = JSON.parse((await run(process.execPath, args)).stdout)
    assert.equal(readonly.downloads, undefined)
    assert.equal(tarballRequests, 1)
    await assert.rejects(run(process.execPath, [...args, '--download-dir', join(root, 'unauthorized')]), error => {
      assert.equal(JSON.parse((error as { stderr: string }).stderr).error, 'COMPAT_USAGE')
      return true
    })
    const cliReport = JSON.parse((await run(process.execPath, [...args, '--download-missing', '--download-dir', options.directory, '--registry', registry])).stdout)
    assert.equal(cliReport.downloads.packages[0].status, 'cached')
    assert.equal(cliReport.dependencies.after.registryStatus, 'not-queried')
    assert.equal(cliReport.assessment, 'evidence-only; compatibility has not been established')
    assert.deepEqual(await readdir(downstream), [])
    assert.equal((await run('git', ['-C', upstream, 'status', '--porcelain'])).stdout, '')
    assert.equal(await readFile(join(upstream, 'package.json'), 'utf8'), input)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}))
