import { describe, it, expect } from "vitest";
import { Obj, Relation, UserSet } from "../src/acl.ts";
import Graph, { TOMBSTONE } from "../src/graph.ts";
import { Typeconfig } from "../src/typeconfig.ts";
import { AuthZ } from "../src/authz.ts";

const docType = "doc";
const folderType = "folder";

const docObj = new Obj(docType, "readme");
const folderObj = new Obj(folderType, "home");

const userId = 1;

function makeDocTypeconfig() {
    return new Typeconfig(
        docType,
        new Set(["viewer", "owner"]),
        new Set(),
        new Set([{ name: "can_view", grantedBy: new Set(["viewer"]) }])
    );
}

function makeFolderTypeconfig() {
    return new Typeconfig(
        folderType,
        new Set(["viewer"]),
        new Set(),
        new Set()
    );
}

describe("AuthZ", () => {
    describe("validate()", () => {
        it("should return no errors for a valid graph and typeconfigs", () => {
            const graph = new Graph(
                [],
                [new Relation(docObj, "viewer", userId)]
            );
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            expect(authz.validate()).toEqual([]);
        });

        it("should report missing typeconfig for a type that appears in the graph", () => {
            const graph = new Graph(
                [],
                [new Relation(docObj, "viewer", userId)]
            );
            const authz = new AuthZ(graph, new Map());

            const errors = authz.validate();
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                kind: "missing_typeconfig",
                type: docType,
            });
        });

        it("should report invalid relation for a relation not in the typeconfig", () => {
            const graph = new Graph(
                [],
                [new Relation(docObj, "nincompoop", userId)]
            );
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            const errors = authz.validate();
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                kind: "invalid_relation",
                type: docType,
                relationName: "nincompoop",
            });
        });

        it("should only report missing_typeconfig once per type even if that type has many edges", () => {
            const graph = new Graph(
                [],
                [
                    new Relation(docObj, "viewer", userId),
                    new Relation(docObj, "owner", userId),
                ]
            );
            const authz = new AuthZ(graph, new Map());
            expect(authz.validate()).toHaveLength(1);
        });
    });

    describe("hasPermission()", () => {
        it("should return true when user has a directly granting relation", () => {
            const graph = new Graph(
                [],
                [new Relation(docObj, "viewer", userId)]
            );
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(true);
        });

        it("should return false when user does not have a granting relation", () => {
            const graph = new Graph([], []);
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(false);
        });

        it("should return false for an unknown permission name", () => {
            const graph = new Graph(
                [],
                [new Relation(docObj, "viewer", userId)]
            );
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            expect(
                authz.hasPermission(userId, docObj, "can_do_undefined_shit")
            ).toBe(false);
        });

        it("should return false when there is no typeconfig for the object's type", () => {
            const graph = new Graph([], []);
            const authz = new AuthZ(graph, new Map());

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(false);
        });

        it("should return true via a rewrite rule when user is viewer of the parent folder", () => {
            const docWithParentTypeconfig = new Typeconfig(
                docType,
                new Set(["viewer", "parent"]),
                new Set(),
                new Set([
                    {
                        name: "can_view",
                        grantedBy: new Set([
                            "viewer",
                            { relation: "parent", subRelation: "viewer" },
                        ]),
                    },
                ])
            );

            const graph = new Graph(
                [],
                [
                    // doc:readme#parent@folder:home#... which the tombstone userset linking the doc to its parent folder
                    new Relation(
                        docObj,
                        "parent",
                        new UserSet(folderObj, TOMBSTONE)
                    ),
                    // folder:home#viewer@1 meaning the user is a viewer of the folder
                    new Relation(folderObj, "viewer", userId),
                ]
            );

            const authz = new AuthZ(
                graph,
                new Map([
                    [docType, docWithParentTypeconfig],
                    [folderType, makeFolderTypeconfig()],
                ])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(true);
        });

        it("should return false via rewrite rule when user is viewer of a different folder", () => {
            const otherFolderObj = new Obj(folderType, "other");

            const docWithParentTypeconfig = new Typeconfig(
                docType,
                new Set(["viewer", "parent"]),
                new Set(),
                new Set([
                    {
                        name: "can_view",
                        grantedBy: new Set([
                            "viewer",
                            { relation: "parent", subRelation: "viewer" },
                        ]),
                    },
                ])
            );

            const graph = new Graph(
                [],
                [
                    new Relation(
                        docObj,
                        "parent",
                        new UserSet(folderObj, TOMBSTONE)
                    ),
                    // user is viewer of a totally unrelated folder which does NOT contain doc:readme
                    new Relation(otherFolderObj, "viewer", userId),
                ]
            );

            const authz = new AuthZ(
                graph,
                new Map([
                    [docType, docWithParentTypeconfig],
                    [folderType, makeFolderTypeconfig()],
                ])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(false);
        });
    });
});
