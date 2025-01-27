export class Resource<T> {
    protected _handle: T;

    protected constructor(handle: T) {
        this._handle = handle;
    }

    get handle() {
        return this._handle;
    }
}