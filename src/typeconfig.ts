import { readdir, readFile } from "node:fs/promises";
import type { PathLike } from "node:fs";
import path from "node:path";
import { TypeconfigError } from "./error.ts";

/**
 * Syntax in .tc file: `give <foo> if relation has subRelation`
 */
export interface RewriteRule {
    relation: string; // must be a valid relation on this type
    subRelation: string; // relation to check on the referenced object
}

/**
 * Userset terms are either computed usersets or tuple-to-usersets.
 * if type is string then the syntax is:         `give <foo> if string`,
 * and if the type is RewriteRule, the syntax is: `give <foo> if relation has subRelation`.
 */
export type UsersetTerm = string | RewriteRule;
/**
 * Userset rewrites are unions of userset terms, so the 1 or more lines that start with `give <foo>`
 */
export type UsersetRewrite = Set<UsersetTerm>;
/**
 * Maps a relation name, for example "viewer", to a UsersetRewrite.
 * I.e. in the typeconfig: `give viewer if editor`,
 * the key would be `"viewer"` and the value would be `"editor"`.
 */
export type UsersetRewriteMap = Map<string, UsersetRewrite>;
/**
* Describes a set of relations which grant a permission.
* Typeconfig syntax is: `permission <foo> = viewer + department:staff`,
* here a subject must have 'viewer' relation, or 'staff' relation to object with 'department' relation
* to get the `<foo>` permission.
*/
export type PermissionGrants = Set<string | RewriteRule>;
/**
* Maps a permission name to a PermissionGrants.
* The key is the name of the permission (see `<foo>` from `PermissionGrants` desc.),
* and the value is the set of required relations (see `PermissionGrants`).
*/
export type PermissionMap = Map<string, PermissionGrants>;

export interface TypeconfigData {
    type: string | undefined;
    validRelations: Set<string>;
    usersetRewrites: UsersetRewriteMap;
    permissions: PermissionMap;
}

const splitByWhitespace = (string: string) => string.trim().split(/\s+/);
const splitFileLines = (string: string) => string.split(/\r?\n/);

/**
 * The configuration for a type of object
 */
export default class Typeconfig implements TypeconfigData {
    type: string;
    validRelations: Set<string>;
    usersetRewrites: UsersetRewriteMap;
    permissions: PermissionMap;

    // this is mostly just used by the fromFile method
    constructor(
        type: string,
        validRelations: Set<string>,
        usersetRewrites: UsersetRewriteMap,
        permissions: PermissionMap
    ) {
        this.type = type;
        this.validRelations = validRelations;
        this.usersetRewrites = usersetRewrites;
        this.permissions = permissions;
    }

    /**
     * Parses a file into a new Typeconfig object.
     * This is the intended way to instantiate the Typeconfig class.
     */
    static async fromFile(path: string) {
        // temporary state that lets type be undefined
        const state: TypeconfigData = {
            type: undefined,
            validRelations: new Set(),
            usersetRewrites: new Map(),
            permissions: new Map(),
        };

        const file = await readFile(path, { encoding: "utf-8" });

        // Loop over all lines of the file
        for (const [index, line] of splitFileLines(file).entries()) {
            if (line.trim() === "") continue; // skip empty lines obvs
            const tokens = splitByWhitespace(line); // split into tokens ("words")
            try {
                Typeconfig.handleGlobal(tokens, state);
            } catch (error) {
                if (error instanceof TypeconfigError) {
                    throw new TypeconfigError(
                        `Error on line ${(index + 1).toString()} ("${line.trim()}")\n  -> ${error.message}`,
                        { cause: error }
                    ); // doing this for line number context without having to pass the index through every handler
                }
                throw error;
            }
        }

        // by the end of the parsing, a type is needed
        if (state.type === undefined) {
            throw new TypeconfigError("No type was ever specified.");
        }

        return new Typeconfig(state.type, state.validRelations, state.usersetRewrites, state.permissions);
    }

    private static assertRelationExists(name: string, state: TypeconfigData) {
        if (!state.validRelations.has(name)) {
            throw new TypeconfigError(`Relation "${name}" is not defined.`);
        }
    }

