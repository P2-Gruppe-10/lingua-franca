import { describe, it, expect } from "vitest";
import { Obj, Relation, UserSet } from "../src/acl.ts";
import Graph, { type Vertex } from "../src/graph.ts";

describe("A graph", () => {
    const mortenEhr = new Obj("EHR", "Morten's");

    const læge = new Obj("Group", "Læge");
    const overLæge = new Obj("Group", "Over Læge");

    const bob = 0;
    const alice = 1;
    const knud = 2;
    const gertrud = 3;
    const martin = 4;
    const morten = 5;
    const ib = 6; // not used in the edges

    const vertices: Vertex[] = [
        mortenEhr,
        læge,
        overLæge,
        morten,
        bob,
        alice,
        knud,
        gertrud,
        martin,
        ib,
    ];

    const edges: Relation[] = [
        new Relation(mortenEhr, "viewer", new UserSet(læge, "member")),
        new Relation(læge, "member", new UserSet(overLæge, "admin")),
        new Relation(læge, "member", new UserSet(overLæge, "member")),
        new Relation(overLæge, "admin", bob),
        new Relation(overLæge, "member", alice),
        new Relation(læge, "member", knud),
        new Relation(mortenEhr, "viewer", alice),
        new Relation(mortenEhr, "viewer", gertrud),
        new Relation(overLæge, "ASS!!", martin),
    ];

    const g = new Graph(vertices, edges);

    it("should resolve all subjects", () => {
        const graph = g.clone();

        const users = graph.resolveSubjects(new UserSet(mortenEhr, "viewer"));

        expect(users).toStrictEqual(new Set([bob, alice, knud, gertrud]));
    });

    it("should find the target (DFS)", () => {
        const graph = g.clone();
        const userset = new UserSet(mortenEhr, "viewer");

        expect(graph.DFS(bob, userset)).toBeTruthy();
        expect(graph.DFS(alice, userset)).toBeTruthy();
        expect(graph.DFS(knud, userset)).toBeTruthy();
        expect(graph.DFS(gertrud, userset)).toBeTruthy();
        expect(graph.DFS(bob, bob)).toBeTruthy();

        expect(graph.DFS(martin, userset)).toBeFalsy();
        expect(graph.DFS(bob, 37)).toBeFalsy();
        expect(
            graph.DFS(bob, new UserSet(mortenEhr, "silkeborger"))
        ).toBeFalsy();
    });

    it("should find the target (DFS) and handle loops", () => {
        const graph = g.clone();
        graph.addEdge(overLæge, "member", new UserSet(læge, "member"));
        const userset = new UserSet(mortenEhr, "viewer");

        expect(graph.DFS(bob, userset)).toBeTruthy();
        expect(graph.DFS(alice, userset)).toBeTruthy();
        expect(graph.DFS(knud, userset)).toBeTruthy();
        expect(graph.DFS(gertrud, userset)).toBeTruthy();
        expect(graph.DFS(bob, bob)).toBeTruthy();

        expect(graph.DFS(martin, userset)).toBeFalsy();
        expect(graph.DFS(0, 37)).toBeFalsy();
        expect(
            graph.DFS(bob, new UserSet(mortenEhr, "silkeborger"))
        ).toBeFalsy();
    });
});
