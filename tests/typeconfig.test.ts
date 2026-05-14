import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import Typeconfig from "../src/typeconfig.ts";
import { TypeconfigError } from "../src/error.ts";

describe("The Typeconfig class", { timeout: 2000 }, () => {
    const validTestFilePath = "./valid_test.typeconfig";
    const errorTestFilePath = "./error_test.typeconfig";

    beforeAll(async () => {
        const validConfig = `
type doc

relation viewer
relation editor
relation owner

give viewer if editor
give editor if owner

permission read = viewer + editor
permission write = editor + owner
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
        const viewerRewrite = config.usersetRewrites.get("viewer");

        expect(editorRewrite).toBeDefined();
        expect(viewerRewrite).toBeDefined();
        if (!editorRewrite || !viewerRewrite) return;
        expect([...editorRewrite]).toEqual(["owner"]);
        expect([...viewerRewrite]).toEqual(["editor"]);

        const perms = config.permissions;
        expect(perms.size).toBe(3);

        const readPerm = perms.get("read");
        expect(readPerm).toBeDefined();
        if (!readPerm) return;
        expect([...readPerm]).toEqual(["viewer", "editor"]);
    });

    it("parses tuple-to-userset rewrite rules in relations and permissions", async () => {
        const rewriteConfig = `
type doc

relation parent
relation viewer
relation editor
relation access

give access if parent has viewer

permission can_view = parent:viewer + viewer
`;
        await fs.writeFile(validTestFilePath, rewriteConfig);

        const config = await Typeconfig.fromFile(validTestFilePath);

        const accessRewrite = config.usersetRewrites.get("access");
        expect(accessRewrite).toBeDefined();
        if (!accessRewrite) return;
        expect([...accessRewrite]).toEqual([{ relation: "parent", subRelation: "viewer" }]);

        const canView = config.permissions.get("can_view");
        expect(canView).toBeDefined();
        if (!canView) return;

        expect([...canView]).toEqual([{ relation: "parent", subRelation: "viewer" }, "viewer"]);
    });

    it("throws an error for malformed permission logic", async () => {
        const badLogicConfig = `
type doc

relation viewer
relation editor

permission read = viewer +
`;
        await fs.writeFile(errorTestFilePath, badLogicConfig);

        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toBeInstanceOf(TypeconfigError);
        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toThrow(/Malformed permission logic/);
    });

    it("throws an error for duplicate relations", async () => {
        const dupRelationConfig = `
type doc

relation viewer
relation editor
relation viewer
`;
        await fs.writeFile(errorTestFilePath, dupRelationConfig);

        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toBeInstanceOf(TypeconfigError);
        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toThrow(/is already defined/);
    });

    it("throws an error if no type is defined", async () => {
        const noTypeConfig = `
relation viewer

permission read = viewer
`;
        await fs.writeFile(errorTestFilePath, noTypeConfig);

        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toBeInstanceOf(TypeconfigError);
        await expect(Typeconfig.fromFile(errorTestFilePath)).rejects.toThrow(/No type was ever specified/);
    });
});
