import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  BaselineError,
  buildRegistryReport,
  computeCapabilityClosure,
  diffCatalogs,
  jsonText,
  scanHarness,
  selectChannel,
  sha256,
} from '../scripts/baseline.mjs'

async function withTemporaryDirectory(prefix, operation) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  try {
    return await operation(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

async function createHarnessFixture(root) {
  const version = '1.2.3-alpha.1'
  await writeJson(join(root, 'package.json'), {
    name: '@deepseek-ai/dsh-root',
    version,
    private: true,
    packageManager: 'pnpm@9.15.0',
    engines: { node: '>=22.0.0' },
    devDependencies: {
      '@types/node': '22.10.0',
      typescript: '5.7.0',
      vitest: '3.0.0',
    },
  })
  const packages = [
    ['apps/cli', '@deepseek-ai/dsh', { '@deepseek-ai/cordis-plugin-loader': '^1.0.0' }],
    ['vendor/cordis', '@deepseek-ai/cordis', {}],
    ['vendor/include', '@deepseek-ai/cordis-plugin-include', { '@deepseek-ai/cordis': '^4.0.0' }],
    ['vendor/loader', '@deepseek-ai/cordis-plugin-loader', { '@deepseek-ai/cordis': '^4.0.0' }],
    ['packages/llm/llm', '@deepseek-ai/dsh-llm', { '@deepseek-ai/cordis': '^4.0.0' }],
    ['packages/core/system-prompt', '@deepseek-ai/dsh-system-prompt', { '@deepseek-ai/cordis': '^4.0.0' }],
    ['packages/core/tools', '@deepseek-ai/dsh-tools', {
      '@deepseek-ai/cordis': '^4.0.0',
      zod: '^4.0.0',
    }],
  ]
  for (const [path, name, dependencies] of packages) {
    await writeJson(join(root, path, 'package.json'), {
      name,
      version: name === '@deepseek-ai/cordis' ? '4.0.1' : version,
      type: 'module',
      main: 'lib/index.js',
      types: 'lib/index.d.ts',
      dependencies,
      peerDependencies: {},
    })
  }
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'docs', 'architecture.md'), '# Fixture\n')
  const skills = [
    ['packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md', 'cordis-plugin-development'],
    ['packages/preset/agent-presets/presets/cordis/skills/editing-cordis-compositions/SKILL.md', 'editing-cordis-compositions'],
    ['.agents/skills/dsh-review/SKILL.md', 'dsh-review'],
    ['snapshots/session/workspace/.dsh/skills/example/SKILL.md', 'fixture-skill'],
  ]
  for (const [path, name] of skills) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), `---\nname: ${name}\ndescription: fixture\n---\n\n# ${name}\n`)
  }
  runGit(root, ['init', '--quiet'])
  runGit(root, ['add', '.'])
  runGit(root, [
    '-c', 'user.name=DSH Baseline Fixture',
    '-c', 'user.email=dsh-baseline@example.invalid',
    'commit', '--quiet', '-m', 'fixture baseline',
  ])
  runGit(root, ['tag', `dsh-v${version}`])
}

test('scans a clean tagged Harness into a deterministic package and Skill catalog', async () => {
  await withTemporaryDirectory('dsh-baseline-scan-', async root => {
    await createHarnessFixture(root)
    const first = scanHarness(root, { repository: 'https://example.invalid/harness.git' })
    const second = scanHarness(root, { repository: 'https://example.invalid/harness.git' })

    assert.equal(jsonText(first), jsonText(second))
    assert.equal(first.upstream.tag, 'dsh-v1.2.3-alpha.1')
    assert.equal(first.upstream.packageManager, 'pnpm@9.15.0')
    assert.equal(first.summary.packageCount, 7)
    assert.equal(first.summary.releasePackageCount, 7)
    assert.equal(first.summary.skillCount, 4)
    assert.equal(first.summary.productSkillCount, 2)
    assert.deepEqual(
      first.capabilities.tool.publicationClosure,
      [
        '@deepseek-ai/cordis',
        '@deepseek-ai/cordis-plugin-include',
        '@deepseek-ai/cordis-plugin-loader',
        '@deepseek-ai/dsh-llm',
        '@deepseek-ai/dsh-system-prompt',
        '@deepseek-ai/dsh-tools',
      ],
    )
    assert.deepEqual(first.capabilities.tool.externalRequirements, [{ name: 'zod', ranges: ['^4.0.0'] }])
    assert.match(first.summary.skillsDigest, /^[0-9a-f]{64}$/)

    await writeFile(join(root, 'docs', 'dirty.md'), 'dirty\n')
    assert.throws(
      () => scanHarness(root),
      error => error instanceof BaselineError && error.code === 'DSH_BASELINE_SOURCE_DIRTY',
    )
  })
})

