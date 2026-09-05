import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface ArtifactDefinition {
  source: string
  runtime: string
  declaration: string
  group: 'root' | 'skill' | 'compatibility'
}

interface ArtifactRecord extends Omit<ArtifactDefinition, 'group'> {
  sourceSha256: string
  runtimeSha256: string
  declarationSha256: string
}

interface ToolingArtifactManifest {
  schemaVersion: 1
  compiler: string
  artifacts: ArtifactRecord[]
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const manifestPath = join(projectRoot, 'tooling-artifacts.json')
const artifacts: readonly ArtifactDefinition[] = [
  {
    source: 'src/scripts/baseline.mts',
    runtime: 'scripts/baseline.mjs',
    declaration: 'scripts/baseline.d.mts',
    group: 'root',
  },
  {
    source: 'src/scripts/install-user-skill.mts',
    runtime: 'scripts/install-user-skill.mjs',
    declaration: 'scripts/install-user-skill.d.mts',
    group: 'root',
  },
  {
    source: 'src/scripts/verify-context.mts',
    runtime: 'scripts/verify-context.mjs',
    declaration: 'scripts/verify-context.d.mts',
    group: 'root',
  },
  {
    source: 'skills/dsh-plugin-dev/src/create-project.mts',
    runtime: 'skills/dsh-plugin-dev/scripts/create-project.mjs',
    declaration: 'skills/dsh-plugin-dev/scripts/create-project.d.mts',
    group: 'skill',
  },
  ...['analyze-project', 'compare-revisions', 'dependencies', 'download-packages'].map(name => ({
    source: `skills/version-compatibility-analysis/src/${name}.mts`,
    runtime: `skills/version-compatibility-analysis/scripts/${name}.mjs`,
    declaration: `skills/version-compatibility-analysis/scripts/${name}.d.mts`,
    group: 'compatibility' as const,
  })),
]

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function runTypeScript(config: string, outDir?: string): void {
  const compiler = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  const args = [compiler, '-p', join(projectRoot, config)]
  if (outDir !== undefined) args.push('--outDir', outDir)
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error([
      `TypeScript build failed for ${config}.`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
}

async function compilerIdentity(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(projectRoot, 'node_modules', 'typescript', 'package.json'), 'utf8'),
  ) as { version?: unknown }
  if (typeof manifest.version !== 'string') {
    throw new Error('installed TypeScript package has no string version')
  }
  return `typescript@${manifest.version}`
}

function emittedPath(
  artifact: ArtifactDefinition,
  kind: 'runtime' | 'declaration',
  temporaryRoots?: Readonly<Record<ArtifactDefinition['group'], string>>,
): string {
  if (temporaryRoots === undefined) return join(projectRoot, artifact[kind])
  const filename = artifact[kind].split('/').at(-1)
  if (filename === undefined) throw new Error(`invalid artifact path: ${artifact[kind]}`)
  return join(temporaryRoots[artifact.group], filename)
}

async function buildManifest(
  temporaryRoots?: Readonly<Record<ArtifactDefinition['group'], string>>,
): Promise<ToolingArtifactManifest> {
  return {
    schemaVersion: 1,
    compiler: await compilerIdentity(),
    artifacts: await Promise.all(artifacts.map(async artifact => ({
      source: artifact.source,
      runtime: artifact.runtime,
      declaration: artifact.declaration,
      sourceSha256: sha256(await readFile(join(projectRoot, artifact.source))),
      runtimeSha256: sha256(await readFile(emittedPath(artifact, 'runtime', temporaryRoots))),
      declarationSha256: sha256(await readFile(emittedPath(artifact, 'declaration', temporaryRoots))),
    }))),
  }
}

function manifestText(manifest: ToolingArtifactManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

async function assertCurrentArtifact(
  artifact: ArtifactDefinition,
  kind: 'runtime' | 'declaration',
  temporaryRoots: Readonly<Record<ArtifactDefinition['group'], string>>,
): Promise<void> {
  const expected = await readFile(emittedPath(artifact, kind, temporaryRoots))
  const currentPath = emittedPath(artifact, kind)
  const current = await readFile(currentPath).catch(() => undefined)
  if (current === undefined || !current.equals(expected)) {
    throw new Error(`${artifact[kind]} is stale; run pnpm build`)
  }
}

async function checkArtifacts(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-dev-build-'))
  try {
    const temporaryRoots = {
      root: join(temporaryRoot, 'root'),
      skill: join(temporaryRoot, 'skill'),
      compatibility: join(temporaryRoot, 'compatibility'),
    } as const
    runTypeScript('tsconfig.scripts.json', temporaryRoots.root)
    runTypeScript('skills/dsh-plugin-dev/tsconfig.json', temporaryRoots.skill)
    runTypeScript('skills/version-compatibility-analysis/tsconfig.json', temporaryRoots.compatibility)
    for (const artifact of artifacts) {
      await assertCurrentArtifact(artifact, 'runtime', temporaryRoots)
      await assertCurrentArtifact(artifact, 'declaration', temporaryRoots)
    }
    const expectedManifest = manifestText(await buildManifest(temporaryRoots))
    const currentManifest = await readFile(manifestPath, 'utf8').catch(() => '')
    if (currentManifest !== expectedManifest) {
      throw new Error('tooling-artifacts.json is stale; run pnpm build')
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function buildArtifacts(): Promise<void> {
  runTypeScript('tsconfig.scripts.json')
  runTypeScript('skills/dsh-plugin-dev/tsconfig.json')
  runTypeScript('skills/version-compatibility-analysis/tsconfig.json')
  await writeFile(manifestPath, manifestText(await buildManifest()), 'utf8')
}

await (checkOnly ? checkArtifacts() : buildArtifacts())

console.log(checkOnly
  ? `tooling artifacts are current (${artifacts.length} TypeScript entries)`
  : `built ${artifacts.length} TypeScript tooling entries`)
