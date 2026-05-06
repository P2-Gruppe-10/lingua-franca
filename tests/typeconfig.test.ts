import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import { Typeconfig } from "../src/typeconfig.ts";
import { TypeconfigError } from "../src/error.ts";

describe("The Typeconfig class", { timeout: 2000 }, () => {
    const validTestFilePath = "./valid_test.typeconfig";
    const errorTestFilePath = "./error_test.typeconfig";

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

    it("parses a valid config file", async () => {
        const config = await Typeconfig.fromFile(validTestFilePath);

        expect(config.type).toBe("doc");
        expect(config.validRelations.size).toBe(3);
        expect(config.validRelations.has("viewer")).toBeTruthy();
        expect(config.validRelations.has("editor")).toBeTruthy();
        expect(config.validRelations.has("owner")).toBeTruthy();

        const editorRewrite = config.usersetRewrites.get("editor");
        const ownerRewrite = config.usersetRewrites.get("owner");

        expect(editorRewrite).toBeDefined();
        expect(ownerRewrite).toBeDefined();
        expect([...editorRewrite!]).toEqual(["viewer"]);
        expect([...ownerRewrite!]).toEqual(["editor"]);

        const perms = [...config.permissions];
        expect(perms.length).toBe(3);

        const readPerm = perms.find((p) => p.name === "read");
        expect(readPerm).toBeDefined();
        if (!readPerm) return;
        expect([...readPerm.grantedBy]).toEqual(["viewer", "editor"]);
    });

    it("parses tuple-to-userset rewrite rules in relations and permissions", async () => {
        const rewriteConfig = `
type doc

relation parent

relation viewer

relation editor

relation access
give parent->viewer

permission can_view = parent->viewer OR viewer
`;
        await fs.writeFile(validTestFilePath, rewriteConfig);

        const config = await Typeconfig.fromFile(validTestFilePath);

        const accessRewrite = config.usersetRewrites.get("access");
        expect(accessRewrite).toBeDefined();
        expect([...accessRewrite!]).toEqual([
            { relation: "parent", subRelation: "viewer" },
        ]);

        const canView = [...config.permissions].find(
            (p) => p.name === "can_view"
        );
        expect(canView).toBeDefined();
        if (!canView) return;

        expect([...canView.grantedBy]).toEqual([
            { relation: "parent", subRelation: "viewer" },
            "viewer",
        ]);
    });

    it("throws an error for malformed OR logic", async () => {
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

    it("throws an error for duplicate relations", async () => {
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

    it("throws an error if no type is defined", async () => {
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
