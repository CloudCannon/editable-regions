export type AstroCollectionsMode = "content-layer" | "legacy" | "legacy-compat";

type LegacyConfig = {
	collections?: boolean;
	collectionsBackwardsCompat?: boolean;
};

export const getAstroCollectionsMode = (
	legacy: LegacyConfig | undefined,
): AstroCollectionsMode => {
	if (legacy && "collectionsBackwardsCompat" in legacy) {
		return legacy.collectionsBackwardsCompat
			? "legacy-compat"
			: "content-layer";
	}

	if (legacy && "collections" in legacy) {
		return legacy.collections ? "legacy" : "content-layer";
	}

	return "legacy";
};
