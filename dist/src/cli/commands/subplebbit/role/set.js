"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const core_1 = require("@oclif/core");
const plebbit_logger_1 = tslib_1.__importDefault(require("@plebbit/plebbit-logger"));
const base_command_js_1 = require("../../../base-command.js");
const node_fetch_1 = tslib_1.__importDefault(require("node-fetch"));
const response_statuses_js_1 = require("../../../../api/response-statuses.js");
const exit_codes_js_1 = require("../../../exit-codes.js");
const assert_1 = tslib_1.__importDefault(require("assert"));
class Set extends base_command_js_1.BaseCommand {
    async run() {
        const { flags, args } = await this.parse(Set);
        const log = (0, plebbit_logger_1.default)("plebbit-cli:commands:subplebbit:roles:set");
        log(`flags: `, flags);
        log(`args: `, args);
        (0, assert_1.default)(typeof args["author-address"] === "string");
        await this.stopIfDaemonIsDown(flags.apiUrl.toString());
        const subRes = await (0, node_fetch_1.default)(`${flags.apiUrl}/subplebbit/create`, {
            method: "POST",
            body: JSON.stringify({ address: args["sub-address"] }),
            headers: { "content-type": "application/json" } // Header is needed with every request that contains JSON body
        });
        if (subRes.status === response_statuses_js_1.statusCodes.ERR_SUBPLEBBIT_DOES_NOT_EXIST)
            this.error(response_statuses_js_1.statusMessages.ERR_SUBPLEBBIT_DOES_NOT_EXIST, {
                code: "ERR_SUBPLEBBIT_DOES_NOT_EXIST",
                exit: exit_codes_js_1.exitStatuses.ERR_SUBPLEBBIT_DOES_NOT_EXIST
            });
        if (subRes.status !== response_statuses_js_1.statusCodes.SUCCESS_SUBPLEBBIT_CREATED)
            this.error(subRes.statusText);
        const sub = await subRes.json();
        assert_1.default.equal(sub.address, args["sub-address"]);
        //@ts-expect-error
        const newRoles = { ...sub.roles, [args["author-address"]]: { role: flags.role } };
        const editRes = await (0, node_fetch_1.default)(`${flags.apiUrl}/subplebbit/edit?address=${args["sub-address"]}`, {
            body: JSON.stringify({ roles: newRoles }),
            method: "POST",
            headers: { "content-type": "application/json" }
        });
        if (editRes.status !== response_statuses_js_1.statusCodes.SUCCESS_SUBPLEBBIT_EDITED)
            // TODO, status text is not enough to explain error. Include more info
            this.error(editRes.statusText);
    }
}
Set.description = "Set role to an author within the subplebbit. If an author has a role already, it would get overidden with the new role";
Set.examples = ["plebbit subplebbit role set plebbit.eth estebanabaroa.eth --role admin"];
Set.flags = {
    role: core_1.Flags.string({
        options: ["admin", "moderator", "owner"],
        description: "New role for the author",
        default: "moderator",
        required: true
    })
};
Set.args = {
    "sub-address": core_1.Args.string({
        name: "sub-address",
        required: true,
        description: "Address of subplebbit"
    }),
    "author-address": core_1.Args.string({
        name: "author-address",
        required: true,
        description: "The address of the author to set the role to"
    })
};
exports.default = Set;
