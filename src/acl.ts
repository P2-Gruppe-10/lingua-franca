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

    constructor(object: Obj, relation: RelationName, subject: Subject) {
        this.object = object;
        this.name = relation;
        this.subject = subject;
    }

    // Same serialization style as the Zanzibar paper https://authzed.com/zanzibar
    toString(): string {
        return `${this.object.toString()}#${this.name}@${this.subject.toString()}`;
    }
}
