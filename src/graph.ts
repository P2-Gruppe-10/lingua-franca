import type { Subject, UserId } from "./acl.ts";
import { Obj, Relation, UserSet } from "./acl.ts";

type Vertex = Obj | UserId;

function verticesAreEqual(a: Vertex, b: Vertex): boolean {
    if (typeof a === "number") {
        return a === b;
    }

    return (a as Obj).isEqual(b as Obj);
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
        const isRelation = (o: object) =>
            Object.hasOwn(o, "object") &&
            Object.hasOwn(o, "name") &&
            Object.hasOwn(o, "subject");
        const isObj = (o: object) =>
            Object.hasOwn(o, "type") && Object.hasOwn(o, "identifier");
        const isUserSet = (o: object) =>
            Object.hasOwn(o, "object") && Object.hasOwn(o, "relationName");
        const isGraph = (o: object) =>
            Object.hasOwn(o, "vertices") && Object.hasOwn(o, "edges");

        /**
         * Takes in a default JS object, and converts it into the correct type.
         */
        const reviver = (_key: string, val: any) => {
            if (typeof val !== "object" || Array.isArray(val)) return val;

            if (isRelation(val)) {
                if (!(val.object instanceof Obj)) {
                    throw new Error(
                        `Relations 'object' field is not of type 'Obj', ${JSON.stringify(val.object)}`
                    );
                }

                if (typeof val.name !== "string") {
                    throw new Error(
                        `Relations 'name' field is not of type 'string', ${JSON.stringify(val.name)}`
                    );
                }

                if (
                    typeof val.subject !== "number" &&
                    !(val.subject instanceof UserSet)
                ) {
                    throw new Error(
                        `Relations 'subject' field is not of type 'UserId' or 'UserSet', ${JSON.stringify(val.subject)}`
                    );
                }

                return new Relation(val.object, val.name, val.subject);
            }

            if (isObj(val)) {
                if (typeof val.type !== "string") {
                    throw new Error(
                        `Objs 'type' field is not of type 'string', ${JSON.stringify(val.type)}`
                    );
                }

                if (typeof val.identifier !== "string") {
                    throw new Error(
                        `Objs 'identifier' field is not of type 'string', ${JSON.stringify(val.identifier)}`
                    );
                }

                return new Obj(val.type, val.identifier);
            }

            if (isUserSet(val)) {
                if (!(val.object instanceof Obj)) {
                    throw new Error(
                        `UserSets 'object' field not of type 'Obj': ${JSON.stringify(val.object)}`
                    );
                }

                if (typeof val.relationName !== "string") {
                    throw new Error(
                        `UserSets 'relationName' field is not of type 'string', ${JSON.stringify(val.relationName)}`
                    );
                }

                return new UserSet(val.object, val.relationName);
            }

            if (isGraph(val)) {
                if (!val.edges.every((rel: any) => rel instanceof Relation)) {
                    throw new Error(
                        "The graphs 'edges' field contains object which is not of type 'Relation'"
                    );
                }

                // TODO: Apply same check for vertices when they are used

                return new Graph(val.vertices, val.edges);
            }

            throw new Error(
                `Graph JSON has invalid object "${JSON.stringify(val)}"`
            );
        };

        const graph: Graph = JSON.parse(json, reviver);

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
}
