import ClientRouterInternal from "./client-router.astro";

export const ClientRouter = ClientRouterInternal;

export const fade = () => {
	console.warn(
		"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
	);
	return {};
};

export const slide = () => {
	console.warn(
		"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
	);
	return {};
};

export const navigate = () => {
	console.warn(
		"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
	);
};

export const supportsViewTransitions = false;

export const transitionEnabledOnThisPage = false;

export const getFallback = () => {
	console.warn(
		"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
	);
	return "none";
};

export const swapFunctions = {
	deselectScripts: () => {
		console.warn(
			"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
		);
	},
	swapRootAttributes: () => {
		console.warn(
			"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
		);
	},
	swapHeadElements: () => {
		console.warn(
			"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
		);
	},
	saveFocus: () => {
		console.warn(
			"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
		);
		return () => {};
	},
	swapBodyElement: () => {
		console.warn(
			"[CloudCannon] view transitions are not supported in an editable component. Please use an editing fallback instead.",
		);
	},
};
