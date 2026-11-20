import { describe, expect, it } from "vitest";
import {
  activeAboxGraphUri,
  evaluateShaclSparqlReport,
  inferImplicitSemanticRelations,
  parseRdfIntoOntologyEntities,
  RDF_NS,
  SemanticGraphStore,
  tboxGraphUri,
} from "./index.js";

describe("M3 Semantic Core: Multi-format RDF Import, OWL 2 EL Inference & SHACL-SPARQL", () => {
  const NS = "https://ontology.caict.cn/contract#";

  it("parses both RDF 1.1 Turtle and JSON-LD 1.1 with conflict detection", () => {
    const turtle = `
      @prefix ont: <${NS}> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

      ont:GuaranteeBond a owl:Class ;
        rdfs:label "履约保函"@zh ;
        rdfs:subClassOf ont:Contract .

      ont:backedByBond a owl:ObjectProperty ;
        rdfs:label "绑定保函"@zh ;
        rdfs:domain ont:Contract ;
        rdfs:range ont:GuaranteeBond .

      ont:BondShape a sh:NodeShape ;
        sh:targetClass ont:GuaranteeBond ;
        sh:property [ sh:path ont:bondAmount ; sh:datatype xsd:decimal ; sh:minInclusive 10000 ] .
    `;
    const parsedTtl = parseRdfIntoOntologyEntities(turtle, "bond.ttl", NS);
    expect(parsedTtl.classes).toHaveLength(1);
    expect(parsedTtl.classes[0].localName).toBe("GuaranteeBond");
    expect(parsedTtl.classes[0].shaclConstraints).toHaveLength(1);
    expect(parsedTtl.properties).toHaveLength(1);

    const jsonLd = JSON.stringify({
      "@context": { ont: NS, owl: RDF_NS.owl, rdfs: RDF_NS.rdfs },
      "@graph": [
        {
          "@id": "ont:SlaMetric",
          "@type": "owl:Class",
          "rdfs:label": { "@value": "服务等级指标", "@language": "zh" },
        },
      ],
    });
    const parsedLd = parseRdfIntoOntologyEntities(jsonLd, "sla.jsonld", NS, parsedTtl.classes);
    expect(parsedLd.formatLabel).toBe("JSON-LD 1.1");
    expect(parsedLd.classes[0].labelZh).toBe("服务等级指标");
  });

  it("infers OWL 2 EL property chains / inverse roles and generates W3C sh:ValidationReport", () => {
    const relations = inferImplicitSemanticRelations(
      [
        {
          iri: `${NS}Contract`,
          localName: "Contract",
          labelZh: "商务合同",
          labelEn: "Contract",
          description: "",
          roleKind: "master",
          subClassOf: `${NS}LegalAgreement`,
          positionX: 0,
          positionY: 0,
          instanceCount: 1,
          controlledActionCount: 0,
          properties: [],
          shaclConstraints: [],
          downstreamMappings: [],
          downstreamCapabilities: [],
        },
        {
          iri: `${NS}RenewalCase`,
          localName: "RenewalCase",
          labelZh: "续签单",
          labelEn: "RenewalCase",
          description: "",
          roleKind: "controlled_write",
          subClassOf: `${NS}Workflow`,
          positionX: 0,
          positionY: 0,
          instanceCount: 1,
          controlledActionCount: 0,
          properties: [],
          shaclConstraints: [],
          downstreamMappings: [],
          downstreamCapabilities: [],
        },
        {
          iri: `${NS}AccountOwner`,
          localName: "AccountOwner",
          labelZh: "负责人",
          labelEn: "Owner",
          description: "",
          roleKind: "actor",
          subClassOf: `${NS}Member`,
          positionX: 0,
          positionY: 0,
          instanceCount: 1,
          controlledActionCount: 0,
          properties: [],
          shaclConstraints: [],
          downstreamMappings: [],
          downstreamCapabilities: [],
        },
      ],
      [
        {
          iri: `${NS}triggersCase`,
          localName: "triggersCase",
          labelZh: "触发续签单",
          kind: "ObjectProperty",
          domainIri: `${NS}Contract`,
          domainLocalName: "Contract",
          rangeIri: `${NS}RenewalCase`,
          rangeLocalName: "ont:RenewalCase",
          characteristics: "",
          sensitiveMask: false,
        },
        {
          iri: `${NS}assignedOwner`,
          localName: "assignedOwner",
          labelZh: "指派审批人",
          kind: "ObjectProperty",
          domainIri: `${NS}RenewalCase`,
          domainLocalName: "RenewalCase",
          rangeIri: `${NS}AccountOwner`,
          rangeLocalName: "ont:AccountOwner",
          characteristics: "inverseOf managesCase",
          sensitiveMask: false,
        },
      ]
    );
    expect(relations.some((r) => r.reasoningRule === "PROPERTY_CHAIN" && r.sourceLocalName === "Contract" && r.targetLocalName === "AccountOwner")).toBe(true);
    expect(relations.some((r) => r.reasoningRule === "INVERSE_ROLE")).toBe(true);

    // Verify cross-entity SHACL-SPARQL detects orphaned high-value contract missing Customer
    const store = new SemanticGraphStore();
    store.loadTurtleIntoGraph(`@prefix ont: <${NS}> . @prefix owl: <${RDF_NS.owl}> . ont:Contract a owl:Class .`, tboxGraphUri("ws-test", "r1"));
    store.writeTriplesToGraph(
      [
        { subject: `${NS}inst/ORPHAN-1`, predicate: `${RDF_NS.rdf}type`, object: `${NS}Contract` },
        { subject: `${NS}inst/ORPHAN-1`, predicate: `${NS}contractNo`, object: "HT-ORPHAN-1", isLiteral: true },
        { subject: `${NS}inst/ORPHAN-1`, predicate: `${NS}totalAmount`, object: "5000000", isLiteral: true, datatypeIri: `${RDF_NS.xsd}decimal` },
      ],
      activeAboxGraphUri("ws-test"),
      true
    );

    const report = evaluateShaclSparqlReport(store, "ws-test", "r1", NS);
    expect(report.conforms).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.validationReportTurtle).toContain("sh:ValidationReport");
  });
});
