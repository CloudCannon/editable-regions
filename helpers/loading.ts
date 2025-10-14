let completeLoading: () => void;

export const loadingPromise = new Promise<void>((resolve) => {
	completeLoading = resolve;
});

export { completeLoading };
