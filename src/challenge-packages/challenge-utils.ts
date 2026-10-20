import {
    ensurePackagesDir,
    formatPackageNameVersion,
    getPackagesDir,
    hashPackageContents,
    listInstalledPackages,
    loadPackagesIntoPKC,
    packageNameToDir,
    readPackageJson,
    reloadPackagesInDaemon,
    reloadUrlFromPkcRpcUrl,
    PACKAGE_RELOAD_TIMEOUT_MS,
    type InstalledPackage,
    type PackageKind
} from "../common-utils/package-registry.js";

// Challenge packages: npm packages whose default export is registered into PKC.challenges.
// The machinery is shared with page sort packages in common-utils/package-registry.ts.

export {
    getNpmCliPath,
    getNpmEnv,
    ensureNpmAvailable,
    runNpmPack,
    runNpmInstall,
    verifyNativeModuleAbi
} from "../common-utils/npm.js";

export const CHALLENGE_PACKAGE_KIND: PackageKind = {
    subdir: "challenges",
    registryKey: "challenges",
    cacheBustParam: "bitsocialChallengeContent",
    label: "challenge"
};

export type InstalledChallenge = InstalledPackage;

export const getChallengesDir = (dataPath?: string): string => getPackagesDir(CHALLENGE_PACKAGE_KIND, dataPath);

export const ensureChallengesDir = (dataPath?: string): Promise<string> => ensurePackagesDir(CHALLENGE_PACKAGE_KIND, dataPath);

export const challengeNameToDir = packageNameToDir;

export const readChallengePackageJson = readPackageJson;

export const listInstalledChallenges = (dataPath?: string): Promise<InstalledChallenge[]> =>
    listInstalledPackages(CHALLENGE_PACKAGE_KIND, dataPath);

export const formatChallengeNameVersion = formatPackageNameVersion;

export const challengeReloadUrlFromPkcRpcUrl = (pkcRpcUrl: string): string | undefined =>
    reloadUrlFromPkcRpcUrl(CHALLENGE_PACKAGE_KIND, pkcRpcUrl);

/** How long install/remove wait for a daemon to finish reloading before giving up. */
export const CHALLENGE_RELOAD_TIMEOUT_MS = PACKAGE_RELOAD_TIMEOUT_MS;

export const reloadChallengesInDaemon = (pkcRpcUrl: string | URL, timeoutMs = CHALLENGE_RELOAD_TIMEOUT_MS): Promise<boolean> =>
    reloadPackagesInDaemon(CHALLENGE_PACKAGE_KIND, pkcRpcUrl, timeoutMs);

export const hashChallengePackageContents = hashPackageContents;

export const loadChallengesIntoPKC = (dataPath?: string): Promise<InstalledChallenge[]> =>
    loadPackagesIntoPKC(CHALLENGE_PACKAGE_KIND, dataPath);
