import ImageInternal from "./image.astro";
import PictureInternal from "./picture.astro";

export const Image = ImageInternal;
export const Picture = PictureInternal;

/**
 * @param {{src: any }} options
 * @returns
 */
export const getImage = async (options) => {
	const resolvedSrc =
		typeof options.src === "object" && "then" in options.src
			? ((await options.src).default ?? (await options.src))
			: options.src;
	return {
		rawOptions: {
			src: {
				src: resolvedSrc,
			},
		},
		options: {
			src: {
				src: resolvedSrc,
			},
		},
		src: resolvedSrc,
		srcSet: { values: [] },
		attributes: {},
	};
};

export const inferRemoteSize = async () => {
	console.warn(
		"[CloudCannon] inferRemoteSize is not supported in an editable component. Please use an editing fallback instead.",
	);
	return {};
};
