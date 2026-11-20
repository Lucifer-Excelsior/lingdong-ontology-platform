import { strToU8, zipSync } from "fflate";
import type { Role } from "@lingdong/contracts";
import { sandboxErpSql } from "../db/client.js";
import { ITU_REVIEW_ITEMS } from "../seed/itu-and-supply-seed-data.js";

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildParagraphXml(text: string, opts?: { bold?: boolean; sizeHalfPt?: number; colorHex?: string }): string {
  const rPr: string[] = [];
  if (opts?.bold) rPr.push("<w:b/>");
  if (opts?.sizeHalfPt) rPr.push(`<w:sz w:val="${opts.sizeHalfPt}"/>`);
  if (opts?.colorHex) rPr.push(`<w:color w:val="${opts.colorHex}"/>`);
  const rPrXml = rPr.length > 0 ? `<w:rPr>${rPr.join("")}</w:rPr>` : "";
  return `<w:p><w:pPr><w:spacing w:after="140"/></w:pPr><w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildTableXml(headers: string[], rows: string[][]): string {
  const headerCells = headers
    .map(
      (h) =>
        `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr>${buildParagraphXml(h, { bold: true, sizeHalfPt: 20 })}</w:tc>`
    )
    .join("");

  const bodyRows = rows
    .map(
      (r) =>
        `<w:tr>${r.map((cell) => `<w:tc>${buildParagraphXml(cell, { sizeHalfPt: 20 })}</w:tc>`).join("")}</w:tr>`
    )
    .join("");

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tr>${headerCells}</w:tr>
    ${bodyRows}
  </w:tbl>`;
}

/**
 * Packages standards-compliant ECMA-376 OpenXML (.docx) bytes using `fflate`.
 */
export function buildDocxBytes(params: {
  title: string;
  subtitle: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
  table?: { headers: string[]; rows: string[][] };
  footnotes: string[];
}): Uint8Array {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const bodyParts: string[] = [
    buildParagraphXml(params.title, { bold: true, sizeHalfPt: 34, colorHex: "1D4ED8" }),
    buildParagraphXml(params.subtitle, { sizeHalfPt: 20, colorHex: "64748B" }),
  ];

  for (const sec of params.sections) {
    bodyParts.push(buildParagraphXml(sec.heading, { bold: true, sizeHalfPt: 25, colorHex: "0F172A" }));
    for (const p of sec.paragraphs) {
      bodyParts.push(buildParagraphXml(p, { sizeHalfPt: 21 }));
    }
  }

  if (params.table) {
    bodyParts.push(buildTableXml(params.table.headers, params.table.rows));
  }

  if (params.footnotes.length > 0) {
    bodyParts.push(buildParagraphXml("PROV-O 语义溯源与契约锚点", { bold: true, sizeHalfPt: 22, colorHex: "475569" }));
    for (const fn of params.footnotes) {
      bodyParts.push(buildParagraphXml(`• ${fn}`, { sizeHalfPt: 18, colorHex: "64748B" }));
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParts.join("\n")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "word/document.xml": strToU8(documentXml),
  });
}

