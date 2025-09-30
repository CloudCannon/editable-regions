export const actions = new Proxy(
	{},
	{
		get() {
			console.warn(
				"[CloudCannon] actions is not supported in an editable component. Please use an editing fallback instead.",
			);
			return () => {};
		},
	},
);

export const defineAction = () => {
	console.warn(
		"[CloudCannon] defineAction is not supported in an editable component. Please use an editing fallback instead.",
	);
	return {
		handler: () => {},
		input: null,
	};
};

export const isInputError = () => {
	console.warn(
		"[CloudCannon] isInputError is not supported in an editable component. Please use an editing fallback instead.",
	);
	return false;
};

export const isActionError = () => {
	console.warn(
		"[CloudCannon] isActionError is not supported in an editable component. Please use an editing fallback instead.",
	);
	return false;
};

export class ActionError extends Error {
	/**
	 * @param {any} code
	 * @param {any} message
	 */
	constructor(code, message) {
		super(message);
		console.warn(
			"[CloudCannon] ActionError is not supported in an editable component. Please use an editing fallback instead.",
		);
		this.code = code;
	}
}

export const getActionContext = () => {
	console.warn(
		"[CloudCannon] getActionContext is not supported in an editable component. Please use an editing fallback instead.",
	);
	return {
		action: undefined,
		setActionResult: () => {},
		serializeActionResult: () => ({}),
	};
};

export const deserializeActionResult = () => {
	console.warn(
		"[CloudCannon] deserializeActionResult is not supported in an editable component. Please use an editing fallback instead.",
	);
	return {};
};

export const getActionPath = () => {
	console.warn(
		"[CloudCannon] getActionPath is not supported in an editable component. Please use an editing fallback instead.",
	);
	return "";
};
