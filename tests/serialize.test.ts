import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { Obj, Relation, UserSet } from "../src/acl.ts";
import Graph, { type Vertex } from "../src/graph.ts";
import { serializeConfig, deserializeConfig } from "../src/serialize.ts";

describe("Serialization", { timeout: 1000 }, () => {
    it("should serialize a simple graph", async () => {
        const mortenEHR = new Obj("EHR", "mortenEHR");
        const læge = new Obj("group", "læge");

        const vertices: Vertex[] = [mortenEHR, læge];
        const edges: Relation[] = [
            new Relation(mortenEHR, "viewer", new UserSet(læge, "member")),
        ];

        const graph = new Graph(vertices, edges);

        await serializeConfig(graph);

        const read = await fs.readFile("./config.json");

        expect(read.toString()).toStrictEqual(
            '{"vertices":[{"type":"EHR","identifier":"mortenEHR"},{"type":"group","identifier":"læge"}],"edges":[{"object":{"type":"EHR","identifier":"mortenEHR"},"name":"viewer","subject":{"object":{"type":"group","identifier":"læge"},"relationName":"member"}}]}'
        );
    });

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

    it("should serialize the graph", async () => {
        const graph = new Graph(vertices, edges);

        await serializeConfig(graph);

        const deserializedGraph = await deserializeConfig();

        expect(deserializedGraph).toStrictEqual(graph);
    });
});
