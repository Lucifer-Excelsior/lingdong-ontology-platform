import oxigraph from "oxigraph";
import type {
  OntologyClass,
  OntologyProperty,
  RdfImportConflict,
  ShaclConstraint,
} from "@lingdong/contracts";
import { RDF_NS } from "./store.js";

function extractLocalName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  if (hashIdx >= 0 && hashIdx < iri.length - 1) return iri.slice(hashIdx + 1);
  const slashIdx = iri.lastIndexOf("/");
  if (slashIdx >= 0 && slashIdx < iri.length - 1) return iri.slice(slashIdx + 1);
  return iri;
}

function expandCompactIri(term: string, ctx: Record<string, string>): string {
  if (term === "@type" || term === "a") return `${RDF_NS.rdf}type`;
  if (term.startsWith("http://") || term.startsWith("https://") || term.startsWith("urn:")) return term;
  const colonIdx = term.indexOf(":");
  if (colonIdx > 0) {
    const prefix = term.slice(0, colonIdx);
    const local = term.slice(colonIdx + 1);
    if (ctx[prefix]) return `${ctx[prefix]}${local}`;
  }
  return ctx["@vocab"] ? `${ctx["@vocab"]}${term}` : `https://ontology.caict.cn/imported#${term}`;
}

function convertJsonLdToNTriples(jsonText: string): string {
  const doc = JSON.parse(jsonText) as Record<string, unknown> | Array<Record<string, unknown>>;
  const ctx: Record<string, string> = {
    owl: RDF_NS.owl,
    rdfs: RDF_NS.rdfs,
    rdf: RDF_NS.rdf,
    xsd: RDF_NS.xsd,
    sh: RDF_NS.sh,
  };

  const rootObj = Array.isArray(doc) ? { "@graph": doc } : doc;
  if (rootObj["@context"] && typeof rootObj["@context"] === "object" && !Array.isArray(rootObj["@context"])) {
    for (const [k, v] of Object.entries(rootObj["@context"] as Record<string, unknown>)) {
      if (typeof v === "string") ctx[k] = v;
    }
  }

  const nodes = Array.isArray(rootObj["@graph"])
    ? (rootObj["@graph"] as Array<Record<string, unknown>>)
    : [rootObj];

  const lines: string[] = [];
  for (const node of nodes) {
    const rawId = typeof node["@id"] === "string" ? node["@id"] : "";
    if (!rawId) continue;
    const subj = `<${expandCompactIri(rawId, ctx)}>`;

    const rawTypes = node["@type"];
    const types = Array.isArray(rawTypes) ? rawTypes : rawTypes ? [rawTypes] : [];
    for (const t of types) {
      if (typeof t === "string") {
        lines.push(`${subj} <${RDF_NS.rdf}type> <${expandCompactIri(t, ctx)}> .`);
      }
    }

    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith("@")) continue;
      const pred = `<${expandCompactIri(key, ctx)}>`;
      const values = Array.isArray(val) ? val : [val];
      const escNt = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
      for (const item of values) {
        if (typeof item === "string") {
          lines.push(`${subj} ${pred} "${escNt(item)}" .`);
        } else if (item && typeof item === "object" && "@id" in item && typeof item["@id"] === "string") {
          lines.push(`${subj} ${pred} <${expandCompactIri(item["@id"], ctx)}> .`);
        } else if (item && typeof item === "object" && "@value" in item) {
          const lit = escNt(String((item as Record<string, unknown>)["@value"]));
          const lang = (item as Record<string, unknown>)["@language"];
          const dtype = (item as Record<string, unknown>)["@type"];
          const suffix = typeof lang === "string" ? `@${lang}` : typeof dtype === "string" ? `^^<${expandCompactIri(dtype, ctx)}>` : "";
          lines.push(`${subj} ${pred} "${lit}"${suffix} .`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function detectRdfFormat(filenameOrHint: string, content: string): {
  oxigraphFormat: "text/turtle" | "application/n-triples" | "application/n-quads" | "application/rdf+xml";
  label: string;
  isJsonLd: boolean;
} {
  const lower = filenameOrHint.toLowerCase();
  const trimmed = content.trim();
  if (lower.endsWith(".jsonld") || lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { oxigraphFormat: "application/n-triples", label: "JSON-LD 1.1", isJsonLd: true };
  }
  if (lower.endsWith(".rdf") || lower.endsWith(".owl") || lower.endsWith(".xml") || trimmed.startsWith("<?xml") || trimmed.startsWith("<rdf:RDF")) {
    return { oxigraphFormat: "application/rdf+xml", label: "RDF/XML", isJsonLd: false };
  }
  if (lower.endsWith(".nq")) {
    return { oxigraphFormat: "application/n-quads", label: "N-Quads", isJsonLd: false };
  }
  if (lower.endsWith(".nt")) {
    return { oxigraphFormat: "application/n-triples", label: "N-Triples", isJsonLd: false };
  }
  return { oxigraphFormat: "text/turtle", label: "RDF 1.1 Turtle", isJsonLd: false };
}

export function parseRdfIntoOntologyEntities(
  content: string,
  filenameOrHint: string,
  workspaceNamespaceIri: string,
  existingClasses: OntologyClass[] = [],
  existingProps: OntologyProperty[] = []
): {
  formatLabel: string;
  parsedTriples: number;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  conflicts: RdfImportConflict[];
} {
  const detected = detectRdfFormat(filenameOrHint, content);
  const payload = detected.isJsonLd ? convertJsonLdToNTriples(content) : content;

  const tempStore = new oxigraph.Store();
  tempStore.load(payload, { format: detected.oxigraphFormat });
  const parsedTriples = tempStore.size;

  const rdfType = oxigraph.namedNode(`${RDF_NS.rdf}type`);
  const rdfsLabel = oxigraph.namedNode(`${RDF_NS.rdfs}label`);
  const rdfsComment = oxigraph.namedNode(`${RDF_NS.rdfs}comment`);
  const rdfsSubClass = oxigraph.namedNode(`${RDF_NS.rdfs}subClassOf`);
  const owlDisjoint = oxigraph.namedNode(`${RDF_NS.owl}disjointWith`);
  const rdfsDomain = oxigraph.namedNode(`${RDF_NS.rdfs}domain`);
  const rdfsRange = oxigraph.namedNode(`${RDF_NS.rdfs}range`);

  const getLabel = (subj: oxigraph.Term, fallback: string, langPref?: string): string => {
    const matches = tempStore.match(subj, rdfsLabel, null);
    if (langPref) {
      const hit = matches.find((q) => q.object.termType === "Literal" && q.object.language === langPref);
      if (hit) return hit.object.value;
    }
    return matches[0]?.object.value ?? fallback;
  };

  const classNodes = [
    ...tempStore.match(null, rdfType, oxigraph.namedNode(`${RDF_NS.owl}Class`)),
    ...tempStore.match(null, rdfType, oxigraph.namedNode(`${RDF_NS.rdfs}Class`)),
  ];

  const seenClassIris = new Set<string>();
  const classes: OntologyClass[] = [];

  for (const q of classNodes) {
    if (q.subject.termType !== "NamedNode" || seenClassIris.has(q.subject.value)) continue;
    seenClassIris.add(q.subject.value);
    const iri = q.subject.value;
    const localName = extractLocalName(iri);
    const subClassIri = tempStore.match(q.subject, rdfsSubClass, null)[0]?.object.value ?? `${workspaceNamespaceIri}Entity`;
    const disjointIri = tempStore.match(q.subject, owlDisjoint, null)[0]?.object.value;
    const comment = tempStore.match(q.subject, rdfsComment, null)[0]?.object.value ?? `从外部 ${detected.label} 标准包导入的语义类`;

    // Extract SHACL NodeShape constraints targeting this class
    const shapeMatches = tempStore.match(null, oxigraph.namedNode(`${RDF_NS.sh}targetClass`), q.subject);
    const shaclConstraints: ShaclConstraint[] = [];
    for (const sm of shapeMatches) {
      const propQuads = tempStore.match(sm.subject, oxigraph.namedNode(`${RDF_NS.sh}property`), null);
      for (const pq of propQuads) {
        const pathTerm = tempStore.match(pq.object, oxigraph.namedNode(`${RDF_NS.sh}path`), null)[0]?.object;
        if (!pathTerm) continue;
        const propLocal = extractLocalName(pathTerm.value);
        const minCountVal = tempStore.match(pq.object, oxigraph.namedNode(`${RDF_NS.sh}minCount`), null)[0]?.object.value;
        const minIncVal = tempStore.match(pq.object, oxigraph.namedNode(`${RDF_NS.sh}minInclusive`), null)[0]?.object.value;
        const dtTerm = tempStore.match(pq.object, oxigraph.namedNode(`${RDF_NS.sh}datatype`), null)[0]?.object.value;
        shaclConstraints.push({
          id: `sh-imp-${localName}-${propLocal}`,
          propertyIri: pathTerm.value,
          propertyLocalName: propLocal,
          datatype: dtTerm ? `xsd:${extractLocalName(dtTerm)}` : undefined,
          minCount: minCountVal !== undefined ? Number(minCountVal) : undefined,
          minInclusive: minIncVal !== undefined ? Number(minIncVal) : undefined,
          severity: "Violation",
          description: `SHACL 形状导入约束 (${propLocal})`,
        });
      }
    }

    const idx = classes.length;
    classes.push({
      iri,
      localName,
      labelZh: getLabel(q.subject, localName, "zh"),
      labelEn: getLabel(q.subject, localName, "en"),
      description: comment,
      roleKind: "master",
      subClassOf: subClassIri,
      disjointWith: disjointIri,
      positionX: (idx % 3) * 268 + 48,
      positionY: Math.floor(idx / 3) * 196 + 72,
      instanceCount: 0,
      controlledActionCount: 0,
      properties: [],
      shaclConstraints,
      downstreamMappings: [],
      downstreamCapabilities: [],
    });
  }

  const objPropQuads = tempStore.match(null, rdfType, oxigraph.namedNode(`${RDF_NS.owl}ObjectProperty`));
  const dtPropQuads = tempStore.match(null, rdfType, oxigraph.namedNode(`${RDF_NS.owl}DatatypeProperty`));
  const properties: OntologyProperty[] = [];
  const seenPropIris = new Set<string>();

  for (const [quadList, kind] of [
    [objPropQuads, "ObjectProperty"],
    [dtPropQuads, "DatatypeProperty"],
  ] as const) {
    for (const q of quadList) {
      if (q.subject.termType !== "NamedNode" || seenPropIris.has(q.subject.value)) continue;
      seenPropIris.add(q.subject.value);
      const iri = q.subject.value;
      const localName = extractLocalName(iri);
      const domIri = tempStore.match(q.subject, rdfsDomain, null)[0]?.object.value ?? `${workspaceNamespaceIri}${classes[0]?.localName ?? "Contract"}`;
      const rngIri =
        tempStore.match(q.subject, rdfsRange, null)[0]?.object.value ??
        (kind === "ObjectProperty" ? `${workspaceNamespaceIri}Entity` : `${RDF_NS.xsd}string`);
      const domLocal = extractLocalName(domIri);
      const rngLocal = kind === "ObjectProperty" ? `ont:${extractLocalName(rngIri)}` : `xsd:${extractLocalName(rngIri)}`;

      const propObj: OntologyProperty = {
        iri,
        localName,
        labelZh: getLabel(q.subject, localName, "zh"),
        kind,
        domainIri: domIri,
        domainLocalName: domLocal,
        rangeIri: rngIri,
        rangeLocalName: rngLocal,
        characteristics: `导入自 ${detected.label}`,
        sensitiveMask: false,
      };
      properties.push(propObj);
      const ownerCls = classes.find((c) => c.localName === domLocal);
      if (ownerCls) ownerCls.properties.push(propObj);
    }
  }

  const conflicts: RdfImportConflict[] = [];
  const existingClassMap = new Map(existingClasses.map((c) => [c.localName, c]));
  for (const cls of classes) {
    const ex = existingClassMap.get(cls.localName);
    if (ex) {
      conflicts.push({
        localName: cls.localName,
        entityKind: "Class",
        conflictType: ex.iri === cls.iri ? "ALREADY_EXISTS" : "NAMESPACE_MISMATCH",
        detail: ex.iri === cls.iri ? `类 ont:${cls.localName} 已存在于当前修订，将自动跳过重复创建` : `标识符 ${cls.localName} 跨命名空间重名 (${cls.iri} vs ${ex.iri})`,
      });
    }
  }
  const existingPropMap = new Map(existingProps.map((p) => [p.localName, p]));
  for (const prop of properties) {
    const ex = existingPropMap.get(prop.localName);
    if (ex) {
      conflicts.push({
        localName: prop.localName,
        entityKind: "Property",
        conflictType: ex.iri === prop.iri ? "ALREADY_EXISTS" : "NAMESPACE_MISMATCH",
        detail: `属性 ${prop.localName} 已存在，将保持幂等对齐`,
      });
    }
  }

  return { formatLabel: detected.label, parsedTriples, classes, properties, conflicts };
}
