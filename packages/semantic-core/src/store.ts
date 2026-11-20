import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import oxigraph from "oxigraph";

export const RDF_NS = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  sh: "http://www.w3.org/ns/shacl#",
  prov: "http://www.w3.org/ns/prov#",
} as const;

export function tboxGraphUri(workspaceId: string, revisionId: string): string {
  return `urn:ws:${workspaceId}:rev:${revisionId}:tbox`;
}

export function shaclGraphUri(workspaceId: string, revisionId: string): string {
  return `urn:ws:${workspaceId}:rev:${revisionId}:shacl`;
}

export function activeAboxGraphUri(workspaceId: string): string {
  return `urn:ws:${workspaceId}:abox:active`;
}

export function activeProvGraphUri(workspaceId: string): string {
  return `urn:ws:${workspaceId}:prov:active`;
}

export interface TripleInput {
  subject: string;
  predicate: string;
  object: string;
  isLiteral?: boolean;
  datatypeIri?: string;
  language?: string;
}

export class SemanticGraphStore {
  public readonly store: oxigraph.Store;
  private readonly persistencePath?: string;

  constructor(persistencePath?: string) {
    this.store = new oxigraph.Store();
    this.persistencePath = persistencePath;
    if (persistencePath && existsSync(persistencePath)) {
      const content = readFileSync(persistencePath, "utf8");
      if (content.trim().length > 0) {
        this.store.load(content, { format: "application/n-quads" });
      }
    }
  }

  public persistToDisk(): void {
    if (!this.persistencePath) return;
    mkdirSync(dirname(this.persistencePath), { recursive: true });
    const nquads = this.store.dump({ format: "application/n-quads" });
    const tmpPath = `${this.persistencePath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, nquads, "utf8");
    renameSync(tmpPath, this.persistencePath);
  }

  public clearNamedGraph(graphUri: string): void {
    const graphNode = oxigraph.namedNode(graphUri);
    const existing = this.store.match(null, null, null, graphNode);
    for (const q of existing) {
      this.store.delete(q);
    }
  }

  public deleteSubjectsInGraph(subjectIris: Iterable<string>, graphUri: string): void {
    const graphNode = oxigraph.namedNode(graphUri);
    for (const sIri of subjectIris) {
      const existing = this.store.match(oxigraph.namedNode(sIri), null, null, graphNode);
      for (const q of existing) {
        this.store.delete(q);
      }
    }
  }

  public loadTurtleIntoGraph(turtle: string, graphUri: string, replace = true, persist = true): number {
    if (replace) {
      this.clearNamedGraph(graphUri);
    }
    const graphNode = oxigraph.namedNode(graphUri);
    this.store.load(turtle, {
      format: "text/turtle",
      to_graph_name: graphNode,
    });
    const count = this.store.match(null, null, null, graphNode).length;
    if (persist) {
      this.persistToDisk();
    }
    return count;
  }

  public writeTriplesToGraph(
    triples: TripleInput[],
    graphUri: string,
    replace = false,
    persist = true
  ): number {
    if (replace) {
      this.clearNamedGraph(graphUri);
    }
    const graphNode = oxigraph.namedNode(graphUri);
    for (const t of triples) {
      const s = oxigraph.namedNode(t.subject);
      const p = oxigraph.namedNode(t.predicate);
      const o = t.isLiteral
        ? t.language
          ? oxigraph.literal(t.object, t.language)
          : t.datatypeIri
            ? oxigraph.literal(t.object, oxigraph.namedNode(t.datatypeIri))
            : oxigraph.literal(t.object)
        : oxigraph.namedNode(t.object);
      this.store.add(oxigraph.quad(s, p, o, graphNode));
    }
    if (persist) {
      this.persistToDisk();
    }
    return triples.length;
  }

  public countQuadsInGraph(graphUri: string): number {
    return this.store.match(null, null, null, oxigraph.namedNode(graphUri)).length;
  }

  public countDistinctSubjectsInGraph(graphUri: string): number {
    const quads = this.store.match(null, null, null, oxigraph.namedNode(graphUri));
    const subjects = new Set<string>();
    for (const q of quads) {
      subjects.add(q.subject.value);
    }
    return subjects.size;
  }

  public computeCanonicalGraphHash(graphUris: string[]): { shortRev: string; sha256: string } {
    const lines: string[] = [];
    for (const uri of graphUris) {
      const quads = this.store.match(null, null, null, oxigraph.namedNode(uri));
      for (const q of quads) {
        const subjRepr = q.subject.termType === "BlankNode" ? "_:bnode" : `<${q.subject.value}>`;
        const objRepr =
          q.object.termType === "Literal"
            ? `"${q.object.value}"^^<${q.object.datatype.value}>@${q.object.language}`
            : q.object.termType === "BlankNode"
              ? "_:bnode"
              : `<${q.object.value}>`;
        lines.push(`${subjRepr} <${q.predicate.value}> ${objRepr} .`);
      }
    }
    lines.sort();
    const sha256 = createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
    return { shortRev: sha256.slice(0, 8), sha256 };
  }
}
