import type { Subject, UserId } from "./acl.ts";
import { Obj, Relation, UserSet } from "./acl.ts";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

type Vertex = Obj | UserId;

/**
 * Graph containing relations and vertices between them.
 */
class Graph {
    vertices: Vertex[];
    edges: Relation[];

    constructor(vertices: Vertex[], edges: Relation[]) {
        this.vertices = vertices;
        this.edges = edges;
    }

    // Methods for printing contents of a graph
    vertexStrings(): string[] {
        return this.vertices.map((vertex) => vertex.toString());
    }

    edgeStrings(): string[] {
        return this.edges.map((edge) => edge.toString());
    }

    getRelationsTo(vertex: Vertex): Relation[] {
        if (vertex instanceof Obj) {
            return this.edges.filter((edge) => vertex === edge.object);
        }
        return [];
    }

    /**
     * Given a Subject, return a list of all UserIds which match it.
     * A Subject can either be a UserId, in which case that UserId is returned.
     * Or it can be a UserSet, which match multiple UserIds.
     */
    resolveSubjects(subject: Subject): UserId[] {
        if (typeof subject === "number") return [subject];

        // We know the subject is a userset
        const userset = subject;

        // First, get all relations pointing to the object
        const users = this.getRelationsTo(userset.object)
            // Next, only take the relations which have the correct name
            .filter((rel) => rel.name === userset.relationName)
            // Lastly, resolve the subjects for each of the relations found (kind of like a for loop)
            .flatMap((rel) => this.resolveSubjects(rel.subject));

        // Deduplicate, i.e. remove all users who appear twice
        const uniqueUsers = new Set(users);

        // Convert back to array and return
        return [...uniqueUsers];
    }
}

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
        assert.deepEqual(users, [Bob, Alice, Knud, Gertrud]);
    });

    it("should handle loops", () => {
        const with_loop = edges.concat([
            new Relation(overLæge, "member", new UserSet(læge, "member")),
        ]);
        const graph = new Graph([], with_loop);

        const users = graph.resolveSubjects(new UserSet(mortenEhr, "viewer"));
        assert.deepEqual(users, [Bob, Alice, Knud, Gertrud]);
    });
});
