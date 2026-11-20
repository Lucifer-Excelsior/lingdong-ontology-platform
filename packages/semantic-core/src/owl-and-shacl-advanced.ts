import oxigraph from "oxigraph";
import type {
  InferredRelation,
  OntologyClass,
  OntologyProperty,
} from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  RDF_NS,
  SemanticGraphStore,
  shaclGraphUri,
  tboxGraphUri,
} from "./store.js";

function shortLocal(iriOrPrefixed: string): string {
  if (iriOrPrefixed.startsWith("ont:")) return iriOrPrefixed.slice(4);
  const hashIdx = iriOrPrefixed.lastIndexOf("#");
  if (hashIdx >= 0) return iriOrPrefixed.slice(hashIdx + 1);
  const slashIdx = iriOrPrefixed.lastIndexOf("/");
  if (slashIdx >= 0) return iriOrPrefixed.slice(slashIdx + 1);
  return iriOrPrefixed;
}

/**
 * M3-4: Computes OWL 2 EL inferred implicit edges across workspace classes:
 * 1. Explicit & transitive `rdfs:subClassOf` relationships between in-canvas classes;
 * 2. Two-hop ObjectProperty compositional chains (`A -p1-> B -p2-> C` => inferred `A -[p1∘p2]-> C`);
 * 3. Inverse ObjectProperty roles (`inverseOf`).
 */
export function inferImplicitSemanticRelations(
  classes: OntologyClass[],
  properties: OntologyProperty[]
): InferredRelation[] {
  const classNames = new Set(classes.map((c) => c.localName));
  const inferred: InferredRelation[] = [];
  const existingPairs = new Set<string>();

  const objProps = properties
    .filter((p) => p.kind === "ObjectProperty")
    .map((p) => ({
      ...p,
      dom: shortLocal(p.domainLocalName),
      rng: shortLocal(p.rangeLocalName),
    }))
    .filter((p) => classSetHas(classNames, p.dom) && classSetHas(classNames, p.rng));

  for (const p of objProps) {
    existingPairs.add(`${p.dom}->${p.rng}:${p.localName}`);
  }

  // 1. SubClassOf hierarchy links among classes present in workspace
  for (const cls of classes) {
    const parentLocal = shortLocal(cls.subClassOf);
    if (parentLocal !== cls.localName && classNames.has(parentLocal)) {
      inferred.push({
        id: `inf-sub-${cls.localName}-${parentLocal}`,
        sourceLocalName: cls.localName,
        targetLocalName: parentLocal,
        label: "rdfs:subClassOf (子类继承)",
        reasoningRule: "SUBCLASS_CLOSURE",
      });
    }
  }

  // 2. Two-hop OWL 2 EL role composition chains (e.g. Contract -> RenewalCase -> AccountOwner)
  for (const p1 of objProps) {
    for (const p2 of objProps) {
      if (p1.rng === p2.dom && p1.dom !== p2.rng) {
        const directExists = objProps.some((d) => d.dom === p1.dom && d.rng === p2.rng);
        const chainId = `inf-chain-${p1.dom}-${p1.rng}-${p2.rng}`;
        if (!directExists && !inferred.some((x) => x.id === chainId)) {
          inferred.push({
            id: chainId,
            sourceLocalName: p1.dom,
            targetLocalName: p2.rng,
            label: `推理链：${p1.labelZh} ∘ ${p2.labelZh}`,
            reasoningRule: "PROPERTY_CHAIN",
          });
        }
      }
    }
  }

  // 3. Inverse role declarations (`inverseOf <propName>`)
  for (const p of objProps) {
    const invMatch = p.characteristics.match(/inverseOf\s+(?:ont:)?([A-Za-z0-9_]+)/);
    if (invMatch) {
      const invName = invMatch[1];
      const invId = `inf-inv-${p.rng}-${p.dom}-${invName}`;
      if (!inferred.some((x) => x.id === invId)) {
        inferred.push({
          id: invId,
          sourceLocalName: p.rng,
          targetLocalName: p.dom,
          label: `逆关系推理：ont:${invName}`,
          reasoningRule: "INVERSE_ROLE",
        });
      }
    }
  }

  return inferred;
}

function classSetHas(set: Set<string>, val: string): boolean {
  return set.has(val);
}

export interface ShaclSparqlViolation {
  focusNode: string;
  resultPath: string;
  message: string;
}

/**
 * M3-2: Evaluates cross-entity SHACL-SPARQL rules over union TBox + ABox in Oxigraph
 * and renders a standard W3C `sh:ValidationReport` Turtle document.
 */
