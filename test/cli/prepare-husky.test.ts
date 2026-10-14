import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { directory as randomDirectory } from "tempy";

// `prepare` runs `husky install`, which writes .husky/_/husky.sh. core.hooksPath lives in the
// shared repo config, so a checkout that skips the install still runs .husky/commit-msg and every
// commit fails sourcing the missing husky.sh. In a linked worktree .git is a file (issue #150).
const prepareScript: string = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")).scripts.prepare;

// Every git invocation below, and husky itself, must only ever see the temp repo. GIT_DIR, GIT_WORK_TREE,
// GIT_INDEX_FILE etc. override the cwd and would point `git init`/`git commit` at the developer's real repo
// (e.g. when the suite runs from a git hook), and the global/system config can inject init.templateDir
// hooks, commit.gpgsign (blocks on pinentry) or core.hooksPath into the temp repo.
const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "HUSKY"));
env.PATH = `${path.join(process.cwd(), "node_modules", ".bin")}${path.delimiter}${process.env.PATH}`;
env.GIT_CONFIG_GLOBAL = "/dev/null";
env.GIT_CONFIG_NOSYSTEM = "1";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, stdio: "pipe" });

const runPrepare = (cwd: string) => spawnSync("sh", ["-c", prepareScript], { cwd, env, encoding: "utf-8" });

// npm runs scripts through cmd.exe on Windows, where `test` is not a builtin.
describe.skipIf(process.platform === "win32")("npm prepare script", () => {
    const setupRepo = () => {
        const root = randomDirectory();
        const main = path.join(root, "main");
        const worktree = path.join(root, "worktree");
        fs.mkdirSync(main);
        git(main, "init", "-q");
        git(main, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "init");
        git(main, "worktree", "add", "-q", worktree);
        return { root, main, worktree };
    };

    it("installs husky hooks in a normal checkout", () => {
        const { root, main } = setupRepo();
        try {
            expect(runPrepare(main).status).toBe(0);
            expect(fs.existsSync(path.join(main, ".husky", "_", "husky.sh"))).toBe(true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("installs husky hooks in a linked worktree, where .git is a file", () => {
        const { root, worktree } = setupRepo();
        try {
            expect(fs.statSync(path.join(worktree, ".git")).isFile()).toBe(true);
            expect(runPrepare(worktree).status).toBe(0);
            expect(fs.existsSync(path.join(worktree, ".husky", "_", "husky.sh"))).toBe(true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
