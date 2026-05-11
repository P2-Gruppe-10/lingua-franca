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

type Vertex = Obj | UserId;

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
                return new Graph(val.vertices, val.edges);
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

    modifyObject(orginalObject: Obj, modifiedObject: Obj): boolean {
        const vertex = this.vertices.find((vertex) =>
            verticesAreEqual(vertex, orginalObject)
        );

        if (!vertex) return false;

        if (vertex instanceof Obj) {
            vertex.identifier = modifiedObject.identifier;
            vertex.type = modifiedObject.type;

            return true;
        }

        return false;
    }
}
