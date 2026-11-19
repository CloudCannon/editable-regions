import type { CloudCannonVisualEditorAPIV1File } from "@cloudcannon/visual-editor-api";
import { beforeAll, describe, expect, test } from "vitest";
import { getAstroCollectionsMode } from "../../../integrations/astro/modules/collections-mode.js";
import {
	buildCollectionEntry,
	getCollection,
	getEntry,
} from "../../../integrations/astro/modules/content.js";
import {
	type MockFile,
	setMockCollections,
	setMockFiles,
} from "../_mocks/cloudcannon.js";

const sourceFile = (
	path: string,
	data: Record<string, any> = {},
	content?: string,
): CloudCannonVisualEditorAPIV1File =>
	({
		path,
		data: { get: async () => data },
		content: { get: async () => content },
	}) as unknown as CloudCannonVisualEditorAPIV1File;

describe("collections mode detection", () => {
	test.each([
		[{}, "legacy"],
		[{ collections: false }, "content-layer"],
		[{ collections: true }, "legacy"],
		[{ collectionsBackwardsCompat: false }, "content-layer"],
		[{ collectionsBackwardsCompat: true }, "legacy-compat"],
	] as const)("%o is %s", (legacy, expected) => {
		expect(getAstroCollectionsMode(legacy)).toBe(expected);
	});
});

describe("content-layer entries (Astro 5, 6, and 7 default)", () => {
	test("ids are slugified without the file extension", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("/src/content/blog/Second Post.md", {}, "Body\n"),
			"blog",
			"content-layer",
		);

		expect(entry).toMatchObject({
			collection: "blog",
			id: "second-post",
			slug: "second-post",
			filePath: "src/content/blog/Second Post.md",
			body: "Body",
		});
	});

	test("a trailing index segment is dropped from the id", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("/src/content/blog/nested/index.md", {}, "Body"),
			"blog",
			"content-layer",
		);

		expect(entry.id).toBe("nested");
		expect(entry.slug).toBe("nested");
	});

	test("frontmatter slugs become the entry id", async () => {
		const entry = await buildCollectionEntry(
			sourceFile(
				"/src/content/blog/custom-slug.md",
				{ slug: "my-custom-slug" },
				"Body",
			),
			"blog",
			"content-layer",
		);

		expect(entry.id).toBe("my-custom-slug");
		expect(entry.slug).toBe("my-custom-slug");
	});

	test("id segments match Astro's github-slugger output", async () => {
		const upper = await buildCollectionEntry(
			sourceFile("/src/content/blog/UPPER Case.Name.md", {}, "Body"),
			"blog",
			"content-layer",
		);
		const underscore = await buildCollectionEntry(
			sourceFile("/src/content/blog/under_score.md", {}, "Body"),
			"blog",
			"content-layer",
		);

		expect(upper.id).toBe("upper-casename");
		expect(underscore.id).toBe("under_score");
	});

	test("data entries are slugified and have no body or render", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("/src/content/authors/Some Author.Name.yaml", {
				name: "Some Author",
			}),
			"authors",
			"content-layer",
		);

		expect(entry).toMatchObject({
			collection: "authors",
			id: "some-authorname",
			slug: "some-authorname",
			filePath: "src/content/authors/Some Author.Name.yaml",
			data: { name: "Some Author" },
		});
		expect(entry.body).toBeUndefined();
		expect(entry.render).toBeUndefined();
	});

	test("file paths work with or without a leading slash", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("src/content/blog/first-post.md", {}, "Body"),
			"blog",
			"content-layer",
		);

		expect(entry.id).toBe("first-post");
		expect(entry.filePath).toBe("src/content/blog/first-post.md");
	});
});

describe("legacy entries (Astro 5 legacy collections)", () => {
	test("content ids keep the file extension", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("/src/content/blog/Second Post.md", {}, "Body\n"),
			"blog",
			"legacy",
		);

		expect(entry).toMatchObject({
			id: "Second Post.md",
			slug: "second-post",
			body: "Body",
		});
		expect(entry.filePath).toBeUndefined();
	});

	test("a trailing index segment is only dropped from the slug", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("/src/content/blog/nested/index.md", {}, "Body"),
			"blog",
			"legacy",
		);

		expect(entry.id).toBe("nested/index.md");
		expect(entry.slug).toBe("nested");
	});

	test("frontmatter slugs only affect the slug", async () => {
		const entry = await buildCollectionEntry(
			sourceFile(
				"/src/content/blog/custom-slug.md",
				{ slug: "my-custom-slug" },
				"Body",
			),
			"blog",
			"legacy",
		);

		expect(entry.id).toBe("custom-slug.md");
		expect(entry.slug).toBe("my-custom-slug");
	});

	test("data ids drop the extension without slugifying", async () => {
		const entry = await buildCollectionEntry(
			sourceFile("/src/content/authors/Some Author.Name.yaml", {
				name: "Some Author",
			}),
			"authors",
			"legacy",
		);

		expect(entry.id).toBe("Some Author.Name");
		expect(entry.body).toBeUndefined();
		expect(entry.render).toBeUndefined();
	});
});

describe("legacy-compat entries (Astro 6 and 7 backwards compatibility)", () => {
	test("frontmatter slugs still win over path ids", async () => {
		const entry = await buildCollectionEntry(
			sourceFile(
				"/src/content/blog/custom-slug.md",
				{ slug: "my-custom-slug" },
				"Body",
			),
			"blog",
			"legacy-compat",
		);

		expect(entry.id).toBe("my-custom-slug");
		expect(entry.filePath).toBe("src/content/blog/custom-slug.md");
	});

	test("content and data ids keep the file extension", async () => {
		const content = await buildCollectionEntry(
			sourceFile("/src/content/blog/first-post.md", {}, "Body"),
			"blog",
			"legacy-compat",
		);
		const data = await buildCollectionEntry(
			sourceFile("/src/content/authors/one.yaml", { name: "One" }),
			"authors",
			"legacy-compat",
		);

		expect(content.id).toBe("first-post.md");
		expect(data.id).toBe("one.yaml");
	});
});

describe("astro:content shim lookups", () => {
	const mockFiles: MockFile[] = [
		{
			path: "/src/content/blog/first-post.md",
			data: { get: () => Promise.resolve({ title: "First" }) },
			get: () => Promise.resolve("First body.\n"),
			content: { get: () => Promise.resolve("First body.\n") },
		},
		{
			path: "/src/content/blog/second-post.md",
			data: { get: () => Promise.resolve({ title: "Second" }) },
			get: () => Promise.resolve("Second body.\n"),
			content: { get: () => Promise.resolve("Second body.\n") },
		},
	];

	beforeAll(() => {
		setMockFiles(mockFiles);
		setMockCollections(["blog"]);
	});

	test("getCollection returns modern ids and bodies", async () => {
		const entries = await getCollection("blog");

		expect(entries.map((entry) => entry.id)).toEqual([
			"first-post",
			"second-post",
		]);
		expect(entries[0].body).toBe("First body.");
	});

	test("getEntry resolves ids and slugs", async () => {
		await expect(
			getEntry({ collection: "blog", id: "first-post" }),
		).resolves.toMatchObject({ id: "first-post" });
		await expect(getEntry("blog", "second-post")).resolves.toMatchObject({
			id: "second-post",
		});
		await expect(
			getEntry({ collection: "blog", slug: "first-post" }),
		).resolves.toMatchObject({ id: "first-post" });
	});
});
