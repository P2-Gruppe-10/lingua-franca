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
        new Map(),
        new Set([{ name: "can_view", grantedBy: new Set(["viewer"]) }])
    );
}

function makeFolderTypeconfig() {
    return new Typeconfig(
        folderType,
        new Set(["viewer"]),
        new Map(),
        new Set()
    );
}

describe("AuthZ", () => {
    describe("validate()", () => {
        it("returns no errors for a valid graph and typeconfigs", () => {
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

        it("reports missing typeconfig for a type that appears in the graph", () => {
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

        it("reports invalid relation for a relation not in the typeconfig", () => {
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

        it("only reports missing_typeconfig once per type even if that type has many edges", () => {
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
        it("returns true when user has a directly granting relation", () => {
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

        it("returns false when user does not have a granting relation", () => {
            const graph = new Graph([], []);
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(false);
        });

        it("returns false for an unknown permission name", () => {
            const graph = new Graph(
                [],
                [new Relation(docObj, "viewer", userId)]
            );
            const authz = new AuthZ(
                graph,
                new Map([[docType, makeDocTypeconfig()]])
            );

            expect(authz.hasPermission(userId, docObj, "can_fly")).toBe(false);
        });

        it("returns false when there is no typeconfig for the object's type", () => {
            const graph = new Graph([], []);
            const authz = new AuthZ(graph, new Map());

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(false);
        });

        it("returns true via a permission rewrite rule when user is viewer of the parent folder", () => {
            const docWithParentTypeconfig = new Typeconfig(
                docType,
                new Set(["viewer", "parent"]),
                new Map(),
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

        it("returns false via permission rewrite rule when user is viewer of a different folder", () => {
            const otherFolderObj = new Obj(folderType, "other");

            const docWithParentTypeconfig = new Typeconfig(
                docType,
                new Set(["viewer", "parent"]),
                new Map(),
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

        it("returns true via computed userset in userset rewrites", () => {
            const docWithComputedUserset = new Typeconfig(
                docType,
                new Set(["owner", "editor", "viewer"]),
                new Map([
                    ["viewer", new Set(["editor"])],
                    ["editor", new Set(["owner"])],
                ]),
                new Set([
                    {
                        name: "can_view",
                        grantedBy: new Set(["viewer"]),
                    },
                ])
            );

            const graph = new Graph(
                [],
                [new Relation(docObj, "owner", userId)]
            );

            const authz = new AuthZ(
                graph,
                new Map([[docType, docWithComputedUserset]])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(true);
        });

        it("returns true via tuple-to-userset in usersetRewrites", () => {
            const docWithRelationRewrite = new Typeconfig(
                docType,
                new Set(["viewer", "parent"]),
                new Map([
                    [
                        "viewer",
                        new Set([
                            { relation: "parent", subRelation: "viewer" },
                        ]),
                    ],
                ]),
                new Set([
                    {
                        name: "can_view",
                        grantedBy: new Set(["viewer"]),
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
                    new Relation(folderObj, "viewer", userId),
                ]
            );

            const authz = new AuthZ(
                graph,
                new Map([
                    [docType, docWithRelationRewrite],
                    [folderType, makeFolderTypeconfig()],
                ])
            );

            expect(authz.hasPermission(userId, docObj, "can_view")).toBe(true);
        });

        it.fails("cant handle cyclic userset rewrites yet", () => {
            const cyclicTypeconfig = new Typeconfig(
                docType,
                new Set(["viewer", "editor"]),
                new Map([
                    ["viewer", new Set(["editor"])],
                    ["editor", new Set(["viewer"])],
                ]),
                new Set([
                    {
                        name: "can_view",
                        grantedBy: new Set(["viewer"]),
                    },
                ])
            );

            const graph = new Graph(
                [],
                [new Relation(docObj, "editor", userId)]
            );

            const authz = new AuthZ(
                graph,
                new Map([[docType, cyclicTypeconfig]])
            );

            // this will recurse forever until stack overflow
            // editors are viewers and viewers are editors and editors are viewers and viewers are...................
            authz.hasPermission(userId, docObj, "can_view");
        });
    });
});
