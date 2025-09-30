export const sequence = () => {
	console.warn(
		"[CloudCannon] middleware is not supported in an editable component. Please use an editing fallback instead.",
	);
	return () => {};
};

export const defineMiddleware = () => {
	console.warn(
		"[CloudCannon] middleware is not supported in an editable component. Please use an editing fallback instead.",
	);
	return () => {};
};

export const createContext = () => {
	console.warn(
		"[CloudCannon] middleware is not supported in an editable component. Please use an editing fallback instead.",
	);
	return {};
};

export const trySerializeLocals = () => {
	console.warn(
		"[CloudCannon] middleware is not supported in an editable component. Please use an editing fallback instead.",
	);
	return "";
};