    private static handlePermission(tokens: string[], state: TypeconfigData) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, permissionName, equalsSign, ...logicTokens] = tokens;
        if (!permissionName || equalsSign !== "=" || logicTokens.length === 0) {
            throw new TypeconfigError(
                `Permissions must be defined like so: permission [name] = [relation|otherRelation:relation] + [relation|otherRelation:relation] + ...`
            );
        }

        if (state.permissions.has(permissionName)) {
            throw new TypeconfigError(`Permission "${permissionName}" is already defined.`);
        }

        if (logicTokens.length % 2 === 0) {
            throw new TypeconfigError(`Malformed permission logic. Did you leave a dangling "+" or forget a relation?`); // if the length of the logic tokens are equal, it can't possibly be relation names with +'s between em, since that would be an odd amount of entries
        }

        const grantedBy = new Set<string | RewriteRule>();

        for (const token of logicTokens) {
            if (token === "+") continue;
            if (token.includes(":")) {
                const [relation, subRelation] = token.split(":");
                if (!relation || !subRelation) {
                    throw new TypeconfigError(`Malformed rewrite rule ${token}.`);
                }
                Typeconfig.assertRelationExists(relation, state);
                grantedBy.add({ relation, subRelation });
                continue;
            }
            Typeconfig.assertRelationExists(token, state);
            grantedBy.add(token);
        }

        state.permissions.set(permissionName, grantedBy);
    }

    /**
     * handles what happens in the lines where we are inside a relation definition; currently, only "give" commands exist
     */
    private static handleGive(tokens: string[], state: TypeconfigData) {
        if (tokens[0] !== "give" || tokens[2] !== "if") {
            throw new TypeconfigError(`Malformed give syntax.`);
        }

        if (tokens.length !== 4 && tokens.length !== 6) {
            throw new TypeconfigError(`Userset term must be "give X if Y" or "give X if Y has Z".`);
        }

        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        const relationGiven = tokens[1]!;
        const relationReceiving = tokens[3]!;

        Typeconfig.assertRelationExists(relationGiven, state);

        let term: UsersetTerm;

        if (tokens.length === 6) {
            // If length is 6, then term is a conditional rule
            if (tokens[4] !== "has") {
                throw new TypeconfigError(`Malformed give syntax.`);
            }
            const subRelation = tokens[5]!;
            term = { relation: relationReceiving, subRelation };
        } else {
            // if the length is 4, it is unconditional, and is set directly
            term = relationReceiving;
        }
        /* eslint-enable @typescript-eslint/no-non-null-assertion */

        const existing = state.usersetRewrites.get(relationGiven);
        if (existing) existing.add(term);
        else state.usersetRewrites.set(relationGiven, new Set([term]));
    }

    /**
     * handles the lines where we are not inside anything
     * currently this is for setting the type of a typeconfig, starting a relation definition, and setting permission rules
     */
    private static handleGlobal(tokens: string[], state: TypeconfigData) {
        const [keyword, value, ...extra] = tokens;

        if (!keyword || !value) {
            throw new TypeconfigError(
                `Header must have at least 2 tokens (e.g. "type doc", "relation viewer", "permission can_view = viewer"), got ${tokens.length.toString()}.`
            );
        }

        switch (keyword) {
            case "type": {
                if (extra.length > 0) {
                    throw new TypeconfigError(
                        `"type" definition should only have 2 tokens, got ${tokens.length.toString()}.`
                    );
                }
                // type already specified
                if (state.type !== undefined) {
                    throw new TypeconfigError(`Type is already defined as "${state.type}".`);
                }
                state.type = value;
                break;
            }
            case "relation": {
                if (extra.length > 0) {
                    throw new TypeconfigError(
                        `"relation" definition should only have 2 tokens, got ${tokens.length.toString()}.`
                    );
                }
                if (state.validRelations.has(value)) {
                    throw new TypeconfigError(`Relation ${value} is already defined.`);
                }
                state.validRelations.add(value);
                break;
            }
            case "give": {
                Typeconfig.handleGive(tokens, state);
                break;
            }
            case "permission": {
                Typeconfig.handlePermission(tokens, state);
                break;
            }
            default: {
                throw new TypeconfigError(
                    `Unknown keyword "${keyword}". Expected "type", "relation", or "permission".`
                );
            }
        }
    }
}

export const typeconfigsFromDir = async (dir: PathLike): Promise<Typeconfig[]> => {
    const entries = (await readdir(dir, { withFileTypes: true })).filter(
        (dirent) => dirent.isFile() && dirent.name.endsWith(".tc")
    ); // looking at the entries in some dir and taking only .tc files
    return await Promise.all(entries.map((entry) => Typeconfig.fromFile(path.join(entry.parentPath, entry.name)))); // map each of those files to a parsed Typeconfig
};
