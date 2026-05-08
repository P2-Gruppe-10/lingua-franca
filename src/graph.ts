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
}
