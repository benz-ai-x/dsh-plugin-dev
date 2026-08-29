import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  SkillInstallError,
  installUserSkill,
  installUserSkills,
} from '../scripts/install-user-skill.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(repositoryRoot, 'skills', 'dsh-plugin-dev')

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
    assert.ok(error instanceof SkillInstallError)
    assert.equal(error.code, code)
    return true
  }
}

test('installs one user Skill symlink and is idempotent', async () => {
  await withTemporaryDirectory('dsh-skill-install-', async root => {
    const targetRoot = join(root, '.agents', 'skills')
    const installed = await installUserSkill({ source, targetRoot })

    assert.equal(installed.status, 'installed')
    assert.equal((await lstat(installed.target)).isSymbolicLink(), true)
    assert.equal(await realpath(installed.target), await realpath(source))

    const repeated = await installUserSkill({ source, targetRoot })
    assert.equal(repeated.status, 'already-installed')
    assert.equal(repeated.target, installed.target)
  })
})

test('installs the canonical Skill for Codex and Claude Code and is idempotent', async () => {
  await withTemporaryDirectory('dsh-cross-agent-skill-install-', async homeDirectory => {
    const installed = await installUserSkills({ source, homeDirectory })

    assert.deepEqual(installed.map(result => [result.agent, result.status]), [
      ['codex', 'installed'],
      ['claude', 'installed'],
    ])
    assert.deepEqual(installed.map(result => result.target), [
      join(homeDirectory, '.agents', 'skills', 'dsh-plugin-dev'),
      join(homeDirectory, '.claude', 'skills', 'dsh-plugin-dev'),
    ])
    for (const result of installed) {
      assert.equal((await lstat(result.target)).isSymbolicLink(), true)
      assert.equal(await realpath(result.target), await realpath(source))
    }

    const repeated = await installUserSkills({ source, homeDirectory })
    assert.deepEqual(repeated.map(result => result.status), [
      'already-installed',
      'already-installed',
    ])
  })
})

test('preflights both agent targets before creating either link', async () => {
  await withTemporaryDirectory('dsh-cross-agent-skill-conflict-', async homeDirectory => {
    const claudeTarget = join(homeDirectory, '.claude', 'skills', 'dsh-plugin-dev')
    const codexTarget = join(homeDirectory, '.agents', 'skills', 'dsh-plugin-dev')
    await mkdir(claudeTarget, { recursive: true })

    await assert.rejects(
      installUserSkills({ source, homeDirectory }),
      hasCode('DSH_SKILL_INSTALL_CONFLICT'),
    )
    await assert.rejects(lstat(codexTarget), error => error?.code === 'ENOENT')
  })
})

test('can install only one selected code agent', async () => {
  await withTemporaryDirectory('dsh-selected-agent-skill-', async homeDirectory => {
    const [result] = await installUserSkills({ source, homeDirectory, agents: ['claude'] })

    assert.equal(result.agent, 'claude')
    assert.equal(result.target, join(homeDirectory, '.claude', 'skills', 'dsh-plugin-dev'))
    await assert.rejects(
      lstat(join(homeDirectory, '.agents', 'skills', 'dsh-plugin-dev')),
      error => error?.code === 'ENOENT',
    )
  })
})

test('dry-run does not create the target', async () => {
  await withTemporaryDirectory('dsh-skill-dry-run-', async root => {
    const targetRoot = join(root, '.agents', 'skills')
    const result = await installUserSkill({ source, targetRoot, dryRun: true })

    assert.equal(result.status, 'would-install')
    await assert.rejects(lstat(result.target), error => error?.code === 'ENOENT')
  })
})

test('refuses to overwrite an unrelated user installation', async () => {
  await withTemporaryDirectory('dsh-skill-conflict-', async root => {
    const targetRoot = join(root, '.agents', 'skills')
    await mkdir(join(targetRoot, 'dsh-plugin-dev'), { recursive: true })

    await assert.rejects(
      installUserSkill({ source, targetRoot }),
      hasCode('DSH_SKILL_INSTALL_CONFLICT'),
    )
  })
})

test('rejects a missing canonical Skill source', async () => {
  await withTemporaryDirectory('dsh-skill-source-', async root => {
    await assert.rejects(
      installUserSkill({ source: join(root, 'missing'), targetRoot: join(root, 'target') }),
      hasCode('DSH_SKILL_SOURCE_MISSING'),
    )
  })
})
