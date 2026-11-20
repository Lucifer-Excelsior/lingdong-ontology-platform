import type {
  ExternalImportAnalysis,
  InferenceRuleRecord,
  OntologyClass,
  OntologyProperty,
} from "@lingdong/contracts";
import { parseRdfIntoOntologyEntities } from "./rdf-import.js";

/**
 * Standard 3.6: W3C JSON-LD 1.1 serialization of Ontology TBox, axioms & owl:imports.
 */
export function renderWorkspaceJsonLd(params: {
  workspaceName: string;
  namespaceIri: string;
  version: string;
  imports?: string[];
  classes: OntologyClass[];
  properties: OntologyProperty[];
}): Record<string, unknown> {
  const graph: Array<Record<string, unknown>> = [
    {
      "@id": params.namespaceIri.replace(/#$/, ""),
      "@type": "owl:Ontology",
      "rdfs:label": params.workspaceName,
      "owl:versionInfo": params.version,
      ...(params.imports && params.imports.length > 0
        ? { "owl:imports": params.imports.map((iri) => ({ "@id": iri })) }
        : {}),
    },
  ];

  for (const cls of params.classes) {
    graph.push({
      "@id": `ont:${cls.localName}`,
      "@type": "owl:Class",
      "rdfs:label": { "@language": "zh", "@value": cls.labelZh },
      "rdfs:comment": cls.description,
      "rdfs:subClassOf": { "@id": cls.subClassOf },
      ...(cls.equivalentClass ? { "owl:equivalentClass": { "@id": cls.equivalentClass } } : {}),
      ...(cls.disjointWith ? { "owl:disjointWith": { "@id": cls.disjointWith } } : {}),
    });
  }

  for (const prop of params.properties) {
    const types = [prop.kind === "ObjectProperty" ? "owl:ObjectProperty" : "owl:DatatypeProperty"];
    const ch = (prop.characteristics ?? "").toUpperCase();
    if (ch.includes("SYMMETRIC")) types.push("owl:SymmetricProperty");
    if (ch.includes("TRANSITIVE")) types.push("owl:TransitiveProperty");
    if (ch.includes("FUNCTIONAL") && !ch.includes("INVERSE_FUNCTIONAL")) types.push("owl:FunctionalProperty");
    graph.push({
      "@id": `ont:${prop.localName}`,
      "@type": types.length === 1 ? types[0] : types,
      "rdfs:label": { "@language": "zh", "@value": prop.labelZh },
      "rdfs:domain": { "@id": prop.domainIri },
      "rdfs:range": { "@id": prop.rangeIri },
      ...(prop.subPropertyOf ? { "rdfs:subPropertyOf": { "@id": prop.subPropertyOf } } : {}),
    });
  }

  return {
    "@context": {
      ont: params.namespaceIri,
      owl: "http://www.w3.org/2002/07/owl#",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    },
    "@graph": graph,
  };
}

/**
 * Standards 4.3 & 4.4: Formal Class Satisfiability & Class Hierarchy Cycle Checker.
 */
export function checkClassHierarchyAndSatisfiability(classes: OntologyClass[]): {
  hierarchyCycles: string[];
  unsatisfiableClasses: string[];
} {
  const byName = new Map<string, OntologyClass>();
  for (const c of classes) byName.set(c.localName, c);

  const normalizeRef = (ref?: string) => {
    if (!ref) return "";
    if (ref.startsWith("ont:")) return ref.slice(4);
    const idx = Math.max(ref.lastIndexOf("#"), ref.lastIndexOf("/"));
    return idx >= 0 ? ref.slice(idx + 1) : ref;
  };

  const hierarchyCycles: string[] = [];
  const ancestorsMap = new Map<string, Set<string>>();

  for (const cls of classes) {
    const visited = new Set<string>([cls.localName]);
    const ancestors = new Set<string>([cls.localName]);
    let cur = normalizeRef(cls.subClassOf);
    while (cur && cur !== "Thing") {
      if (visited.has(cur)) {
        hierarchyCycles.push(`循环继承冲突：${cls.localName} → ... → ${cur}`);
        break;
      }
      visited.add(cur);
      ancestors.add(cur);
      cur = normalizeRef(byName.get(cur)?.subClassOf);
    }
    ancestorsMap.set(cls.localName, ancestors);
  }

  const unsatisfiableClasses: string[] = [];
  for (const cls of classes) {
    const anc = ancestorsMap.get(cls.localName) ?? new Set<string>();
    for (const aName of anc) {
      const aCls = byName.get(aName);
      const disj = normalizeRef(aCls?.disjointWith);
      if (disj && anc.has(disj)) {
        unsatisfiableClasses.push(`不可满足类 ${cls.localName}：同时继承互斥类 ${aName} 与 ${disj}`);
        break;
      }
    }
  }

  return { hierarchyCycles, unsatisfiableClasses };
}

/**
 * Standards 3.4 & 3.5: Inference Rule Syntax Validation & Conflict Detection.
 */
export function validateInferenceRuleSyntaxAndConflicts(
  candidate: { name: string; scopeClass: string; conditionExpr: string; conclusionExpr: string },
  existingRules: InferenceRuleRecord[],
  validClassNames: Set<string>
): { syntaxValid: boolean; syntaxMessage: string; conflictWarnings: string[] } {
  const cond = candidate.conditionExpr.trim();
  const conc = candidate.conclusionExpr.trim();
  if (!candidate.name.trim()) return { syntaxValid: false, syntaxMessage: "规则名称不能为空", conflictWarnings: [] };
  if (validClassNames.size > 0 && !validClassNames.has(candidate.scopeClass)) {
    return { syntaxValid: false, syntaxMessage: `适用范围类 "${candidate.scopeClass}" 未在当前本体定义`, conflictWarnings: [] };
  }
  if (!/[=<>]|EXISTS|CONTAINS|IN\b/i.test(cond)) {
    return { syntaxValid: false, syntaxMessage: "条件表达式缺少比较或谓词操作符 (如 >、<=、=、CONTAINS)", conflictWarnings: [] };
  }
  if (!/(:|=|rdf:type|ont:)/i.test(conc)) {
    return { syntaxValid: false, syntaxMessage: "结论表达式需指明断言属性或类型 (如 rdf:type ont:HighRiskContract)", conflictWarnings: [] };
  }

  const conflictWarnings: string[] = [];
  for (const other of existingRules) {
    if (!other.enabled || other.scopeClass !== candidate.scopeClass) continue;
    if (other.conditionExpr.trim() === cond && other.conclusionExpr.trim() !== conc) {
      conflictWarnings.push(`与启用规则「${other.name}」存在同条件不同结论冲突`);
    }
    if (
      (conc.includes("HighRisk") && other.conclusionExpr.includes("LowRisk")) ||
      (conc.includes("LowRisk") && other.conclusionExpr.includes("HighRisk"))
    ) {
      conflictWarnings.push(`与规则「${other.name}」存在高低风险互斥结论风险`);
    }
  }

  return { syntaxValid: true, syntaxMessage: "规则语法与本体作用域校验通过", conflictWarnings };
}

/**
 * Standards 3.7 & 3.8: External Ontology Metadata (Namespace, Version, owl:imports) & Conflict Analysis.
 */
export function analyzeExternalOntologyImport(
  rawRdfText: string,
  fileName: string,
  existingClasses: OntologyClass[],
  existingProperties: OntologyProperty[]
): ExternalImportAnalysis {
  const nsMatch = rawRdfText.match(/@prefix\s+ont:\s*<([^>]+)>/i) ?? rawRdfText.match(/@base\s*<([^>]+)>/i);
  const namespaceIri = nsMatch?.[1] ?? "https://ontology.external.org/v1#";
  const ontMatch = rawRdfText.match(/<([^>]+)>\s+(?:a|rdf:type)\s+owl:Ontology/i);
  const versionMatch = rawRdfText.match(/owl:versionInfo\s+"([^"]+)"/i);
  const imports = Array.from(rawRdfText.matchAll(/owl:imports\s+<([^>]+)>/gi)).map((m) => m[1]);

  const parsed = parseRdfIntoOntologyEntities(rawRdfText, fileName, namespaceIri);
  const clsMap = new Map(existingClasses.map((c) => [c.localName, c.labelZh]));
  const propMap = new Map(existingProperties.map((p) => [p.localName, p.labelZh]));

  const conflicts: ExternalImportAnalysis["conflicts"] = [];
  for (const c of parsed.classes) {
    if (clsMap.has(c.localName)) {
      conflicts.push({
        localName: c.localName,
        kind: "CLASS",
        existingLabel: clsMap.get(c.localName)!,
        incomingLabel: c.labelZh,
        defaultResolution: "KEEP_EXISTING",
      });
    }
  }
  for (const p of parsed.properties) {
    if (propMap.has(p.localName)) {
      conflicts.push({
        localName: p.localName,
        kind: "PROPERTY",
        existingLabel: propMap.get(p.localName)!,
        incomingLabel: p.labelZh,
        defaultResolution: "KEEP_EXISTING",
      });
    }
  }

  return {
    ontologyIri: ontMatch?.[1] ?? namespaceIri.replace(/#$/, ""),
    namespaceIri,
    versionInfo: versionMatch?.[1] ?? "1.0.0",
    imports,
    parsedClasses: parsed.classes.length,
    parsedProperties: parsed.properties.length,
    conflicts,
  };
}
