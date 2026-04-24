import type { Subject, UserId } from "./acl.ts";
import { Obj, Relation } from "./acl.ts";

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

    getRelationsOf(vertex: Vertex): Relation[] {
        if (vertex instanceof Obj) {
            return this.edges.filter((edge) => vertex === edge.object);
        }
        return [];
    }

    resolveSubjects(subject: Subject): UserId[] {
        if (typeof subject === 'number') {
            return [subject];
        }
        let foundUsers: UserId[] = [];
        this.edges.filter((relation) => subject.relation === relation.relation);
    }
    
}
