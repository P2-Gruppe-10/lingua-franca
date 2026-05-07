export type ObjectId = string;
export type Type = string;
/**
 * A thing which a subject can have a relation to.
 * Consist of a type and a unique identifier.
 */
export class Obj {
    type: Type;
    identifier: ObjectId;

    constructor(type: Type, identifier: ObjectId) {
        this.type = type;
        this.identifier = identifier;
    }

    isEqual(other: Obj): boolean {
        return this.type === other.type && this.identifier === other.identifier;
    }

    toString(): string {
        return `${this.type}:${this.identifier}`;
    }
}

export type RelationName = string;
/**
 * Represents a set of users that all share an relation to an object
 */
export class UserSet {
    object: Obj;
    relationName: RelationName;

    constructor(object: Obj, relation: RelationName) {
        this.object = object;
        this.relationName = relation;
    }

    toString(): string {
        return `${this.object.toString()}#${this.relationName}`;
    }
}

export type UserId = number;
export type Subject = UserId | UserSet;
/**
 * The description of a relation between subjects and an object.
 */
export class Relation {
    object: Obj;
    name: RelationName;
    subject: Subject;

    constructor(object: Obj, name: RelationName, subject: Subject) {
        this.object = object;
        this.name = name;
        this.subject = subject;
    }

    // Same serialization style as the Zanzibar paper https://authzed.com/zanzibar
    toString(): string {
        return `${this.object.toString()}#${this.name}@${this.subject.toString()}`;
    }
}

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isObjShape(o: JsonObject): o is {
    type: unknown;
    identifier: unknown;
} {
    return "type" in o && "identifier" in o;
}

export function isUserSetShape(o: JsonObject): o is {
    object: unknown;
    relationName: unknown;
} {
    return "object" in o && "relationName" in o;
}

export function isRelationShape(o: JsonObject): o is {
    object: unknown;
    name: unknown;
    subject: unknown;
} {
    return "object" in o && "name" in o && "subject" in o;
}

export function isGraphShape(o: JsonObject): o is {
    vertices: unknown;
    edges: unknown;
} {
    return "vertices" in o && "edges" in o;
}
