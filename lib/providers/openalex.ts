export type LiteratureStatus = "ok" | "not_found" | "failed" | "quota";

export interface LiteratureItem {
  openalexId: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  doi: string | null;
  url: string;
  citedByCount: number | null;
}

export interface LiteratureQueryResult {
  query: string;
  status: LiteratureStatus;
  items: LiteratureItem[];
  message: string;
  source: "OpenAlex";
  retrievedAt: string;
}

interface OpenAlexWork {
  id?: unknown;
  doi?: unknown;
  title?: unknown;
  publication_year?: unknown;
  cited_by_count?: unknown;
  authorships?: unknown;
  primary_location?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function doiFrom(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.replace(/^https?:\/\/doi\.org\//i, "");
}

/** Keep only fields the API actually returned. Missing DOI stays null. */
export function mapWork(work: OpenAlexWork): LiteratureItem | null {
  const title = asString(work.title);
  const openalexId = asString(work.id);
  if (!title || !openalexId) return null;
  const authors: string[] = [];
  if (Array.isArray(work.authorships)) {
    for (const entry of work.authorships) {
      if (!entry || typeof entry !== "object") continue;
      const author = (entry as { author?: { display_name?: unknown } }).author;
      const name = asString(author?.display_name);
      if (name) authors.push(name);
    }
  }
  const location = work.primary_location;
  let venue = "";
  if (location && typeof location === "object") {
    const source = (location as { source?: { display_name?: unknown } | null }).source;
    venue = asString(source?.display_name) ?? "";
  }
  const year = typeof work.publication_year === "number" ? work.publication_year : null;
  const citedByCount = typeof work.cited_by_count === "number" ? work.cited_by_count : null;
  return {
    openalexId,
    title,
    authors,
    year,
    venue,
    doi: doiFrom(work.doi),
    url: openalexId,
    citedByCount,
  };
}

export function dedupeLiterature(items: LiteratureItem[]): LiteratureItem[] {
  const seen = new Set<string>();
  const result: LiteratureItem[] = [];
  for (const item of items) {
    if (seen.has(item.openalexId)) continue;
    seen.add(item.openalexId);
    result.push(item);
  }
  return result;
}

export async function searchOpenAlex(
  query: string,
  options?: { apiKey?: string | null; perPage?: number; fetchImpl?: typeof fetch; now?: Date },
): Promise<LiteratureQueryResult> {
  const retrievedAt = (options?.now ?? new Date()).toISOString();
  const perPage = options?.perPage ?? 5;
  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
  });
  if (options?.apiKey) params.set("api_key", options.apiKey);
  const url = `https://api.openalex.org/works?${params.toString()}`;
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "yeyuan/0.1 (mailto:dev@localhost)",
      },
    });
    if (response.status === 429 || response.status === 402) {
      return {
        query,
        status: "quota",
        items: [],
        message: "OpenAlex 额度不足或请求过快。框架仍可保存。",
        source: "OpenAlex",
        retrievedAt,
      };
    }
    if (!response.ok) {
      return {
        query,
        status: "failed",
        items: [],
        message: `OpenAlex 服务失败（${response.status}）。框架仍可保存。`,
        source: "OpenAlex",
        retrievedAt,
      };
    }
    const payload = (await response.json()) as { results?: OpenAlexWork[] };
    const items = dedupeLiterature((payload.results ?? []).map((work) => mapWork(work)).filter((item): item is LiteratureItem => Boolean(item)));
    if (!items.length) {
      return {
        query,
        status: "not_found",
        items: [],
        message: "这个检索词没有返回文献。这不代表中文文献里没有相关研究。",
        source: "OpenAlex",
        retrievedAt,
      };
    }
    return {
      query,
      status: "ok",
      items,
      message: "只保留接口返回的题名、作者、年份、来源、DOI 或 OpenAlex ID、链接。",
      source: "OpenAlex",
      retrievedAt,
    };
  } catch {
    return {
      query,
      status: "failed",
      items: [],
      message: "OpenAlex 请求没有完成。框架仍可保存。",
      source: "OpenAlex",
      retrievedAt,
    };
  }
}
