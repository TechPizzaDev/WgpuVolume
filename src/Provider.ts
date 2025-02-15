export type ProviderArray = readonly (Provider<unknown> | undefined)[] | [];

type InferProvider<T> = T extends Provider<infer U> ? U : T;

export type InferredProviders<A extends ProviderArray> = {
    -readonly [K in keyof A]: InferProvider<A[K]>;
};

export type MapFunc<T, R> = (value: T) => R;

export interface Provider<T> {
    get(): T;

    map<R>(func: MapFunc<T, R>): CachingProvider<R>;

    join<A extends ProviderArray>(providers: A): CachingProvider<[T, ...InferredProviders<A>]>;
}

export abstract class BaseProvider<T> implements Provider<T> {
    abstract get(): T;

    map<R>(func: MapFunc<T, R>): CachingProvider<R> {
        return new MapProvider(this, func);
    }

    join<A extends ProviderArray>(providers: A): CachingProvider<[T, ...InferredProviders<A>]> {
        return new JoinProvider([this, ...providers]);
    }
}

type NotifyCallback = () => void;

abstract class NotifyingProvider<T> extends BaseProvider<T> {
    private _listeners: NotifyCallback[] = [];

    invalidate() {
        for (const listener of this._listeners) {
            listener();
        }
    }

    attach(callback: NotifyCallback) {
        this._listeners.push(callback);
    }
}

export abstract class CachingProvider<T> extends NotifyingProvider<T> {
    private _cached: T | undefined;

    protected abstract compute(): T;

    override invalidate(): void {
        this._cached = undefined;
        super.invalidate();
    }

    override get(): T {
        if (!this._cached) {
            this._cached = this.compute();
        }
        return this._cached;
    }
}

export class MapProvider<T, R> extends CachingProvider<R> {
    private readonly _provider: Provider<T>;
    private readonly _func: MapFunc<T, R>;

    constructor(provider: Provider<T>, func: MapFunc<T, R>) {
        super();
        this._provider = provider;
        this._func = func;

        if (this._provider instanceof NotifyingProvider) {
            this._provider.attach(() => this.invalidate());
        }
    }

    override compute(): R {
        return this._func(this._provider.get());
    }
}

export class JoinProvider<A extends ProviderArray> extends CachingProvider<InferredProviders<A>> {
    private readonly _providers: A;

    constructor(providers: A) {
        super();
        this._providers = providers;

        for (const provider of this._providers) {
            if (provider instanceof NotifyingProvider) {
                provider.attach(() => this.invalidate());
            }
        }
    }

    override compute(): InferredProviders<A> {
        return this._providers.map(provider => {
            if (provider) {
                return provider.get();
            }
            return undefined;
        }) as InferredProviders<A>;
    }
}

export class ValueProvider<T> extends NotifyingProvider<T> {
    private _value: T;

    constructor(value: T) {
        super();
        this._value = value;
    }

    override get(): T {
        return this._value;
    }

    set(value: T) {
        this._value = value;
        this.invalidate();
    }
}

export class ConstantProvider<T> extends BaseProvider<T> {
    private readonly _value: T;

    constructor(value: T) {
        super();
        this._value = value;
    }

    override get(): T {
        return this._value;
    }
}
