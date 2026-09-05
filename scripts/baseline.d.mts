#!/usr/bin/env node
import type { BinaryLike } from 'node:crypto';
declare const DEPENDENCY_SECTIONS: readonly ["dependencies", "optionalDependencies", "peerDependencies"];
declare const BASELINE_CHANNELS: readonly ["stable", "edge"];
type BaselineChannel = typeof BASELINE_CHANNELS[number];
type DependencySection = typeof DEPENDENCY_SECTIONS[number];
type ReleaseFamily = 'vendor' | 'dsh' | 'experimental' | 'native' | 'workspace';
type JsonObject = Record<string, unknown>;
type DependencyMap = Record<string, string>;
interface UpstreamContract {
    repository: string;
    tag: string;
    version: string;
    node: string;
    packageManager: string;
    commit: string;
    docsDigest: string;
}
type PackageContract = JsonObject & Record<DependencySection, DependencyMap>;
interface CapabilityPackageEntry {
    name: string;
    manifest: Record<DependencySection, DependencyMap>;
}
export interface PackageEntry {
    name: string;
    version: string;
    path: string;
    private: boolean;
    releaseFamily: ReleaseFamily;
    manifest: PackageContract;
    manifestDigest: string;
}
interface SkillFileEntry {
    path: string;
    sha256: string;
}
export interface SkillEntry {
    name: string;
    path: string;
    role: 'product' | 'maintainer' | 'fixture';
    fileCount: number;
    digest: string;
    entryDigest: string;
    files: SkillFileEntry[];
}
interface ExternalRequirement {
    name: string;
    ranges: string[];
}
interface CapabilityContract {
    linkedPackages: Record<string, string>;
    publicationRoots: string[];
    publicationClosure: string[];
    externalRequirements: ExternalRequirement[];
}
export interface BaselineCatalog {
    schemaVersion: 1;
    upstream: UpstreamContract;
    toolchain: {
        packageManager: unknown;
        dependencies: DependencyMap;
    };
    summary: {
        packageCount: number;
        releasePackageCount: number;
        privatePackageCount: number;
        experimentalPackageCount: number;
        skillCount: number;
        productSkillCount: number;
        packageGraphDigest: string;
        skillsDigest: string;
    };
    capabilities: Record<string, CapabilityContract> & {
        tool: CapabilityContract;
    };
    packages: PackageEntry[];
    skills: SkillEntry[];
}
interface ArtifactSummary {
    path: string;
    sha256: string;
    status?: string | undefined;
    checkedAt?: string | null | undefined;
    packageCount?: number | undefined;
    skillCount?: number | undefined;
    productSkillCount?: number | undefined;
}
interface LocalResolution {
    environmentVariable: string;
    fallbackRelativePath: string;
}
interface BaselineRecord {
    upstream: UpstreamContract;
    catalog?: ArtifactSummary | undefined;
    registry?: ArtifactSummary | undefined;
    verification?: ArtifactSummary | undefined;
    localResolution?: LocalResolution | undefined;
    verifiedOn?: string | undefined;
}
interface BaselineLock extends JsonObject {
    schemaVersion: number;
    upstream?: UpstreamContract | undefined;
    localResolution?: LocalResolution | undefined;
    verifiedOn?: string | undefined;
    defaultChannel?: string | undefined;
    channels?: Record<string, BaselineRecord> | undefined;
}
export interface LoadedChannel {
    root: string;
    lockPath: string;
    lock: BaselineLock;
    channel: BaselineChannel;
    baseline: BaselineRecord;
    catalog: BaselineCatalog | undefined;
    catalogPath: string | undefined;
    catalogText: string | undefined;
}
interface ScanOptions {
    allowDirty?: boolean | undefined;
    tag?: string | undefined;
    repository?: string | undefined;
}
interface RegistryResolution {
    available: boolean;
    resolved?: unknown;
    reason?: string | undefined;
}
interface RegistryRequirement {
    kind: 'upstream' | 'external';
    name: string;
    requirement: string;
    version?: string | undefined;
    range?: string | undefined;
    private?: boolean | undefined;
    releaseFamily?: ReleaseFamily | undefined;
}
interface CheckedRegistryRequirement extends RegistryRequirement, RegistryResolution {
}
export interface RegistryReport extends JsonObject {
    schemaVersion: 1;
    channel: string;
    capability: string;
    catalogSha256: string;
    registry: string | null;
    checkedAt: string;
    status: 'ready' | 'blocked';
    packages: CheckedRegistryRequirement[];
    externalRequirements: CheckedRegistryRequirement[];
}
interface EvidenceReport extends JsonObject {
    status: string;
    catalogSha256: string;
    checkedAt?: string | null | undefined;
    verifiedAt?: string | null | undefined;
    projectDigest?: string | undefined;
    channel?: string | undefined;
    registrySha256?: string | undefined;
    registryStatus?: string | undefined;
}
interface VerificationReport extends EvidenceReport {
    schemaVersion: 2;
    channel: string;
    catalogSha256: string;
    upstream: {
        tag: string;
        commit: string;
    };
    verifiedAt: string;
    status: 'passed';
    command: string;
    projectDigest: string;
    registrySha256: string;
    registryStatus: string;
}
interface CatalogDiff {
    upstream: Record<string, {
        from: unknown;
        to: unknown;
    }>;
    packages: Record<'added' | 'removed' | 'changed', string[]>;
    skills: Record<'added' | 'removed' | 'changed', string[]>;
    toolClosure: Record<'added' | 'removed', string[]>;
}
interface DiffCatalogInput {
    upstream: Pick<UpstreamContract, 'tag' | 'version' | 'node' | 'packageManager' | 'commit' | 'docsDigest'>;
    packages: Array<Pick<PackageEntry, 'name' | 'version' | 'path' | 'manifestDigest'>>;
    skills: Array<Pick<SkillEntry, 'path' | 'digest'>>;
    capabilities?: {
        tool?: {
            publicationClosure?: string[] | undefined;
        } | undefined;
    } | undefined;
}
interface RegistryCatalogInput {
    packages: Array<Pick<PackageEntry, 'name' | 'version' | 'private' | 'releaseFamily'>>;
    capabilities: Record<string, {
        publicationClosure: string[];
        externalRequirements: ExternalRequirement[];
    } | undefined>;
}
export declare class BaselineError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function jsonText(value: unknown): string;
export declare function sha256(value: BinaryLike): string;
export declare function harnessWorktreeChanges(root: string): string;
export declare function projectContractDigest(root?: string): string;
export declare function computeCapabilityClosure(packages: readonly CapabilityPackageEntry[], roots: readonly string[]): string[];
export declare function scanHarness(root: string, options?: ScanOptions): BaselineCatalog;
export declare function selectChannel(lock: BaselineLock, requestedChannel?: string): {
    channel: BaselineChannel;
    baseline: BaselineRecord;
};
export declare function loadLockedChannel(root?: string, requestedChannel?: string): LoadedChannel;
export declare function updateChannel({ harnessRoot, channel: requestedChannel, tag, verifiedOn, }: {
    harnessRoot: string;
    channel?: string | undefined;
    tag?: string | undefined;
    verifiedOn?: string | undefined;
}): {
    lock: BaselineLock;
    catalog: BaselineCatalog;
    channels: BaselineChannel[];
};
export declare function diffCatalogs(fromCatalog: DiffCatalogInput, toCatalog: DiffCatalogInput): CatalogDiff;
export declare function buildRegistryReport({ channel, catalog, catalogSha256, capability, registry, resolver, checkedAt, }: {
    channel: string;
    catalog: RegistryCatalogInput;
    catalogSha256: string;
    capability?: string | undefined;
    registry?: string | undefined;
    resolver?: ((requirement: string, registry?: string) => Promise<RegistryResolution>) | undefined;
    checkedAt?: string | undefined;
}): Promise<RegistryReport>;
export declare function resolveHarnessRoot(loaded: LoadedChannel, explicitRoot?: string): string;
export declare function checkLockedChannel(channel?: string, explicitRoot?: string): {
    loaded: LoadedChannel & {
        catalog: BaselineCatalog;
    };
    harnessRoot: string;
    scanned: BaselineCatalog;
};
/** A source-only pass cannot authorize publication after Registry availability changes. */
export declare function validateRegistryVerification(verification: {
    registryStatus?: unknown;
    registrySha256?: unknown;
}, registry: {
    status?: string | undefined;
    sha256?: string | undefined;
}): void;
export declare function preflightChannel(channel?: string): LoadedChannel;
export declare function promoteChannel(from?: string, to?: string): BaselineLock;
export declare function verifyChannel(channel?: string, explicitRoot?: string): VerificationReport;
export {};
