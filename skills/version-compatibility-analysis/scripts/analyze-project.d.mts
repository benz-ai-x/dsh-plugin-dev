#!/usr/bin/env node
import type { Issue } from './dependencies.mjs';
export interface AnalyzeOptions {
    project?: string;
    harnessRoot?: string;
    base?: string;
    target?: string;
    channel?: string;
    capability?: string;
    roots?: readonly string[];
}
export declare function analyzeProject(options?: AnalyzeOptions, environment?: NodeJS.ProcessEnv): {
    project: {
        root: string;
        channel: string | null;
        lockSha256: string | null;
        baselineSource: string;
        lockedUpstream: {
            [k: string]: unknown;
        } | null;
        candidatePathSource: string;
        dependencyRootsSource: string;
    };
    issues: Issue[];
    schemaVersion: number;
    checkedAt: string;
    repository: string;
    base: {
        requestedRef: string;
        commit: string;
        localTags: string[];
        rootManifest: {
            [k: string]: unknown;
        } | null;
    };
    target: {
        requestedRef: string;
        commit: string;
        localTags: string[];
        rootManifest: {
            [k: string]: unknown;
        } | null;
    };
    checkout: {
        commit: string;
        dirty: boolean;
    };
    shallow: boolean;
    baseIsAncestor: boolean;
    targetOnlyCommitCount: number;
    diff: {
        renameDetection: boolean;
        groups: {
            path: string;
            changedPaths: number;
        }[];
        changedPaths: number;
        insertions: number;
        deletions: number;
        binaryPaths: number;
    };
    manifests: {
        scope: string;
        trackedManifestCount: {
            before: number;
            after: number;
        };
        comparedFields: string;
        added: {
            path: string;
            name: {} | null;
            version: {} | null;
            private: boolean;
        }[];
        removed: {
            path: string;
            name: {} | null;
            version: {} | null;
            private: boolean;
        }[];
        contractChanged: {
            path: string;
            name: unknown;
            fromVersion: unknown;
            toVersion: unknown;
            changes: import("./compare-revisions.mjs").Difference[];
        }[];
        versionOnlyCount: number;
        unchangedManifestCount: number;
    };
    workspaces: {
        before: {
            source: string;
            status: "unknown";
            patterns: never[];
            packagePaths: never[];
            issues: {
                kind: string;
                reason: string;
            }[];
        } | {
            source: string;
            status: "discovered";
            patterns: string[];
            packagePaths: string[];
            issues: Issue[];
        };
        after: {
            source: string;
            status: "unknown";
            patterns: never[];
            packagePaths: never[];
            issues: {
                kind: string;
                reason: string;
            }[];
        } | {
            source: string;
            status: "discovered";
            patterns: string[];
            packagePaths: string[];
            issues: Issue[];
        };
    };
    dependencies: {
        before: {
            roots: string[];
            unresolvedRoots: string[];
            nodes: {
                name: string;
                path: string;
                version: unknown;
                private: boolean;
                conditional: boolean;
            }[];
            edges: import("./dependencies.mjs").DependencyEdge[];
            issues: Issue[];
            registryStatus: "not-queried";
            scope: string;
        };
        after: {
            roots: string[];
            unresolvedRoots: string[];
            nodes: {
                name: string;
                path: string;
                version: unknown;
                private: boolean;
                conditional: boolean;
            }[];
            edges: import("./dependencies.mjs").DependencyEdge[];
            issues: Issue[];
            registryStatus: "not-queried";
            scope: string;
        };
        added: string[];
        removed: string[];
    };
    skillEntrypoints: {
        added: string[];
        removed: string[];
        changed: string[];
        unchangedCount: number;
    };
    skillResources: {
        entrypoint: string;
        changedPaths: string[];
    }[];
    assessment: string;
    limitations: string[];
};
