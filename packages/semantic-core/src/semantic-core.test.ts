import { describe, expect, it } from "vitest";
import type { OntologyClass, OntologyProperty } from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  computeSemanticDiff,
  evaluateRowAgainstClassShacl,
  executeGovernedSparql,
  RDF_NS,
  renderWorkspaceTurtle,
  runThreeLayerDiagnostics,
  SemanticGraphStore,
  shaclGraphUri,
  tboxGraphUri,
} from "./index.js";

const NS = "https://ontology.caict.cn/contract#";

const SAMPLE_CLASSES: OntologyClass[] = [
  {
    iri: `${NS}Contract`,
    localName: "Contract",
    labelZh: "商务合同",
    labelEn: "Commercial Contract",
    description: "商业协议主实体",
    roleKind: "master",
    subClassOf: `${NS}LegalAgreement`,
    disjointWith: `${NS}DraftProposal`,
    positionX: 320,
    positionY: 180,
    instanceCount: 2,
    controlledActionCount: 2,
    properties: [],
    shaclConstraints: [
      {
        id: "sc-expires",
        propertyIri: `${NS}signedAt`,
        propertyLocalName: "signedAt",
        datatype: "xsd:date",
        minCount: 1,
        lessThanOrEqualsProperty: "expiresAt",
        severity: "Violation",
        description: "签署日期必填且不得晚于到期日期",
      },
      {
        id: "sc-amount",
        propertyIri: `${NS}totalAmount`,
        propertyLocalName: "totalAmount",
        datatype: "xsd:decimal",
        minInclusive: 0,
        severity: "Violation",
        description: "合同总金额非负",
      },
    ],
    downstreamMappings: ["public.contracts"],
    downstreamCapabilities: ["FindExpiringContracts"],
  },
];

const SAMPLE_PROPS: OntologyProperty[] = [
  {
    iri: `${NS}contractNo`,
    localName: "contractNo",
    labelZh: "合同编号",
    kind: "DatatypeProperty",
    domainIri: `${NS}Contract`,
    domainLocalName: "Contract",
    rangeIri: `${RDF_NS.xsd}string`,
    rangeLocalName: "xsd:string",
    characteristics: "主键",
    sensitiveMask: false,
  },
  {
    iri: `${NS}totalAmount`,
    localName: "totalAmount",
    labelZh: "合同总金额",
    kind: "DatatypeProperty",
    domainIri: `${NS}Contract`,
    domainLocalName: "Contract",
    rangeIri: `${RDF_NS.xsd}decimal`,
    rangeLocalName: "xsd:decimal",
    characteristics: "敏感列脱敏",
    sensitiveMask: true,
  },
];

describe("SemanticGraphStore + SPARQL + SHACL Core", () => {
  it("loads TBox & ABox into Oxigraph, infers rdfs:subClassOf, and masks VIEWER columns", async () => {
    const store = new SemanticGraphStore();
    const { ontologyTurtle, shaclTurtle, combinedTurtle } = renderWorkspaceTurtle(NS, SAMPLE_CLASSES, SAMPLE_PROPS);

    store.loadTurtleIntoGraph(ontologyTurtle, tboxGraphUri("ws-1", "rev1"));
    store.loadTurtleIntoGraph(shaclTurtle, shaclGraphUri("ws-1", "rev1"));

    store.writeTriplesToGraph(
      [
        { subject: `${NS}inst/HT-01`, predicate: `${RDF_NS.rdf}type`, object: `${NS}Contract` },
        { subject: `${NS}inst/HT-01`, predicate: `${NS}contractNo`, object: "HT-2026-089", isLiteral: true },
        { subject: `${NS}inst/HT-01`, predicate: `${NS}signedAt`, object: "2025-12-01", isLiteral: true },
        { subject: `${NS}inst/HT-01`, predicate: `${NS}expiresAt`, object: "2026-11-30", isLiteral: true },
        {
          subject: `${NS}inst/HT-01`,
          predicate: `${NS}totalAmount`,
          object: "2850000",
          isLiteral: true,
          datatypeIri: `${RDF_NS.xsd}decimal`,
        },
      ],
      activeAboxGraphUri("ws-1"),
      true
    );

    // Query via superclass LegalAgreement to verify RDFS subClassOf entailment!
    const ownerRes = executeGovernedSparql(store, {
      workspaceId: "ws-1",
      revisionId: "rev1",
      namespaceIri: NS,
      callerRole: "OWNER",
      query: `SELECT ?contractNo ?totalAmount WHERE { ?c a ont:LegalAgreement ; ont:contractNo ?contractNo ; ont:totalAmount ?totalAmount . }`,
    });
    expect(ownerRes.rows).toHaveLength(1);
    expect(ownerRes.rows[0].totalAmount).toBe("2850000");

    // Query as VIEWER (even using aliased variable ?x!) to verify alias-proof column masking!
    const viewerRes = executeGovernedSparql(store, {
      workspaceId: "ws-1",
      revisionId: "rev1",
      namespaceIri: NS,
      callerRole: "VIEWER",
      query: `SELECT ?contractNo ?x WHERE { ?c a ont:Contract ; ont:contractNo ?contractNo ; ont:totalAmount ?x . }`,
    });
    expect(viewerRes.rows[0].x).toBe("***MASKED_BY_ROLE***");
    expect(viewerRes.maskedColumnsApplied).toContain("x");

    // Verify mutation blocking
    expect(() =>
      executeGovernedSparql(store, {
        workspaceId: "ws-1",
        revisionId: "rev1",
        namespaceIri: NS,
        callerRole: "OWNER",
        query: "DROP ALL",
      })
    ).toThrow(/拦截/);

    // Verify 3-layer diagnostics & deterministic hash
    const diag = await runThreeLayerDiagnostics(store, "ws-1", "rev1", SAMPLE_CLASSES, combinedTurtle);
    expect(diag.every((d) => d.status === "PASS")).toBe(true);

    const hashA = store.computeCanonicalGraphHash([tboxGraphUri("ws-1", "rev1"), shaclGraphUri("ws-1", "rev1")]);
    const hashB = store.computeCanonicalGraphHash([tboxGraphUri("ws-1", "rev1"), shaclGraphUri("ws-1", "rev1")]);
    expect(hashA.sha256).toBe(hashB.sha256);
    expect(hashA.shortRev).toHaveLength(8);
  });

  it("quarantines dirty rows violating SHACL date ordering or minInclusive", () => {
    const cls = SAMPLE_CLASSES[0];
    const valid = evaluateRowAgainstClassShacl(cls, "HT-01", "public.contracts", {
      signedAt: "2026-01-10",
      expiresAt: "2026-12-01",
      totalAmount: 1200000,
    });
    expect(valid).toBeNull();

    const badDate = evaluateRowAgainstClassShacl(cls, "HT-BAD-1", "public.contracts", {
      signedAt: "2026-10-01",
      expiresAt: "2026-05-01",
      totalAmount: 500000,
    });
    expect(badDate).not.toBeNull();
    expect(badDate?.reason).toContain("早于签署日");

    const diff = computeSemanticDiff(SAMPLE_CLASSES, [], SAMPLE_CLASSES, SAMPLE_PROPS);
    expect(diff.backwardCompatible).toBe(true);
    expect(diff.items.length).toBe(2);
  });
});