test('computes transitive capability closure through runtime, optional, and peer edges', () => {
  const packages = [
    { name: 'a', manifest: { dependencies: { b: '1' }, optionalDependencies: {}, peerDependencies: {} } },
    { name: 'b', manifest: { dependencies: {}, optionalDependencies: { c: '1' }, peerDependencies: {} } },
    { name: 'c', manifest: { dependencies: {}, optionalDependencies: {}, peerDependencies: { a: '1' } } },
    { name: 'unused', manifest: { dependencies: {}, optionalDependencies: {}, peerDependencies: {} } },
  ]
  assert.deepEqual(computeCapabilityClosure(packages, ['a']), ['a', 'b', 'c'])
})

test('reports package, Skill, toolchain, and capability-closure changes', () => {
  const from = {
    upstream: { tag: 'dsh-v1', version: '1', node: '>=22', packageManager: 'pnpm@9', commit: 'a', docsDigest: 'd1' },
    packages: [
      { name: 'kept', version: '1', path: 'packages/a', manifestDigest: 'old' },
      { name: 'removed', version: '1', path: 'packages/b', manifestDigest: 'same' },
    ],
    skills: [{ path: '.agents/skills/old/SKILL.md', digest: 'old' }],
    capabilities: { tool: { publicationClosure: ['kept', 'removed'] } },
  }
  const to = {
    upstream: { tag: 'dsh-v2', version: '2', node: '>=24', packageManager: 'pnpm@10', commit: 'b', docsDigest: 'd2' },
    packages: [
      { name: 'added', version: '2', path: 'packages/c', manifestDigest: 'new' },
      { name: 'kept', version: '2', path: 'packages/a', manifestDigest: 'changed' },
    ],
    skills: [{ path: '.agents/skills/new/SKILL.md', digest: 'new' }],
    capabilities: { tool: { publicationClosure: ['added', 'kept'] } },
  }
  const diff = diffCatalogs(from, to)
  assert.deepEqual(diff.packages, { added: ['added'], removed: ['removed'], changed: ['kept'] })
  assert.deepEqual(diff.skills, {
    added: ['.agents/skills/new/SKILL.md'],
    removed: ['.agents/skills/old/SKILL.md'],
    changed: [],
  })
  assert.deepEqual(diff.toolClosure, { added: ['added'], removed: ['removed'] })
  assert.equal(diff.upstream.packageManager.to, 'pnpm@10')
})

test('Registry report blocks one missing exact upstream package and becomes ready when all resolve', async () => {
  const catalog = {
    packages: [
      {
        name: '@deepseek-ai/dsh',
        version: '1.2.3',
        private: false,
        releaseFamily: 'dsh',
      },
    ],
    capabilities: {
      tool: {
        publicationClosure: ['@deepseek-ai/dsh'],
        externalRequirements: [{ name: 'zod', ranges: ['^4.0.0'] }],
      },
    },
  }
  const blocked = await buildRegistryReport({
    channel: 'edge',
    catalog,
    catalogSha256: sha256(jsonText(catalog)),
    resolver: async requirement => ({ available: !requirement.startsWith('@deepseek-ai/dsh@') }),
    checkedAt: '2026-08-30T00:00:00.000Z',
  })
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.packages[0].available, false)

  const ready = await buildRegistryReport({
    channel: 'edge',
    catalog,
    catalogSha256: sha256(jsonText(catalog)),
    resolver: async () => ({ available: true, resolved: 'fixture' }),
    checkedAt: '2026-08-30T00:00:00.000Z',
  })
  assert.equal(ready.status, 'ready')
})

test('selects explicit channels and rejects unknown schema-v2 channels', () => {
  const lock = {
    schemaVersion: 2,
    defaultChannel: 'stable',
    channels: { stable: { upstream: { version: '1' } }, edge: { upstream: { version: '2' } } },
  }
  assert.equal(selectChannel(lock, 'stable').channel, 'stable')
  assert.equal(selectChannel(lock, 'edge').baseline.upstream.version, '2')
  assert.throws(
    () => selectChannel(lock, 'nightly'),
    error => error instanceof BaselineError && error.code === 'DSH_BASELINE_CHANNEL_UNKNOWN',
  )
})