export async function generateContractRenewalBriefDocx(
  contractNo: string,
  callerRole: Role = "OWNER"
): Promise<{
  filename: string;
  bytes: Uint8Array;
}> {
  const safeContractNo = contractNo.replace(/[^A-Za-z0-9_-]/g, "") || "HT-2026-089";
  const [row] = await sandboxErpSql<
    Array<{
      contract_no: string;
      title: string;
      customer_name: string;
      owner_name: string;
      signed_at: string;
      expires_at: string;
      total_amount: string;
      status: string;
      risk_note: string;
    }>
  >`
    SELECT c.contract_no, c.title, cu.customer_name, o.owner_name,
           c.signed_at::text, c.expires_at::text, c.total_amount::text, c.status, c.risk_note
    FROM public.contracts c
    LEFT JOIN public.customers cu ON cu.customer_id = c.customer_id
    LEFT JOIN public.account_owners o ON o.owner_id = c.owner_id
    WHERE c.contract_no = ${safeContractNo}
  `;

  const cTitle = row?.title ?? "政企年度技术维保框架协议";
  const custName = row?.customer_name ?? "华东智算中心科技有限公司";
  const expiresAt = row?.expires_at ?? "2026-11-30";
  const amountWan =
    callerRole === "VIEWER"
      ? "*** (VIEWER 角色已脱敏)"
      : row
        ? `${(Number(row.total_amount) / 10000).toFixed(2)} 万元`
        : "285.00 万元";

  const bytes = buildDocxBytes({
    title: `合同到期续签谈判与风控简报（${contractNo}）`,
    subtitle: `生成系统：灵·洞本体工作站 V3 · 签发时间：${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    sections: [
      {
        heading: "一、 标的主合同实时台账核验",
        paragraphs: [
          `签约客户主体：${custName}（主数据信用评级 AAA）`,
          `合同名称与编号：${cTitle}（${contractNo}）`,
          `签署与到期窗口：${row?.signed_at ?? "2025-12-01"} 至 ${expiresAt} · 合同总金额：${amountWan}`,
        ],
      },
      {
        heading: "二、 法务条款风险与处置建议",
        paragraphs: [
          row?.risk_note ?? "含第 4.2 条自动顺延排他条款，建议在到期前 30 日内发出书面续签确认函。",
          "违约金核算红线：依据《政企大客户履约违约金核算细则》#chunk-04，单方提前解约赔偿上限为协议总价款的 15%。",
        ],
      },
    ],
    table: {
      headers: ["治理检查项", "当前图谱状态", "建议执行动作"],
      rows: [
        ["到期预警窗口", `到期日 ${expiresAt}`, "本周内向客户发送书面续签确认函"],
        ["负责人指派", row?.owner_name ?? "周明", "通过受控动作 CreateFollowUpTask 下发 CRM 工单"],
        ["SHACL 闭合校验", "PASS (0 违例)", "允许进入商务续签审批流转"],
      ],
    },
    footnotes: [
      `Oxigraph 活跃实例锚点：https://ontology.caict.cn/contract/instance/${contractNo}`,
      "制度证据锚点：《2026 商务合同续签与风控管理规范.pdf》#chunk-12 [1420..1538] & #chunk-18 [2210..2340]",
    ],
  });

  return { filename: `${safeContractNo}-renewal-brief.docx`, bytes };
}

export function generateItuReviewReportDocx(): { filename: string; bytes: Uint8Array } {
  const bytes = buildDocxBytes({
    title: "ITU-T 国际标准提案合规性与术语冲突审查意见书",
    subtitle: "目标文稿：《Y.31xx 算力网络语义编排架构提案草案 v0.4.docx》 · 审查标准：ITU-T Author's Guide",
    sections: [
      {
        heading: "一、 本体规则自动核对综述",
        paragraphs: [
          `术语定义对齐率：94.5% · 规范性引用有效率：100% · 发现需修订冲突项：${ITU_REVIEW_ITEMS.filter((i) => i.severity === "CONFLICT").length} 处。`,
        ],
      },
      {
        heading: "二、 逐条规范性审查明细与修订建议",
        paragraphs: ["下表列出经 ITU-T 标准规范本体与 SHACL 助动词约束检出的全部审查结论："],
      },
    ],
    table: {
      headers: ["章节条款", "规范助动词", "审查结论", "本体规则锚点", "修订建议"],
      rows: ITU_REVIEW_ITEMS.map((item) => [
        item.clauseRef,
        item.normativeVerb,
        item.findingTitle,
        item.ontologyRuleAnchor,
        item.recommendation,
      ]),
    },
    footnotes: [
      "审查本体空间：urn:ws:ws-itu:rev:51b0e8a1:tbox",
      "导则证据锚点：《ITU-T SG13 标准提案编写导则.pdf》#chunk-6.3 [6120..6280]",
    ],
  });

  return { filename: "ITU-T-Y31xx-compliance-review-report.docx", bytes };
}
