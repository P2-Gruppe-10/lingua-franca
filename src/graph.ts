import type { Subject, UserId } from "./acl.ts";
import {
    Obj,
    Relation,
    UserSet,
    isObject,
    isObjShape,
    isUserSetShape,
    isRelationShape,
    type JsonObject,
} from "./acl.ts";

export const TOMBSTONE = "..."; // we use this to let a UserSet represent just an object. used by typeconfigs to cross-reference different types

export type Vertex = Obj | UserId;

function verticesAreEqual(a: Vertex, b: Vertex): boolean {
    if (typeof a === "number") {
        return a === b;
    }

    return a.isEqual(b as Obj);
}

/**
 * Tests wether an object is _shaped_ like a `Graph`.
 */
export function isGraphShape(o: JsonObject): o is {
    vertices: Vertex[];
    edges: Relation[];
} {
    return (
        "vertices" in o &&
        Array.isArray(o.vertices) &&
        o.vertices.every((v) => typeof v === "number" || v instanceof Obj) &&
        "edges" in o &&
        Array.isArray(o.edges) &&
        o.edges.every((e) => e instanceof Relation)
    );
}

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

    vertexInGraph(vertex: Vertex): boolean {
        return this.vertices.some((v) => verticesAreEqual(v, vertex));
    }

    subjectInGraph(subject: Subject): boolean {
        const vertex: Vertex =
            typeof subject === "number" ? subject : subject.object;
        return this.vertexInGraph(vertex);
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

    getRelationsFrom(vertex: Vertex): Relation[] {
        if (vertex instanceof Obj) {
            return this.edges.filter(
                (edge) =>
                    edge.subject instanceof UserSet &&
                    vertex.isEqual(edge.subject.object)
            );
        }
        return [];
    }

    /**
     * Converts Graph to JSON compatible string
     */
    stringify(): string {
        return JSON.stringify(this);
    }

    /**
     * Converts a JSON string into a `Graph`.
     *
     * @param json The json string representing a `Graph`.
     *
     * @throws {SyntaxError} if `json` is not valid JSON.
     *
     * @throws {Error} if `json` has invalid configuration.
     */
    static fromJSON(json: string): Graph {
        const reviver = (_key: string, val: unknown): unknown => {
            if (!isObject(val)) {
                return val;
            }

            if (isObjShape(val)) {
                return new Obj(val.type, val.identifier);
            }

            if (isUserSetShape(val)) {
                return new UserSet(val.object, val.relationName);
            }

            if (isRelationShape(val)) {
                return new Relation(val.object, val.name, val.subject);
            }

            if (isGraphShape(val)) {
                const graph = new Graph(val.vertices, val.edges);
                // make sure all objects in the edges are references to objects in the vertices array.
                graph.edges = graph.edges.map((edge) => {
                    // First find the object in the vertices array which corresponds to the "object" member of the edge
                    const to: Obj = edge.object;
                    const actualTo = graph.vertices.find((v) =>
                        verticesAreEqual(v, to)
                    );
                    if (!(actualTo instanceof Obj)) {
                        throw new Error(
                            `Edge has object not found in vertices. Object: "${to.toString()}"`
                        );
                    }

                    let subject: Subject;
                    if (edge.subject instanceof UserSet) {
                        // If the "subject" member of the edge is a UserSet, find the object in the UserSet
                        const object = edge.subject.object;
                        const actualFrom = graph.vertices.find((v) =>
                            verticesAreEqual(v, object)
                        );
                        if (!(actualFrom instanceof Obj))
                            throw new Error(
                                `Edge userset object not defined in vertices. Object: "${object.toString()}"`
                            );

                        subject = new UserSet(
                            actualFrom,
                            edge.subject.relationName
                        );
                    } else {
                        // If the "subject" member of the edge is a UserId, make sure it is defined.
                        if (!graph.vertices.includes(edge.subject))
                            throw new Error(
                                `Edge has user not defined in vertices. UserID: "${edge.subject}"`
                            );

                        subject = edge.subject;
                    }

                    // We now have correct references to objects in the "vertices array"
                    return new Relation(actualTo, edge.name, subject);
                });

                return graph;
            }

            throw new Error(
                `Invalid object shape in json: ${JSON.stringify(val)}`
            );
        };

        const graph: unknown = JSON.parse(json, reviver);

        if (!(graph instanceof Graph)) {
            throw new Error("JSON did not contain a Graph");
        }

        return graph;
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

        if (userset.relationName === TOMBSTONE) {
            return new Set(); // we skip the tombstones in userset resolution because they don't actually point to any UserIds
        }

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

    DFS(target: UserId, subject: Subject): boolean {
        const stack: Subject[] = [subject];
        const visited: Set<Subject> = new Set<Subject>();

        while (stack.length > 0) {
            //Since the stack is not empty, pop can not return undefined
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const node = stack.pop()!;
            if (visited.has(node)) {
                continue;
            }

            visited.add(node);

            if (node === target) return true;

            //If the type is number and it aint the target, run next node.
            if (typeof node === "number") continue;

            const subjects = this.getRelationsTo(node.object)
                // Next, only take the relations which have the correct name
                .filter((rel) => rel.name === node.relationName)
                .map((rel) => rel.subject);

            stack.push(...subjects);
        }

        return false;
    }

    addEdge(obj: Obj, name: string, subject: Subject): void {
        const foundObj = this.vertices.find((vertex) =>
            verticesAreEqual(vertex, obj)
        );

        const foundSubject = this.vertices.find((vertex) =>
            verticesAreEqual(
                vertex,
                subject instanceof UserSet ? subject.object : subject
            )
        );

        if (!(foundObj instanceof Obj)) {
            throw new Error(
                "Edge object does not exist in graph, please create it first."
            );
        }

        if (!foundSubject) {
            throw new Error(
                "Edge subject (UserId or UserSet.object) does not exist in graph, please create it first."
            );
        }

        subject =
            foundSubject instanceof Obj
                ? new UserSet(foundSubject, (subject as UserSet).relationName)
                : foundSubject;

        const relation = new Relation(foundObj, name, subject);

        if (this.edges.some((edge) => edge.isEqual(relation))) {
            throw new Error("Edge already exists in graph");
        }

        this.edges.push(relation);
    }

    deleteEdge(relation: Relation): boolean {
        const index = this.edges.findIndex((edge) => edge.isEqual(relation));

        if (index === -1) return false;

        this.edges.splice(index, 1);

        return true;
    }

    addVertex(vertex: Vertex): boolean {
        if (this.vertexInGraph(vertex)) {
            return false;
        }

        this.vertices.push(vertex);

        return true;
    }

    deleteVertex(vertex: Vertex): boolean {
        //Find the index of the object in verticies to make sure it exists
        const index = this.vertices.findIndex((v) =>
            verticesAreEqual(v, vertex)
        );

        //If it does not exists return false
        if (index === -1) return false;

        //Find all the edges point to and from the object
        const connectedEdges = [
            ...this.getRelationsTo(vertex),
            ...this.getRelationsFrom(vertex),
        ];

        //Delete all the edges pointing to and from the object
        for (const edge of connectedEdges) {
            this.deleteEdge(edge);
        }

        //Delete the object
        this.vertices.splice(index, 1);

        return true;
    }

    modifyObject(orginal: Obj, modified: Obj): boolean {
        const vertex = this.vertices.find((vertex) =>
            verticesAreEqual(vertex, orginal)
        );

        if (!vertex) return false;

        if (vertex instanceof Obj) {
            vertex.identifier = modified.identifier;
            vertex.type = modified.type;

            return true;
        }

        return false;
    }

    // clone using round-trip serialization, because the deserialization is already awesome we can just use that wow
    clone(): Graph {
        return Graph.fromJSON(this.stringify());
    }
}
