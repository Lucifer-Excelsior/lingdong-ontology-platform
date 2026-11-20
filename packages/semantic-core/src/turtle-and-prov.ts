import type {
  OntologyClass,
  OntologyProperty,
  SemanticDiffItem,
} from "@lingdong/contracts";

function escTtl(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function toPrefixedOrFull(iriOrPrefixed: string, namespaceIri: string): string {
  if (iriOrPrefixed.startsWith("ont:") || iriOrPrefixed.startsWith("xsd:") || iriOrPrefixed.startsWith("owl:")) {
    return iriOrPrefixed;
  }
  if (iriOrPrefixed.startsWith(namespaceIri)) {
    return `ont:${iriOrPrefixed.slice(namespaceIri.length)}`;
  }
  return `<${iriOrPrefixed}>`;
}

export function renderWorkspaceTurtle(
  namespaceIri: string,
  classes: OntologyClass[],
  properties: OntologyProperty[]
): { ontologyTurtle: string; shaclTurtle: string; combinedTurtle: string } {
  const header = [
    `@prefix ont:  <${namespaceIri}> .`,
    `@prefix owl:  <http://www.w3.org/2002/07/owl#> .`,
    `@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .`,
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`,
    `@prefix sh:   <http://www.w3.org/ns/shacl#> .`,
    `@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .`,
    "",
  ].join("\n");

  const tboxBlocks: string[] = [];
  const shaclBlocks: string[] = [];

  for (const cls of classes) {
    const extraAxioms: string[] = [];
    if (cls.equivalentClass) {
      extraAxioms.push(`    owl:equivalentClass ${toPrefixedOrFull(cls.equivalentClass, namespaceIri)}`);
    }
    if (cls.disjointWith) {
      extraAxioms.push(`    owl:disjointWith ${toPrefixedOrFull(cls.disjointWith, namespaceIri)}`);
    }
    const lines = [
      `ont:${cls.localName} a owl:Class ;`,
      `    rdfs:label "${escTtl(cls.labelZh)}"@zh , "${escTtl(cls.labelEn)}"@en ;`,
      `    rdfs:comment "${escTtl(cls.description)}"@zh ;`,
      `    rdfs:subClassOf ${toPrefixedOrFull(cls.subClassOf, namespaceIri)}${extraAxioms.length > 0 ? " ;" : " ."}`,
    ];
    extraAxioms.forEach((ax, idx) => {
      lines.push(`${ax}${idx === extraAxioms.length - 1 ? " ." : " ;"}`);
    });
    tboxBlocks.push(lines.join("\n"));

    if (cls.shaclConstraints.length > 0) {
      const propBlocks = cls.shaclConstraints.map((c) => {
        const inner: string[] = [`        sh:path ont:${c.propertyLocalName}`];
        if (c.datatype) inner.push(`        sh:datatype ${c.datatype}`);
        if (c.minCount !== undefined) inner.push(`        sh:minCount ${c.minCount}`);
        if (c.maxCount !== undefined) inner.push(`        sh:maxCount ${c.maxCount}`);
        if (c.minInclusive !== undefined) inner.push(`        sh:minInclusive ${c.minInclusive}`);
        inner.push(`        sh:severity sh:${c.severity}`);
        return `    sh:property [\n${inner.join(" ;\n")}\n    ]`;
      });
      shaclBlocks.push(
        `ont:${cls.localName}Shape a sh:NodeShape ;\n    sh:targetClass ont:${cls.localName} ;\n${propBlocks.join(" ;\n")} .`
      );
    }
  }

  for (const prop of properties) {
    const types = [prop.kind === "ObjectProperty" ? "owl:ObjectProperty" : "owl:DatatypeProperty"];
    const ch = (prop.characteristics ?? "").toUpperCase();
    if (ch.includes("SYMMETRIC")) types.push("owl:SymmetricProperty");
    if (ch.includes("TRANSITIVE")) types.push("owl:TransitiveProperty");
    if (ch.includes("FUNCTIONAL") && !ch.includes("INVERSE_FUNCTIONAL")) types.push("owl:FunctionalProperty");
    if (ch.includes("INVERSE_FUNCTIONAL")) types.push("owl:InverseFunctionalProperty");
    const lines = [
      `ont:${prop.localName} a ${types.join(" , ")} ;`,
      `    rdfs:label "${escTtl(prop.labelZh)}"@zh ;`,
      `    rdfs:domain ${toPrefixedOrFull(prop.domainIri, namespaceIri)} ;`,
      `    rdfs:range ${toPrefixedOrFull(prop.rangeIri, namespaceIri)}${prop.subPropertyOf ? " ;" : " ."}`,
    ];
    if (prop.subPropertyOf) {
      lines.push(`    rdfs:subPropertyOf ${toPrefixedOrFull(prop.subPropertyOf, namespaceIri)} .`);
    }
    tboxBlocks.push(lines.join("\n"));
  }

  const ontologyTurtle = `${header}${tboxBlocks.join("\n\n")}\n`;
  const shaclTurtle = `${header}${shaclBlocks.join("\n\n")}\n`;
  const combinedTurtle = `${header}${[...tboxBlocks, ...shaclBlocks].join("\n\n")}\n`;

  return { ontologyTurtle, shaclTurtle, combinedTurtle };
}

export function renderProvenanceTurtle(params: {
  workspaceId: string;
  revisionId: string;
  actorName: string;
  generatedAtIso: string;
  documentDigests: Array<{ title: string; sha256: string }>;
}): string {
  const docTriples = params.documentDigests
    .map(
      (d, idx) =>
        `<urn:doc:${params.workspaceId}:${idx + 1}> a prov:Entity ;\n    rdfs:label "${d.title.replace(/"/g, '\\"')}"@zh ;\n    prov:value "sha256:${d.sha256}" .`
    )
    .join("\n\n");

  return [
    `@prefix prov: <http://www.w3.org/ns/prov#> .`,
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`,
    `@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .`,
    "",
    `<urn:ws:${params.workspaceId}:rev:${params.revisionId}> a prov:Entity ;`,
    `    prov:generatedAtTime "${params.generatedAtIso}"^^xsd:dateTime ;`,
    `    prov:wasAttributedTo <urn:actor:${encodeURIComponent(params.actorName)}> .`,
    "",
    docTriples,
    "",
  ].join("\n");
}

export function computeSemanticDiff(
  beforeClasses: OntologyClass[],
  beforeProps: OntologyProperty[],
  afterClasses: OntologyClass[],
  afterProps: OntologyProperty[]
): { backwardCompatible: boolean; items: SemanticDiffItem[] } {
  const items: SemanticDiffItem[] = [];
  let backwardCompatible = true;

  const beforeClassMap = new Map(beforeClasses.map((c) => [c.localName, c]));
  const afterClassMap = new Map(afterClasses.map((c) => [c.localName, c]));

  for (const [name, cls] of afterClassMap.entries()) {
    const prev = beforeClassMap.get(name);
    if (!prev) {
      items.push({ changeType: "ADDED", summary: `+ 新增本体类 ont:${name} (${cls.labelZh})` });
    } else if (prev.description !== cls.description) {
      items.push({ changeType: "MODIFIED", summary: `~ 修改注释 ont:${name} rdfs:comment "${cls.description}"@zh` });
    }
    const prevShaclIds = new Set(prev?.shaclConstraints.map((s) => s.id) ?? []);
    for (const sc of cls.shaclConstraints) {
      if (!prevShaclIds.has(sc.id)) {
        const detail = sc.minInclusive !== undefined ? `[sh:minInclusive ${sc.minInclusive}]` : `[sh:severity sh:${sc.severity}]`;
        items.push({
          changeType: "ADDED",
          summary: `+ 新增形状约束 ont:${name}Shape -> sh:path ont:${sc.propertyLocalName} ${detail}`,
        });
      }
    }
  }

  for (const name of beforeClassMap.keys()) {
    if (!afterClassMap.has(name)) {
      backwardCompatible = false;
      items.push({ changeType: "REMOVED", summary: `- 删除本体类 ont:${name} (破坏性变更)` });
    }
  }

  const beforePropMap = new Map(beforeProps.map((p) => [p.localName, p]));
  const afterPropMap = new Map(afterProps.map((p) => [p.localName, p]));

  for (const [name, prop] of afterPropMap.entries()) {
    if (!beforePropMap.has(name)) {
      items.push({
        changeType: "ADDED",
        summary: `+ 新增属性 ont:${name} (domain: ont:${prop.domainLocalName}, range: ${prop.rangeLocalName})`,
      });
    }
  }
  for (const name of beforePropMap.keys()) {
    if (!afterPropMap.has(name)) {
      backwardCompatible = false;
      items.push({ changeType: "REMOVED", summary: `- 删除属性 ont:${name} (破坏性变更)` });
    }
  }

  return { backwardCompatible, items };
}
