import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  ScaffoldError,
  createProject,
  parseArgs,
} from '../skills/dsh-plugin-dev/scripts/create-project.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = resolve(repositoryRoot, '..', 'deepseek-harness')

async function withTemporaryDirectory(prefix, operation) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  try {
    return await operation(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function hasCode(code) {
  return error => {
    assert.ok(error instanceof ScaffoldError)
    assert.equal(error.code, code)
    return true
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
    assert.equal(result.packageName, 'dsh-repository-audit')
    assert.equal(result.pluginName, 'repository-audit')
    assert.equal(result.toolName, 'repository_audit')
    assert.ok(result.files.includes('.gitignore'))
    assert.ok(result.files.includes('src/index.ts'))
    assert.ok(result.files.includes('tests/loader.spec.ts'))

    const manifest = JSON.parse(await readFile(join(result.target, 'package.json'), 'utf8'))
    assert.equal(manifest.description, 'Inspect a repository and return an audit summary.')
    assert.equal(manifest.private, true)
    assert.equal(manifest.dependencies['@deepseek-ai/schemastery'], '3.18.1')
    assert.equal(manifest.devDependencies.typescript, '6.0.3')

    const toolsLink = manifest.devDependencies['@deepseek-ai/dsh-tools']
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

test('validates project intent before touching the target', async () => {
  await withTemporaryDirectory('dsh-generator-errors-', async root => {
    await assert.rejects(
      createProject({ target: join(root, 'service'), kind: 'service', description: 'Provide a service.' }),
      hasCode('DSH_SCAFFOLD_UNSUPPORTED_KIND'),
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
