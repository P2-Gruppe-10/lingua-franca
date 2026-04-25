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

    resolveSubjects(subject: Subject): UserId[] {
        if (typeof subject === "number") {
            return [subject];
        }

        let foundUsers: UserId[] = [];
        const relations = this.getRelationsTo(subject.object).filter(
            (relation) => subject.relationName === relation.name
        );

        for (const relation of relations) {
            foundUsers = foundUsers.concat(
                this.resolveSubjects(relation.subject)
            );
        }

        return foundUsers;
    }

    resolveSubjects2(subject: Subject): UserId[] {
        if (typeof subject === "number") return [subject];

        // We know the subject is a userset
        const userset = subject;

        // First, get all relations pointing to the object
        const users = this.getRelationsTo(userset.object)
            // Next, only take the relations which have the correct name
            .filter((rel) => rel.name === userset.relationName)
            // Lastly, resolve the subjects for each of the relations found (kind of like a for loop)
            .flatMap((rel) => this.resolveSubjects2(rel.subject));

        // Deduplicate, i.e. remove all users who appear twice
        const uniqueUsers = new Set(users);

        // Convert back to array and return
        return [...uniqueUsers];
    }
}

describe("graph", () => {
    it("should resolve all subjects", () => {
        let vertices: Vertex[] = [];

        //object: Obj;
        //relation: RelationName;
        //subject: Subject;

        let mortenEhr = new Obj("EHR", "morten");

        let læge = new Obj("group", "læge");
        let overLæge = new Obj("group", "overlæge");

        let Bob = 0;
        let Alice = 1;
        let Knud = 2;
        let Gertrud = 3;
        let Martin = 4;

        let egdes: Relation[] = [
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

        let graph = new Graph(vertices, egdes);
        console.log(graph.edgeStrings());

        let users = graph.resolveSubjects2(new UserSet(mortenEhr, "viewer"));
        console.log(users);

        assert.deepEqual(users, [Bob, Alice, Knud, Gertrud]);
    });
});
