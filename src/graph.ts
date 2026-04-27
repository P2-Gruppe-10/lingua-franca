import type { Subject, UserId } from "./acl.ts";
import { Obj, Relation } from "./acl.ts";

type Vertex = Obj | UserId;

/**
 * Graph containing relations and vertices between them.
 */
export default class Graph {
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
            return this.edges.filter((edge) => vertex.isEqual(edge.object));
        }
        return [];
    }

    //Converts Graph to JSON compatible string
    stringify(): string {
        return JSON.stringify(this);
    }

    //Converts JSON string to graph
    static fromJSON(json: string): Graph {
        return JSON.parse(json) as Graph;
    }

    /**
     * Given a Subject, return a list of all UserIds which match it.
     * A Subject can either be a UserId, in which case that UserId is returned.
     * Or it can be a UserSet, which match multiple UserIds.
     */
    resolveSubjects(subject: Subject): Set<UserId> {
        if (typeof subject === "number") return new Set([subject]);

        // We know the subject is a userset
        const userset = subject;

        // First, get all relations pointing to the object
        const users = this.getRelationsTo(userset.object)
            // Next, only take the relations which have the correct name
            .filter((rel) => rel.name === userset.relationName)
            // Resolve the subjects for each of the relations found (kind of like a for loop)
            .map((rel) => this.resolveSubjects(rel.subject))
            // Lastly, since `resolveSubjects` returns a set of users, merge them into 1 set
            .reduce((users, resolved) => users.union(resolved), new Set());

        return users;
    }
}
