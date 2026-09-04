export type Manifest = Record<string, unknown>;
export type Manifests = ReadonlyMap<string, Manifest>;
export interface Issue {
    kind: string;
    path?: string;
    revision?: string;
    reason: string;
}
export declare function isObject(value: unknown): value is Manifest;
export declare function stringList(value: unknown): value is string[];
export declare function discoverWorkspace(manifests: Manifests, pnpmText?: string): {
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
export interface DependencyEdge {
    from: string;
    name: string;
    range: string;
    kind: string;
    conditional: boolean;
    resolution: 'workspace-candidate' | 'external' | 'unresolved';
}
export declare function dependencyGraph(manifests: Manifests, paths: readonly string[], roots: readonly string[]): {
    roots: string[];
    unresolvedRoots: string[];
    nodes: {
        name: string;
        path: string;
        version: unknown;
        private: boolean;
        conditional: boolean;
    }[];
    edges: DependencyEdge[];
    issues: Issue[];
    registryStatus: "not-queried";
    scope: string;
};
