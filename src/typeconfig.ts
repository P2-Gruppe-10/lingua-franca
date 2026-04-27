import { readFile, writeFile } from "node:fs/promises";
import { TypeconfigError } from "./error.ts";

export interface Rule {
    affected: string;
    give: string;
}

export interface TypeconfigData {
    type: string | undefined;
    validRelations: Set<string>;
    relationRules: Set<Rule>;
}

interface TypeconfigState extends TypeconfigData {
    inside: string[] | undefined;
}

export class Typeconfig implements TypeconfigData {
    type: string;
    validRelations: Set<string>;
    relationRules: Set<Rule>;

    // this is mostly just used by the fromFile method
    constructor(
        type: string,
        validRelations: Set<string>,
        relationRules: Set<Rule>
    ) {
        this.type = type;
        this.validRelations = validRelations;
        this.relationRules = relationRules;
    }

    async saveToFile(path: string) {
        await writeFile(
            path,
            JSON.stringify(
                this,
                (_, value) => (value instanceof Set ? [...value] : value), // this is needed because JSON can't stringify Sets
                2
            )
        );
    }

    static async fromFile(path: string) {
        // temporary state that lets type be undefined, and has an inside field to know where we are in the parsing process
        let state: TypeconfigState = {
            type: undefined,
            validRelations: new Set(),
            relationRules: new Set(),
            inside: undefined,
        };

        let file = await readFile(path, { encoding: "utf-8" });

        // we remove \r's because windows users can potentially be putting those in there...
        file.replaceAll("\r", "")
            .split("\n")
            .forEach((line) => {
                Typeconfig.readLine(line, state);
            });

        // by the end of the parsing, a type is needed
        if (state.type === undefined) {
            throw new TypeconfigError("no type specified");
        }

        return new Typeconfig(
            state.type,
            state.validRelations,
            state.relationRules
        );
    }

    private static readLine(line: string, state: TypeconfigState) {
        if (line.replaceAll(" ", "") === "") {
            state.inside = undefined; // also useful because it lets us know when we are leaving a scope
            return;
        }
        const tokens = line.split(" ");
        if (state.inside === undefined) {
            Typeconfig.handleGlobal(tokens, state);
            return;
        }
        if (state.inside[0] === "relation") {
            Typeconfig.handleRelation(tokens, state);
            return;
        }
    }

    // handles what happens in the lines where we are inside a relation definition; currently, only "give" commands exist
    private static handleRelation(tokens: string[], state: TypeconfigState) {
        if (tokens.length < 2) {
            throw new TypeconfigError(
                `relation must have 2 tokens; expected something like "give owner", got ${tokens.join(" ")}`
            );
        }
        if (tokens[0] === "give") {
            if (!state.validRelations.has(tokens[1]!)) {
                throw new TypeconfigError(
                    `userset rewrite line "${tokens.join(" ")}" refers to a relation that doesn't exist`
                );
            }
            state.relationRules.add({
                affected: state.inside?.[1]!,
                give: tokens[1]!,
            });
        }
    }

    // handles the lines where we are not inside anything; currently this is for setting the type of a typeconfig, and starting a relation definition
    private static handleGlobal(tokens: string[], state: TypeconfigState) {
        if (tokens.length < 2) {
            throw new TypeconfigError(
                `header must have 2 tokens; expected something like "type doc" or "relation viewer", got ${tokens.join(" ")}`
            );
        }
        switch (tokens[0]) {
            case "type": {
                if (typeof state.type === "string") {
                    throw new TypeconfigError(
                        `type override; type ${state.type} was already defined, got type ${tokens[1]}`
                    );
                }
                state.type = tokens[1];
                break;
            }
            case "relation": {
                state.validRelations.add(tokens[1]!);
                state.inside = tokens;
                break;
            }
        }
    }
}

const myConfig = await Typeconfig.fromFile("examples/typeconfig");
myConfig.saveToFile("examples/typeconfig.out.json");
