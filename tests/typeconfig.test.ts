import { describe, it, before } from "node:test";
import { promises as fs } from "node:fs";
import assert, { strict } from "node:assert";
import { Typeconfig } from "../src/typeconfig.ts";
import { TypeconfigError } from "../src/error.ts";

describe("The Typeconfig class", { timeout: 2000 }, () => {
    const validTestFilePath = "./valid_test.typeconfig";
    const errorTestFilePath = "./error_test.typeconfig";
    const outFilePath = "./test_out.json";
    before(async () => {
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

        // global properties
        strict.equal(config.type, "doc");
        strict.equal(config.validRelations.size, 3);
        assert.ok(config.validRelations.has("viewer"));
        assert.ok(config.validRelations.has("editor"));
        assert.ok(config.validRelations.has("owner"));

        // relation rules
        const rules = [...config.relationRules];
        strict.equal(rules.length, 2);
        assert.deepEqual(rules[0], { affected: "editor", give: "viewer" });
        assert.deepEqual(rules[1], { affected: "owner", give: "editor" });

        // permissions
        const perms = [...config.permissions];
        strict.equal(perms.length, 3);

        const readPerm = perms.find((p) => p.name === "read");
        assert.ok(readPerm);
        assert.deepEqual([...readPerm.grantedBy], ["viewer", "editor"]);
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

        strict.equal(parsedJSON.type, "doc");

        // sets should be converted to arrays by the replacer
        assert.ok(Array.isArray(parsedJSON.validRelations));
        assert.deepEqual(parsedJSON.validRelations, [
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

        await assert.rejects(
            // assert.rejects means we expect the promise to reject, which is the async equivalent of throwing
            async () => await Typeconfig.fromFile(errorTestFilePath),
            (err: unknown) => {
                assert.ok(err instanceof TypeconfigError);
                assert.match(err.message, /Malformed permission logic/);
                return true;
            }
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

        await assert.rejects(
            async () => await Typeconfig.fromFile(errorTestFilePath),
            (err: unknown) => {
                assert.ok(err instanceof TypeconfigError);
                assert.match(err.message, /is already defined/);
                return true;
            }
        );
    });

    it("should throw an error if no type is defined", async () => {
        const noTypeConfig = `
relation viewer

permission read = viewer
`;
        await fs.writeFile(errorTestFilePath, noTypeConfig);

        await assert.rejects(
            async () => await Typeconfig.fromFile(errorTestFilePath),
            (err: unknown) => {
                assert.ok(err instanceof TypeconfigError);
                assert.match(err.message, /No type was ever specified/);
                return true;
            }
        );
    });
});
