import { readFile } from "node:fs/promises";
import { TypeconfigError } from "./error.ts";

export interface RewriteRule {
    relation: string; // must be a valid relation on this type
    subRelation: string; // relation to check on the referenced object
}

// userset terms are either computed usersets or tuple-to-usersets (so a single relation or a relation plus a sub-relation on a different object)
export type UsersetTerm = string | RewriteRule;
// userset rewrites are unions of userset terms, so the 1 or more lines under a relation that start with "give"
export type UsersetRewrite = Set<UsersetTerm>;
export type UsersetRewriteMap = Map<string, UsersetRewrite>;

export interface Permission {
    name: string;
    grantedBy: Set<string | RewriteRule>; // we only implement "sufficient" conditions because a "necessary" AND set of relations is quite a rare circumstance, especially for EHDS
}

export interface TypeconfigData {
    type: string | undefined;
    validRelations: Set<string>;
    usersetRewrites: UsersetRewriteMap;
    permissions: Set<Permission>;
}

interface TypeconfigState extends TypeconfigData {
    inside: string[] | undefined;
}

function splitByWhitespace(string: string): string[] {
    return string.trim().split(/\s+/); // regular expression that takes 1 or more spaces
}

function splitFileLines(string: string): string[] {
    return string.split(/\r?\n/); // splits by \n but also optionally \r because Windows puts those sometimes
}

/**
 * The configuration for a type of object
 */
export class Typeconfig implements TypeconfigData {
    type: string;
    validRelations: Set<string>;
    usersetRewrites: UsersetRewriteMap;
    permissions: Set<Permission>;

    // this is mostly just used by the fromFile method
    constructor(
        type: string,
        validRelations: Set<string>,
        usersetRewrites: UsersetRewriteMap,
        permissions: Set<Permission>
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
        // temporary state that lets type be undefined, and has an inside field to know where we are in the parsing process
        const state: TypeconfigState = {
            type: undefined,
            validRelations: new Set(),
            usersetRewrites: new Map(),
            permissions: new Set(),
            inside: undefined,
        };

        const file = await readFile(path, { encoding: "utf-8" });

        splitFileLines(file).forEach((line, index) => {
            Typeconfig.readLine(line, index + 1, state);
        });

        // by the end of the parsing, a type is needed
        if (state.type === undefined) {
            throw new TypeconfigError("No type was ever specified.");
        }

        return new Typeconfig(
            state.type,
            state.validRelations,
            state.usersetRewrites,
            state.permissions
        );
    }

    private static readLine(
        line: string,
        lineNumber: number,
        state: TypeconfigState
    ) {
        if (line.trim() === "") {
            state.inside = undefined; // also useful because it lets us know when we are leaving a scope
            return;
        }
        const tokens = splitByWhitespace(line);
        try {
            if (state.inside === undefined) {
                Typeconfig.handleGlobal(tokens, state);
                return;
            }
            if (state.inside[0] === "relation") {
                Typeconfig.handleRelation(tokens, state);
                return;
            }
        } catch (error) {
            if (error instanceof TypeconfigError) {
                throw new TypeconfigError(
                    `Error on line ${lineNumber.toString()} ("${line.trim()}")\n  -> ${error.message}`,
                    { cause: error }
                );
            }
            throw error;
        }
    }

    private static handlePermission(tokens: string[], state: TypeconfigState) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, permissionName, equalsSign, ...logicTokens] = tokens;
        if (!permissionName || equalsSign !== "=" || logicTokens.length === 0) {
            throw new TypeconfigError(
                `Permissions must be defined like so: permission [name] = [relation|otherRelation->relation] OR [relation|otherRelation->relation] OR ...`
            );
        }

        const alreadyExists = [...state.permissions].some(
            (p) => p.name === permissionName
        );
        if (alreadyExists) {
            throw new TypeconfigError(
                `Permission "${permissionName}" is already defined.`
            );
        }

        if (logicTokens.length % 2 === 0) {
            throw new TypeconfigError(
                `Malformed permission logic. Did you leave a dangling "OR" or forget a relation?`
            ); // if the length of the logic tokens are equal, it can't possibly be relation names with ORs between em, since that would be an odd amount of entries
        }

        const grantedBy = new Set<string | RewriteRule>();

        logicTokens.forEach((token) => {
            if (token === "OR") return;
            if (token.includes("->")) {
                const [relation, subRelation] = token.split("->");
                if (!relation || !subRelation) {
                    throw new TypeconfigError(
                        `Malformed rewrite rule ${token}.`
                    );
                }
                if (!state.validRelations.has(relation)) {
                    throw new TypeconfigError(
                        `Relation "${relation}" is not defined.`
                    );
                }
                grantedBy.add({ relation, subRelation });
                return;
            }
            if (!state.validRelations.has(token)) {
                throw new TypeconfigError(
                    `Relation "${token}" is not defined.`
                );
            }
            grantedBy.add(token);
        });

        state.permissions.add({
            name: permissionName,
            grantedBy: grantedBy,
        });
    }

    /**
     * handles what happens in the lines where we are inside a relation definition; currently, only "give" commands exist
     */
    private static handleRelation(tokens: string[], state: TypeconfigState) {
        const [command, target, ...extra] = tokens;
        if (!command || !target || extra.length > 0) {
            throw new TypeconfigError(
                `Relation must have 2 tokens (e.g. "give owner"), got ${tokens.length.toString()}`
            );
        }
        if (command === "give") {
            const affected = state.inside?.[1];
            if (!affected) {
                // theoretically this error should never ever happen. but makes typescript happy c:
                throw new TypeconfigError("Missing current relation context.");
            }

            let term: UsersetTerm;
            if (target.includes("->")) {
                // we have a rewrite rule on our hands so need to splti it up
                const [relation, subRelation] = target.split("->");
                if (!relation || !subRelation) {
                    throw new TypeconfigError(
                        `Malformed rewrite rule ${target}.`
                    );
                }
                if (!state.validRelations.has(relation)) {
                    throw new TypeconfigError(
                        `Relation "${relation}" is not defined.`
                    );
                }
                term = { relation, subRelation };
            } else {
                // simple singular target relation
                if (!state.validRelations.has(target)) {
                    throw new TypeconfigError(
                        `Relation ${target} is not defined.`
                    );
                }
                term = target;
            }

            const existing = state.usersetRewrites.get(affected);
            if (existing) {
                existing.add(term);
            } else {
                state.usersetRewrites.set(affected, new Set([term]));
            }
        } else {
            throw new TypeconfigError(
                `Invalid command "${command}" inside a relation block. Expected "give", or did you forget a blank line?`
            );
        }
    }

    /**
     * handles the lines where we are not inside anything
     * currently this is for setting the type of a typeconfig, starting a relation definition, and setting permission rules
     */
    private static handleGlobal(tokens: string[], state: TypeconfigState) {
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
                if (typeof state.type === "string") {
                    throw new TypeconfigError(
                        `Type is already defined as "${state.type}".`
                    );
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
                    throw new TypeconfigError(
                        `Relation ${value} is already defined.`
                    );
                }
                state.validRelations.add(value);
                state.inside = tokens;
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
