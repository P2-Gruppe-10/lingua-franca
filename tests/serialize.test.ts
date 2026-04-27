import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import { Obj, Relation, UserSet } from "../src/acl.ts";
import assert, { strict } from "node:assert";
import Graph from "../src/graph.ts";
import { serializeConfig, deserializeConfig } from "../src/serialize.ts";

describe("Serialization", { timeout: 1000 }, () => {
    it("should serialize a simple graph", async () => {
        const edges: Relation[] = [
            new Relation(
                new Obj("EHR", "mortenEHR"),
                "viewer",
                new UserSet(new Obj("group", "læge"), "member")
            ),
        ];

        const graph = new Graph([], edges);

        serializeConfig(graph);

        const read = await fs.readFile("./config.json");

        strict.equal(
            read.toString(),
            '{"vertices":[],"edges":[{"object":{"type":"EHR","identifier":"mortenEHR"},"name":"viewer","subject":{"object":{"type":"group","identifier":"læge"},"relationName":"member"}}]}'
        );
    });

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

    it("should serialize the graph", async () => {
        const graph = new Graph([], edges);

        serializeConfig(graph);

        const deserializedGraph = await deserializeConfig();

        assert.deepEqual(deserializedGraph, graph);
    });
});
