type ObjectId = string;
type Type = string;
/**
 * A thing which a subject can have a relation to.
 * Consist of a type and a unique identifier.
 */
class Obj {

    type: Type;
    identifier: ObjectId;

    constructor(type: Type, identifier: ObjectId) {
        this.type = type;
        this.identifier = identifier;
    }


}


type Relation = string;
/**
 * Represents a set of users that all share an relation to an object
 */
class UserSet {

    object: Obj;
    relation: Relation;

    constructor(object: Obj, relation: Relation) {
        this.object = object;
        this.relation = relation;
    }

}

type UserId = number;
type Subject = UserId | UserSet;
/**
 * The description of a relation between subjects and an object.
 */
class ACL {

    object: Obj;
    relation: Relation;
    subject: Subject;

    constructor(object: Obj, relation: Relation, subject: Subject) {

        this.object = object;
        this.relation = relation;
        this.subject = subject;

    }

}

