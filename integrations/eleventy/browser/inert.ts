export function createInertValue(): any {
	// `function`, not an arrow: arrows have no [[Construct]], so `new inert()` throws before the trap.
	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			// Must not look thenable, or `collect-config.js` would wait on it forever.
			if (prop === "then") return undefined;

			if (typeof prop === "symbol") {
				if (prop === Symbol.toPrimitive) return () => "";
				if (prop === Symbol.iterator) return function* () {};
				return undefined;
			}
			return inert;
		},
		apply: () => inert,
		construct: () => inert,
	};

	const inert: any = new Proxy(function () {}, handler);
	return inert;
}
