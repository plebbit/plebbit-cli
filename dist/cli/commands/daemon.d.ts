import { Command } from "@oclif/core";
export default class Daemon extends Command {
    static description: string;
    static flags: {
        plebbitRpcUrl: import("@oclif/core/lib/interfaces/parser.js").OptionFlag<import("url").URL, import("@oclif/core/lib/interfaces/parser.js").CustomOptions>;
        logPath: import("@oclif/core/lib/interfaces/parser.js").OptionFlag<string, import("@oclif/core/lib/interfaces/parser.js").CustomOptions>;
    };
    static examples: string[];
    private _setupLogger;
    private _getNewLogfileByEvacuatingOldLogsIfNeeded;
    private _pipeDebugLogsToLogFile;
    run(): Promise<void>;
}
