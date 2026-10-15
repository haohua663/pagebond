export interface RequirementItem {
  text: string;
  source: "school" | "user" | "model" | "unknown";
}

export interface DirectionOption {
  title: string;
  question: string;
  materials: string;
  method: string;
  workload: string;
  difficulty: string;
}

export interface RequirementsBrief {
  requirements: RequirementItem[];
  keywords: { term: string; source: string }[];
  conflicts: string[];
  missing: string[];
  directions: DirectionOption[];
  assumptions: string[];
  titleFixed: boolean;
  origin: "local" | "model";
}

export interface OutlineSection {
  heading: string;
  purpose: string;
  content: string;
  evidence: string;
  length: string;
  openQuestions: string[];
}

export interface OutlineDraft {
  keywords: { term: string; source: string }[];
  theme: string;
  scope: string;
  premises: string[];
  writingOrder: string[];
  sections: OutlineSection[];
  lengthNote: string;
  literatureQueries: string[];
  assumptions: string[];
  origin: "local" | "model";
  requirementsConflict: boolean;
}

const REQUIREMENT_LINE = /必须|不得|不少于|不超过|字数|截止|格式|查重|重复率|字体|参考文献|实验|访谈|问卷|伦理/;

function linesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line.length >= 4);
}

function keywordsFrom(text: string, source: string): { term: string; source: string }[] {
  const found = new Map<string, string>();
  const patterns = [
    /《([^》]{2,30})》/g,
    /「([^」]{2,20})」/g,
    /[“"]([^”"]{2,20})[”"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(text))) {
      found.set(match[1], source);
    }
  }
  for (const line of linesOf(text)) {
    const heading = /^(?:题目|主题|关键词)[:：]\s*(.+)$/.exec(line);
    if (heading) {
      for (const part of heading[1].split(/[，,、;；]/)) {
        const term = part.trim();
        if (term.length >= 2 && term.length <= 24) found.set(term, source);
      }
    }
  }
  return [...found.entries()].slice(0, 12).map(([term, from]) => ({ term, source: from }));
}

export function localRequirements(requirementText: string, notes: string): RequirementsBrief {
  const requirements: RequirementItem[] = linesOf(requirementText)
    .filter((line) => REQUIREMENT_LINE.test(line))
    .slice(0, 12)
    .map((text) => ({ text, source: "school" as const }));
  for (const line of linesOf(notes).slice(0, 8)) {
    requirements.push({ text: line, source: "user" });
  }
  const keywords = [
    ...keywordsFrom(requirementText, "要求"),
    ...keywordsFrom(notes, "补充"),
  ];
  const wordAsks = [...requirementText.matchAll(/(\d+)\s*字/g)].map((match) => Number(match[1]));
  const conflicts: string[] = [];
  if (wordAsks.length >= 2 && new Set(wordAsks).size > 1) {
    conflicts.push(`字数要求同时出现 ${wordAsks.join("、")} 字，需要作者决定以哪一条为准。`);
  }
  const missing: string[] = [];
  if (!/题目|主题|《/.test(`${requirementText}\n${notes}`)) missing.push("题目或主题还没有写明。");
  if (!wordAsks.length && !/篇幅|字数/.test(requirementText)) missing.push("没有看到字数或篇幅。");
  if (!/材料|数据|文献|访谈|实验|案例/.test(`${requirementText}\n${notes}`)) {
    missing.push("还不知道可以用哪些材料。");
  }
  const titleFixed = /题目[:：]\s*\S{4,}/.test(requirementText) || /《[^》]{4,}》/.test(requirementText);
  const directions: DirectionOption[] = titleFixed
    ? []
    : [
        {
          title: keywords[0] ? `围绕「${keywords[0].term}」做范围界定` : "先把问题收成一个可核对的范围",
          question: "现有材料能支持哪个具体问题？",
          materials: "要求里已经点名的材料。没有点名的部分保持空白。",
          method: "还不能确定。缺材料时不预设实验或访谈。",
          workload: "取决于缺口是否补上。",
          difficulty: "题目未定，范围容易散。",
        },
        {
          title: "只整理要求，不新开研究问题",
          question: "若材料不足，这篇能完成到哪一步？",
          materials: "用户已经写出的补充。",
          method: "以文献或文本细读为上限，不写成已完成的实证。",
          workload: "低于新采集数据。",
          difficulty: "容易把计划写成结果。",
        },
      ].slice(0, 3);
  return {
    requirements,
    keywords,
    conflicts,
    missing: missing.slice(0, 3),
    directions,
    assumptions: conflicts.length ? ["关键限制互相冲突时，后面的框架不算已满足要求。"] : [],
    titleFixed,
    origin: "local",
  };
}

export function localOutline(
  brief: RequirementsBrief,
  choice: { directionTitle?: string; assumptions?: string[] },
): OutlineDraft {
  const chosen = choice.directionTitle || brief.directions[0]?.title || "按已写明的题目";
  const conflict = brief.conflicts.length > 0;
  return {
    keywords: brief.keywords,
    theme: chosen,
    scope: conflict ? "限制互相冲突，这个框架只是在显式假设下的草案。" : "范围只覆盖要求里写明的内容。",
    premises: [
      "未完成的采集、实验或访谈只写成计划，不写成结果。",
      ...(choice.assumptions ?? brief.assumptions),
    ],
    writingOrder: ["先写能核对的要求和材料", "再写问题与范围", "最后才写还没做的部分，并标成计划"],
    sections: [
      {
        heading: "问题与范围",
        purpose: "写清要回答的问题，以及不回答什么。",
        content: chosen,
        evidence: "要求原文和用户补充。",
        length: "按用户字数分配；没有字数时不编一个总数。",
        openQuestions: brief.missing,
      },
      {
        heading: "材料与做法",
        purpose: "列出已经有的材料。没有的方法不补写。",
        content: "只使用要求或补充里出现的材料。",
        evidence: "用户提供的材料清单。",
        length: "短。",
        openQuestions: brief.missing.filter((item) => item.includes("材料")),
      },
      {
        heading: "待核对的文献",
        purpose: "给检索词，不编参考文献。",
        content: "文献要等检索结果。检索失败时这一节仍保留为待查。",
        evidence: "OpenAlex 返回的字段，或标明未找到。",
        length: "短。",
        openQuestions: ["检索词是否需要作者再改。"],
      },
    ],
    lengthNote: conflict ? "因要求冲突，篇幅不能算作已满足。" : "各节篇幅在用户给出总字数后再配平。",
    literatureQueries: brief.keywords.slice(0, 3).map((item) => item.term),
    assumptions: choice.assumptions ?? brief.assumptions,
    origin: "local",
    requirementsConflict: conflict,
  };
}
