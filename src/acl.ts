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
}

export type Relation = string;
/**
 * Represents a set of users that all share an relation to an object
 */
export class UserSet {
    object: Obj;
    relation: Relation;

    constructor(object: Obj, relation: Relation) {
        this.object = object;
        this.relation = relation;
    }
}

export type UserId = number;
export type Subject = UserId | UserSet;
/**
 * The description of a relation between subjects and an object.
 */
export class ACL {
    object: Obj;
    relation: Relation;
    subject: Subject;

    constructor(object: Obj, relation: Relation, subject: Subject) {
        this.object = object;
        this.relation = relation;
        this.subject = subject;
    }
}
