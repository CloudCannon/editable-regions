/**
 * A stand-in that survives whatever a config does to it — property access,
 * calls and `new` all return it again. Used for unrecorded config methods
 * (`collect-config.mjs`) and stubbed Node modules (`stub-mode.mjs`).
 *
 * @returns {any}
 */
export function createInertValue() {
	// `function`, not an arrow: arrows have no [[Construct]], so `new inert()`
	// would throw before the trap runs.
	const handler = {
		/** @param {any} _target @param {string | symbol} prop */
		get(_target, prop) {
			// Must not look thenable: `collect-config.mjs` treats a plugin result
			// with a callable `.then` as a promise, and this one would never
			// settle — hanging the mirror, so no component is ever published.
			if (prop === "then") return undefined;

			if (typeof prop === "symbol") {
				// Else `String(inert)` walks toPrimitive → valueOf → toString,
				// gets a proxy from each, and throws.
				if (prop === Symbol.toPrimitive) return () => "";
				// Else `for…of` / spread over a stubbed call throws.
				if (prop === Symbol.iterator) return function* () {};
				return undefined;
			}
			return inert;
		},
		apply: () => inert,
		construct: () => inert,
	};

	const inert = new Proxy(function () {}, handler);
	return inert;
}
