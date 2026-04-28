export class TypeconfigError extends Error {
    constructor(message: string, options?: { cause: unknown }) {
        super(message, options);
        this.name = "TypeconfigError";
        Object.setPrototypeOf(this, new.target.prototype); // we have to restore the prototype chain because otherwise someone throwing TypeconfigError will in reality throw a generic Error??
    }
}
