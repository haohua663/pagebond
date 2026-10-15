import { describe, expect, it } from "vitest";
import { mapWork, searchOpenAlex } from "@/lib/providers/openalex";

describe("OpenAlex mapping", () => {
  it("does not fill a missing DOI or author", () => {
    const item = mapWork({
      id: "https://openalex.org/W1",
      title: "Classroom feedback",
      publication_year: 2013,
      authorships: [{ author: { display_name: "A. Author" } }, { author: {} }],
      primary_location: { source: { display_name: "Assessment in Education" } },
      cited_by_count: 12,
    });
    expect(item).toMatchObject({
      openalexId: "https://openalex.org/W1",
      title: "Classroom feedback",
      year: 2013,
      venue: "Assessment in Education",
      doi: null,
      authors: ["A. Author"],
    });
    expect(JSON.stringify(item)).not.toMatch(/10\.\d{4}/);
  });

  it("drops a work that has no title", () => {
    expect(mapWork({ id: "https://openalex.org/W2", doi: "https://doi.org/10.1000/example" })).toBeNull();
  });

  it("keeps an outline-friendly failure when the service fails", async () => {
    const result = await searchOpenAlex("classroom feedback", {
      fetchImpl: async () => new Response("no", { status: 503 }),
      now: new Date("2026-10-15T00:00:00.000Z"),
    });
    expect(result.status).toBe("failed");
    expect(result.items).toEqual([]);
    expect(result.message).toMatch(/框架仍可保存/);
  });

  it("labels an empty result as not found", async () => {
    const result = await searchOpenAlex("非常冷门的检索词", {
      fetchImpl: async () => Response.json({ results: [] }),
    });
    expect(result.status).toBe("not_found");
  });
});
