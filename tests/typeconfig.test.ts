import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import { Typeconfig } from "../src/typeconfig.ts";
import { TypeconfigError } from "../src/error.ts";

describe("The Typeconfig class", { timeout: 2000 }, () => {
    const validTestFilePath = "./valid_test.typeconfig";
    const errorTestFilePath = "./error_test.typeconfig";
    const outFilePath = "./test_out.json";

    beforeAll(async () => {
        const validConfig = `
type doc

relation viewer

relation editor
give viewer

relation owner
give editor

permission read = viewer OR editor
permission write = editor OR owner
permission delete = owner
`;
        await fs.writeFile(validTestFilePath, validConfig);
    });

    it("should successfully parse a valid config file", async () => {
        const config = await Typeconfig.fromFile(validTestFilePath);

        expect(config.type).toBe("doc");
        expect(config.validRelations.size).toBe(3);
        expect(config.validRelations.has("viewer")).toBeTruthy();
        expect(config.validRelations.has("editor")).toBeTruthy();
        expect(config.validRelations.has("owner")).toBeTruthy();

        const rules = [...config.relationRules];
        expect(rules.length).toBe(2);
        expect(rules[0]).toEqual({ affected: "editor", give: "viewer" });
        expect(rules[1]).toEqual({ affected: "owner", give: "editor" });

        const perms = [...config.permissions];
        expect(perms.length).toBe(3);

        const readPerm = perms.find((p) => p.name === "read");
        expect(readPerm).toBeDefined();
        if (!readPerm) return; // avoid the "!" operator (readPerm!) because eslint HATES that
        expect([...readPerm.grantedBy]).toEqual(["viewer", "editor"]);
    });

    it("should serialize the parsed config correctly", async () => {
        const config = await Typeconfig.fromFile(validTestFilePath);
        await config.saveToFile(outFilePath);

        const readJSON = await fs.readFile(outFilePath, "utf-8");

        interface JsonParsedTypeconfig {
            type: string;
            validRelations: string[];
            relations: {
                affected: string;
                give: string[];
            }[];
            permissions: {
                name: string;
                grantedBy: string[];
            }[];
        }

        const parsedJSON = JSON.parse(readJSON) as JsonParsedTypeconfig;

        expect(parsedJSON.type).toBe("doc");
        expect(Array.isArray(parsedJSON.validRelations)).toBeTruthy();
        expect(parsedJSON.validRelations).toEqual([
            "viewer",
            "editor",
            "owner",
        ]);
    });

    it("should throw an error for malformed OR logic", async () => {
        const badLogicConfig = `
type doc

relation viewer

relation editor

permission read = viewer OR
`;
        await fs.writeFile(errorTestFilePath, badLogicConfig);

        await expect(
            Typeconfig.fromFile(errorTestFilePath)
        ).rejects.toBeInstanceOf(TypeconfigError);
        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toThrow(
            /Malformed permission logic/
        );
    });

    it("should throw an error for duplicate relations", async () => {
        const dupRelationConfig = `
type doc

relation viewer

relation editor

relation viewer
`;
        await fs.writeFile(errorTestFilePath, dupRelationConfig);

        await expect(
            Typeconfig.fromFile(errorTestFilePath)
        ).rejects.toBeInstanceOf(TypeconfigError);
        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toThrow(
            /is already defined/
        );
    });

    it("should throw an error if no type is defined", async () => {
        const noTypeConfig = `
relation viewer

permission read = viewer
`;
        await fs.writeFile(errorTestFilePath, noTypeConfig);

        await expect(
            Typeconfig.fromFile(errorTestFilePath)
        ).rejects.toBeInstanceOf(TypeconfigError);
        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toThrow(
            /No type was ever specified/
        );
    });
});
