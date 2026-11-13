import type { Context, Emitter, TagToken, TopLevelToken } from "liquidjs";

/**
 * Structural stand-in for LiquidJS's internal `TagImplOptions`. Upstream only
 * declares it in `dist/template/tag-options-adapter.d.ts` — there is no runtime
 * module to import — so a direct import cannot be resolved under Node module
 * resolution. These types are part of the public declarations, hence living
 * here rather than in an implementation file.
 */
export interface LiquidTagImpl {
	[key: string]: any;
	parse?: (
		this: any,
		token: TagToken,
		remainingTokens: TopLevelToken[],
	) => void;
	render: (this: any, ctx: Context, emitter?: Emitter) => any;
}
