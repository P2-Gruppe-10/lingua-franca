export class TypeconfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TypeconfigError";
        Object.setPrototypeOf(this, TypeconfigError.prototype);
    }
}
