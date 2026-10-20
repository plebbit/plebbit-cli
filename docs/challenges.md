# Challenge packages

A challenge package is an npm package whose default export is a pkc-js challenge factory. Installing one registers it into `PKC.challenges` under its **package name**, so a community can name it in `settings.challenges[i].name`, the same way it names a pkc-js built-in such as `question`.

Page sort packages work the same way; see [page-sorts.md](page-sorts.md). Both kinds share `src/common-utils/package-registry.ts`.

## Commands

```bash
bitsocial challenge install <package>   # aliases: i, add
bitsocial challenge list                # alias: ls; -q prints names only
bitsocial challenge remove <name>       # aliases: uninstall, rm, un
```

`install` accepts anything `npm pack` accepts:

```bash
bitsocial challenge install @bitsocial/mintpass-challenge
bitsocial challenge install @bitsocial/mintpass-challenge@1.0.0
bitsocial challenge install github:user/repo
bitsocial challenge install https://example.com/my-challenge-1.0.0.tar.gz
bitsocial challenge install ./my-local-challenge
```

All three commands take `--pkcOptions.dataPath` (default: the platform data dir from `env-paths("bitsocial")`, e.g. `~/.local/share/bitsocial` on Linux). `install` and `remove` also take `--pkcRpcUrl` (default `ws://localhost:9138`) to find the daemon to reload.

`remove` takes the package name, not the spec you installed from: `bitsocial challenge remove @bitsocial/mintpass-challenge`.

## Where packages live

```
<dataPath>/challenges/<name>/            # unscoped
<dataPath>/challenges/@scope/<name>/     # scoped
```

Each directory is a fully installed package (its own `node_modules`). `list` reads this directory and prints an npm-ls-style tree:

```
/home/me/.local/share/bitsocial/challenges
└── @bitsocial/mintpass-challenge@1.0.0
```

## What install does

1. `npm pack <spec>` into a temp dir under the data path, then extract it.
2. Read `package.json`. The `name` must be a valid npm name (`pkg` or `@scope/pkg`), because it becomes the install directory.
3. `npm install` inside the temp dir, so a failed install never touches a working one.
4. Check that native modules match this Node's ABI.
5. Import the entry point and run pkc-js `validateChallengeFileFactory` on it. A page sort package, or anything else that is not a challenge factory, is refused here.
6. Swap the package into `<dataPath>/challenges/<name>`. An existing install is moved aside first and restored if the swap fails. Output is `added <name>@<version>` or `changed <name>@<version>` (replaced an existing install).
7. Ask a running daemon to reload (below).

`npm` must be on `PATH`.

## How the daemon loads them

- **At start:** `bitsocial daemon` loads every package under `<dataPath>/challenges/` into `PKC.challenges` before starting the RPC server, and logs `Loaded challenge packages: name@version, ...`. A package that fails to import is logged and skipped. It does not stop the daemon.
- **Hot reload:** after `install` or `remove`, the CLI POSTs to the daemon's reload endpoint, which re-reads the directory and notifies settings subscribers. If it worked, `install` prints `reloaded <name>@<version> in the daemon at <url>`. Running communities pick up the change on their next cycle, and nothing is restarted.
  - `POST http://<host>:<port>/api/challenges/reload` is local only (403 for remote connections).
  - `POST http://<host>:<port>/<authKey>/api/challenges/reload` works remotely. The CLI uses this one when `--pkcRpcUrl` includes the auth key path (`ws://host:9138/<authKey>`).
  - The reload URL is derived from `--pkcRpcUrl`, and a wildcard host (`0.0.0.0`, `::`) is dialed as `127.0.0.1`.
- **No daemon running:** the reload is best-effort. Install and remove still succeed, and the daemon picks the change up at its next start. The CLI waits up to 30s for a daemon that accepts the connection but does not answer.

Upgrading in place (`install` of a newer version) takes effect on reload. The entry module is imported under a URL keyed on the package contents, so the old module is not reused. Only the entry module is re-evaluated, so packages should ship a bundled entry point.

If a reinstalled package fails to import on reload, the daemon keeps the previously loaded factory under that name instead of dropping it.

## Shadowing a built-in

pkc-js ships built-in challenges: `text-math`, `fail`, `blacklist`, `whitelist`, `question`, `publication-match`. A package with the same name as a built-in replaces it in `PKC.challenges` for this daemon. `remove` puts the built-in back on the next reload instead of deleting the key. A package name that was never a built-in is simply deleted from the registry.

## Using a challenge in a community

Name the package in `settings.challenges`:

```bash
bitsocial community edit mycommunity.bso \
  '--settings.challenges[0].name' @bitsocial/mintpass-challenge
```

Options go under `settings.challenges[i].options`:

```bash
bitsocial community edit mycommunity.bso \
  '--settings.challenges[0].name' question \
  '--settings.challenges[0].options.question' "what is the password?" \
  '--settings.challenges[0].options.answer' thepassword
```

Quote the flags in the shell: the `[0]` brackets are glob characters, and zsh refuses to run the command when they match no file.

For larger changes, write the settings to a file and pass `--jsonFile <file>`; CLI flags take priority over the file.

## Removing

`challenge remove` deletes the directory and reloads the daemon. It does **not** check whether a community still names the package in `settings.challenges`. Check first with `bitsocial community get <address>`. (`page-sort remove` does refuse in that case; see [page-sorts.md](page-sorts.md#removing).)

## Troubleshooting

- **Install fails with "No valid package.json found in the archive":** the spec did not produce an npm package tarball.
- **Install fails validation:** the default export is not a challenge factory. A page sort package belongs under `bitsocial page-sort install`.
- **Daemon log `Failed to load challenge "<name>"`:** the package is installed but its entry point throws on import. It is left out of the registry until fixed. A previously loaded version keeps serving.
- **`install` printed no `reloaded ...` line:** no daemon answered at `--pkcRpcUrl`. Pass the URL the daemon actually listens on, including the auth key path for a remote daemon, or restart the daemon.

## Writing a challenge package

The factory contract (arguments, `getChallenge`, result shape) is defined by pkc-js; see [challenge-flow.md in pkc-js](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/challenge-flow.md). The package's `main` (default `index.js`) must default-export the factory. Test it locally with `bitsocial challenge install ./path/to/package`.
