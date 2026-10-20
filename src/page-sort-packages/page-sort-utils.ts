import {
    getPackagesDir,
    listInstalledPackages,
    loadPackagesIntoPKC,
    reloadPackagesInDaemon,
    PACKAGE_RELOAD_TIMEOUT_MS,
    type InstalledPackage,
    type PackageKind
} from "../common-utils/package-registry.js";

// Page sort packages: npm packages whose default export is a pkc-js page sort factory, registered into
// PKC.pageSorts under the package name, so `settings.pages.posts[i].name` can name them (issue #164).
// The machinery is shared with challenge packages in common-utils/package-registry.ts.

export const PAGE_SORT_PACKAGE_KIND: PackageKind = {
    subdir: "page-sorts",
    registryKey: "pageSorts",
    cacheBustParam: "bitsocialPageSortContent",
    label: "page sort"
};

export type InstalledPageSort = InstalledPackage;

export const getPageSortsDir = (dataPath?: string): string => getPackagesDir(PAGE_SORT_PACKAGE_KIND, dataPath);

export const listInstalledPageSorts = (dataPath?: string): Promise<InstalledPageSort[]> =>
    listInstalledPackages(PAGE_SORT_PACKAGE_KIND, dataPath);

export const reloadPageSortsInDaemon = (pkcRpcUrl: string | URL, timeoutMs = PACKAGE_RELOAD_TIMEOUT_MS): Promise<boolean> =>
    reloadPackagesInDaemon(PAGE_SORT_PACKAGE_KIND, pkcRpcUrl, timeoutMs);

export const loadPageSortsIntoPKC = (dataPath?: string): Promise<InstalledPageSort[]> =>
    loadPackagesIntoPKC(PAGE_SORT_PACKAGE_KIND, dataPath);

/** Where a community's settings.pages names `pageSortName`, e.g. "posts[0]". */
export function findPageSortUsages(
    pagesSettings: { posts?: { name?: string }[]; replies?: { name?: string }[] } | undefined,
    pageSortName: string
): string[] {
    const usages: string[] = [];
    for (const scope of ["posts", "replies"] as const) {
        pagesSettings?.[scope]?.forEach((entry, index) => {
            if (entry?.name === pageSortName) usages.push(`${scope}[${index}]`);
        });
    }
    return usages;
}
