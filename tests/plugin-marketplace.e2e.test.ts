import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, cp, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginManifestPath = join(repositoryRoot, '.codex-plugin', 'plugin.json')
const pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8')) as {
  name: string
  version: string
}
const repositoryLockDefaultChannel = JSON.parse(
  await readFile(join(repositoryRoot, 'dsh-reference.lock.json'), 'utf8'),
) as { defaultChannel: string }

const codexPath = spawnSync('which', ['codex'], { encoding: 'utf8' }).stdout.trim()
const codexAvailable = codexPath.length > 0

interface CodexJsonResult {
  status: number | null
  stdout: string
  stderr: string
}

function codex(
  codexHome: string,
  args: readonly string[],
  cwd: string,
): CodexJsonResult {
  const result = spawnSync(codexPath, [...args, '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', CODEX_HOME: codexHome, NO_COLOR: '1' },
    maxBuffer: 20 * 1024 * 1024,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function codexOk(codexHome: string, args: readonly string[], cwd: string): unknown {
  const result = codex(codexHome, args, cwd)
  assert.equal(
    result.status,
    0,
    `codex ${args.join(' ')} failed: ${result.stderr || result.stdout}`,
  )
  const text = result.stdout.trim()
  try {
    return JSON.parse(text)
  } catch {
    const lastLine = text.split('\n').at(-1) ?? ''
    try {
      return JSON.parse(lastLine)
    } catch {
      return text
    }
  }
}

async function materializeMarketplace(root: string): Promise<string> {
  const marketplaceRoot = join(root, 'marketplace')
  const pluginDirectory = join(marketplaceRoot, 'plugins', pluginManifest.name)
  await mkdir(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true })
  await mkdir(pluginDirectory, { recursive: true })
  await cp(join(repositoryRoot, '.codex-plugin'), join(pluginDirectory, '.codex-plugin'), {
    recursive: true,
  })
  await cp(join(repositoryRoot, 'skills'), join(pluginDirectory, 'skills'), { recursive: true })
  await writeFile(
    join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    `${JSON.stringify(
      {
        name: 'dsh-plugin-dev-local',
        interface: { displayName: 'DSH Plugin Dev (local)' },
        plugins: [
          {
            name: pluginManifest.name,
            source: { source: 'local', path: `./plugins/${pluginManifest.name}` },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Developer Tools',
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
  return marketplaceRoot
}

test(
  'packaged plugin installs, reinstalls, and removes through a local marketplace',
  { timeout: 120_000 },
  async (t) => {
    if (!codexAvailable) {
      t.skip('codex CLI is not installed on this host')
      return
    }
    const scratch = await mkdtemp(join(tmpdir(), 'dsh-plugin-marketplace-'))
    try {
      const codexHome = join(scratch, 'codex-home')
      await mkdir(codexHome, { recursive: true })
      const marketplaceRoot = await materializeMarketplace(scratch)

      const added = codexOk(codexHome, ['plugin', 'marketplace', 'add', marketplaceRoot], scratch) as {
        marketplaceName: string
        alreadyAdded: boolean
      }
      assert.equal(added.marketplaceName, 'dsh-plugin-dev-local')
      assert.equal(added.alreadyAdded, false)

      const listed = codexOk(codexHome, ['plugin', 'list', '--available'], scratch) as {
        available: Array<{ name: string }>
      }
      assert.ok(
        listed.available.some((plugin) => plugin.name === pluginManifest.name),
        'marketplace exposes the packaged plugin',
      )

      const installed = codexOk(
        codexHome,
        ['plugin', 'add', `${pluginManifest.name}@dsh-plugin-dev-local`],
        scratch,
      ) as { pluginId: string; version: string; installedPath: string }
      assert.equal(installed.pluginId, `${pluginManifest.name}@dsh-plugin-dev-local`)
      assert.equal(installed.version, pluginManifest.version)

      const cachedSkill = join(
        installed.installedPath,
        'skills',
        pluginManifest.name,
        'SKILL.md',
      )
      assert.ok(existsSync(cachedSkill), 'installed cache carries the canonical Skill')
      const companion = join(installed.installedPath, 'skills/version-compatibility-analysis')
      assert.equal(
        await readFile(join(companion, 'SKILL.md'), 'utf8'),
        await readFile(join(repositoryRoot, 'skills/version-compatibility-analysis/SKILL.md'), 'utf8'),
        'installed Plugin carries the project companion',
      )
      const companionHelp = spawnSync(process.execPath, [join(companion, 'scripts/analyze-project.mjs'), '--help'], { encoding: 'utf8' })
      assert.equal(companionHelp.status, 0, companionHelp.stderr)
      assert.match(companionHelp.stdout, /Read-only JSON evidence/)
      assert.equal(
        await readFile(cachedSkill, 'utf8'),
        await readFile(
          join(repositoryRoot, 'skills', pluginManifest.name, 'SKILL.md'),
          'utf8',
        ),
        'installed Skill body byte-matches the canonical source',
      )

      const reinstalled = codexOk(
        codexHome,
        ['plugin', 'add', `${pluginManifest.name}@dsh-plugin-dev-local`],
        scratch,
      ) as { pluginId: string }
      assert.equal(
        reinstalled.pluginId,
        installed.pluginId,
        'reinstall through the marketplace is idempotent',
      )

      const afterInstall = codexOk(codexHome, ['plugin', 'list'], scratch) as {
        installed: Array<{ pluginId: string; installed: boolean; enabled: boolean }>
      }
      assert.ok(
        afterInstall.installed.some(
          (plugin) => plugin.pluginId === installed.pluginId && plugin.installed && plugin.enabled,
        ),
        'installed plugin is listed as installed and enabled',
      )

      codexOk(
        codexHome,
        ['plugin', 'remove', `${pluginManifest.name}@dsh-plugin-dev-local`],
        scratch,
      )
      assert.ok(
        !existsSync(
          join(codexHome, 'plugins', 'cache', 'dsh-plugin-dev-local', pluginManifest.name),
        ),
        'remove clears the installed plugin cache',
      )

      codexOk(codexHome, ['plugin', 'marketplace', 'remove', 'dsh-plugin-dev-local'], scratch)
      const marketplaces = codex(codexHome, ['plugin', 'marketplace', 'list'], scratch)
      assert.ok(
        !marketplaces.stdout.includes('dsh-plugin-dev-local'),
        'marketplace source is unregistered',
      )
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  },
)

const semanticSmokeEnabled = process.env.DSH_CODEX_SEMANTIC === '1'
const userAuthPath = join(
  process.env.CODEX_HOME ?? join(process.env.HOME ?? '', '.codex'),
  'auth.json',
)

test(
  'semantic smoke: a fresh Codex process discovers the marketplace-installed Skill',
  { timeout: 1_500_000 },
  async (t) => {
    if (!codexAvailable) {
      t.skip('codex CLI is not installed on this host')
      return
    }
    if (!semanticSmokeEnabled) {
      t.skip('set DSH_CODEX_SEMANTIC=1 to run the real-model marketplace smoke')
      return
    }
    if (!existsSync(userAuthPath)) {
      t.skip('no Codex auth.json to copy into the isolated home')
      return
    }
    const repositoryLock = JSON.parse(
      await readFile(join(repositoryRoot, 'dsh-reference.lock.json'), 'utf8'),
    ) as {
      channels: Record<string, { localResolution: { fallbackRelativePath: string } }>
    }
    const harnessRoot = resolve(
      repositoryRoot,
      repositoryLock.channels[repositoryLockDefaultChannel.defaultChannel]!.localResolution
        .fallbackRelativePath,
    )
    if (!existsSync(harnessRoot)) {
      t.skip('pinned Harness baseline worktree is not present for source resolution')
      return
    }
    const scratch = await mkdtemp(join(tmpdir(), 'dsh-plugin-marketplace-semantic-'))
    let keepScratch = true
    try {
      const codexHome = join(scratch, 'codex-home')
      await mkdir(codexHome, { recursive: true })
      await cp(userAuthPath, join(codexHome, 'auth.json'))
      const marketplaceRoot = await materializeMarketplace(scratch)
      codexOk(codexHome, ['plugin', 'marketplace', 'add', marketplaceRoot], scratch)
      codexOk(
        codexHome,
        ['plugin', 'add', `${pluginManifest.name}@dsh-plugin-dev-local`],
        scratch,
      )

      const workDirectory = join(scratch, 'empty-directory')
      await mkdir(workDirectory, { recursive: true })
      const prompt = [
        'Use $dsh-plugin-dev to create a DSH tool plugin named dsh-repository-audit.',
        'It accepts a repository path and returns a structured audit summary.',
        'Explain the selected plugin shape, then generate the project baseline here',
        'with the deterministic generator. Verify it with the generated',
        'dependency-free strict source checker',
        '(node scripts/verify-dsh-context.mjs --require-source), report the',
        'audited delivery route, and stop. Do not run pnpm install or the full',
        'verification ladder, and do not claim npm publication readiness.',
      ].join(' ')
      const execResult = spawnSync(
        codexPath,
        [
          'exec',
          '--sandbox',
          'workspace-write',
          '--skip-git-repo-check',
          '--ephemeral',
          '--output-last-message',
          join(scratch, 'last-message.md'),
          prompt,
        ],
        {
          cwd: workDirectory,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI: '1',
            CODEX_HOME: codexHome,
            NO_COLOR: '1',
            DSH_HARNESS_ROOT: harnessRoot,
          },
          maxBuffer: 50 * 1024 * 1024,
          timeout: 1_200_000,
        },
      )
      assert.equal(
        execResult.status,
        0,
        `codex exec failed (scratch preserved at ${scratch}): ${execResult.stderr || execResult.stdout}`,
      )
      const transcript = `${execResult.stdout}\n${execResult.stderr}`
      assert.ok(
        transcript.includes('dsh-plugin-dev'),
        `the agent transcript names the marketplace-delivered Skill (scratch at ${scratch})`,
      )

      const manifestPath = join(workDirectory, 'package.json')
      assert.ok(
        existsSync(manifestPath),
        `the agent generated a project package.json (scratch at ${scratch})`,
      )
      const generatedManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        name: string
      }
      assert.equal(generatedManifest.name, 'dsh-repository-audit')

      const contextCheck = spawnSync(
        'node',
        ['scripts/verify-dsh-context.mjs', '--require-source'],
        {
          cwd: workDirectory,
          encoding: 'utf8',
          env: { ...process.env, CI: '1', DSH_HARNESS_ROOT: harnessRoot },
          maxBuffer: 20 * 1024 * 1024,
        },
      )
      assert.equal(
        contextCheck.status,
        0,
        `generated project strict source check failed (scratch at ${scratch}): ${contextCheck.stdout} ${contextCheck.stderr}`,
      )
      keepScratch = false
    } finally {
      if (!keepScratch) await rm(scratch, { recursive: true, force: true })
      else console.log(`semantic smoke scratch preserved for inspection: ${scratch}`)
    }
  },
)
