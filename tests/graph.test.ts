import { describe, it, expect } from "vitest";
import { Obj, Relation, UserSet } from "../src/acl.ts";
import Graph from "../src/graph.ts";

describe("A graph", () => {
    const mortenEhr = new Obj("EHR", "Morten's");

    const læge = new Obj("Group", "Læge");
    const overLæge = new Obj("Group", "Over Læge");

    const Bob = 0;
    const Alice = 1;
    const Knud = 2;
    const Gertrud = 3;
    const Martin = 4;

    const edges: Relation[] = [
        new Relation(mortenEhr, "viewer", new UserSet(læge, "member")),
        new Relation(læge, "member", new UserSet(overLæge, "admin")),
        new Relation(læge, "member", new UserSet(overLæge, "member")),
        new Relation(overLæge, "admin", Bob),
        new Relation(overLæge, "member", Alice),
        new Relation(læge, "member", Knud),
        new Relation(mortenEhr, "viewer", Alice),
        new Relation(mortenEhr, "viewer", Gertrud),
        new Relation(overLæge, "ASS!!", Martin),
    ];

    it("should resolve all subjects", () => {
        const graph = new Graph([], edges);

        const users = graph.resolveSubjects(new UserSet(mortenEhr, "viewer"));

        expect(users).toEqual(new Set([Bob, Alice, Knud, Gertrud]));
    });

    it("should find the target (DFS)", () => {
        const graph = new Graph([], edges);
        const userset = new UserSet(mortenEhr, "viewer");

        expect(graph.DFS(Bob, userset)).toBeTruthy();
        expect(graph.DFS(Alice, userset)).toBeTruthy();
        expect(graph.DFS(Knud, userset)).toBeTruthy();
        expect(graph.DFS(Gertrud, userset)).toBeTruthy();
        expect(graph.DFS(Bob, Bob)).toBeTruthy();

        expect(graph.DFS(Martin, userset)).toBeFalsy();
        expect(graph.DFS(Bob, 37)).toBeFalsy();
        expect(
            graph.DFS(Bob, new UserSet(mortenEhr, "silkeborger"))
        ).toBeFalsy();
    });

    it("should find the target (DFS) and handle loops", () => {
        const with_loop = edges.concat([
            new Relation(overLæge, "member", new UserSet(læge, "member")),
        ]);
        const graph = new Graph([], with_loop);
        const userset = new UserSet(mortenEhr, "viewer");

        expect(graph.DFS(Bob, userset)).toBeTruthy();
        expect(graph.DFS(Alice, userset)).toBeTruthy();
        expect(graph.DFS(Knud, userset)).toBeTruthy();
        expect(graph.DFS(Gertrud, userset)).toBeTruthy();
        expect(graph.DFS(Bob, Bob)).toBeTruthy();

        expect(graph.DFS(Martin, userset)).toBeFalsy();
        expect(graph.DFS(0, 37)).toBeFalsy();
        expect(
            graph.DFS(Bob, new UserSet(mortenEhr, "silkeborger"))
        ).toBeFalsy();
    });

    it("should resolve subject and handle loops", () => {
        const with_loop = edges.concat([
            new Relation(overLæge, "member", new UserSet(læge, "member")),
        ]);
        const graph = new Graph([], with_loop);

        const users = graph.resolveSubjects(new UserSet(mortenEhr, "viewer"));
        expect(users).toEqual(new Set([Bob, Alice, Knud, Gertrud]));
    });
});