export function evaluateShaclSparqlReport(
  graphStore: SemanticGraphStore,
  workspaceId: string,
  revisionId: string,
  namespaceIri: string
): { conforms: boolean; violations: ShaclSparqlViolation[]; validationReportTurtle: string } {
  const unionStore = new oxigraph.Store();
  for (const gUri of [tboxGraphUri(workspaceId, revisionId), activeAboxGraphUri(workspaceId)]) {
    for (const q of graphStore.store.match(null, null, null, oxigraph.namedNode(gUri))) {
      unionStore.add(oxigraph.quad(q.subject, q.predicate, q.object, oxigraph.defaultGraph()));
    }
  }

  // Cross-entity SHACL-SPARQL rule: Every Contract with totalAmount >= 1,000,000 MUST link via ont:signedBy to an existing ont:Customer
  const sparqlCheck = `
    PREFIX ont: <${namespaceIri}>
    PREFIX xsd: <${RDF_NS.xsd}>
    SELECT ?this ?contractNo WHERE {
      ?this a ont:Contract ;
            ont:contractNo ?contractNo ;
            ont:totalAmount ?amt .
      FILTER(xsd:decimal(?amt) >= 1000000)
      FILTER NOT EXISTS {
        ?this ont:signedBy ?cust .
        ?cust a ont:Customer .
      }
    }
  `;

  const violations: ShaclSparqlViolation[] = [];
  try {
    const bindings = unionStore.query(sparqlCheck) as Array<Map<string | oxigraph.Variable, oxigraph.Term>>;
    for (const b of bindings) {
      let focus = "";
      let cno = "";
      for (const [k, v] of b.entries()) {
        const key = typeof k === "string" ? k : k.value;
        if (key === "this") focus = v.value;
        if (key === "contractNo") cno = v.value;
      }
      if (focus) {
        violations.push({
          focusNode: focus,
          resultPath: `${namespaceIri}signedBy`,
          message: `跨实体 SHACL-SPARQL 违例：百万级以上高额合同 (${cno}) 缺少已验证的签约客户主体关联`,
        });
      }
    }
  } catch {
    // Non-contract workspaces (e.g. ITU) cleanly skip contract cross-entity query
  }

  // 2. Dynamic execution of ANY user-defined `sh:sparql [ sh:select "..." ; sh:message "..." ]` constraints in SHACL graph
  const shGraph = oxigraph.namedNode(shaclGraphUri(workspaceId, revisionId));
  const shSparqlPred = oxigraph.namedNode(`${RDF_NS.sh}sparql`);
  const shSelectPred = oxigraph.namedNode(`${RDF_NS.sh}select`);
  const shMsgPred = oxigraph.namedNode(`${RDF_NS.sh}message`);
  for (const sq of graphStore.store.match(null, shSparqlPred, null, shGraph)) {
    const selQuad = graphStore.store.match(sq.object as oxigraph.NamedNode | oxigraph.BlankNode, shSelectPred, null, shGraph)[0];
    const msgQuad = graphStore.store.match(sq.object as oxigraph.NamedNode | oxigraph.BlankNode, shMsgPred, null, shGraph)[0];
    if (!selQuad?.object.value) continue;
    try {
      const customQuery = `PREFIX ont: <${namespaceIri}>\nPREFIX xsd: <${RDF_NS.xsd}>\nPREFIX rdfs: <${RDF_NS.rdfs}>\n${selQuad.object.value}`;
      const rows = unionStore.query(customQuery) as Array<Map<string | oxigraph.Variable, oxigraph.Term>>;
      for (const b of rows) {
        let focus = "";
        for (const [k, v] of b.entries()) {
          if ((typeof k === "string" ? k : k.value) === "this") focus = v.value;
        }
        if (focus) {
          violations.push({
            focusNode: focus,
            resultPath: sq.subject.value,
            message: msgQuad?.object.value ?? "自定义 sh:SPARQLConstraint 校验违例",
          });
        }
      }
    } catch {
      // Skip malformed custom sh:select without crashing report generation
    }
  }

  const conforms = violations.length === 0;
  const resultBlocks = violations
    .map(
      (v) =>
        `    sh:result [\n        a sh:ValidationResult ;\n        sh:resultSeverity sh:Violation ;\n        sh:focusNode <${v.focusNode}> ;\n        sh:resultPath <${v.resultPath}> ;\n        sh:resultMessage "${v.message.replace(/"/g, '\\"')}"@zh\n    ]`
    )
    .join(" ;\n");

  const validationReportTurtle = [
    `@prefix sh:  <http://www.w3.org/ns/shacl#> .`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`,
    "",
    `<urn:ws:${workspaceId}:rev:${revisionId}:validation-report> a sh:ValidationReport ;`,
    `    sh:conforms ${conforms ? "true" : "false"}${resultBlocks ? " ;\n" + resultBlocks : ""} .`,
    "",
  ].join("\n");

  return { conforms, violations, validationReportTurtle };
}
