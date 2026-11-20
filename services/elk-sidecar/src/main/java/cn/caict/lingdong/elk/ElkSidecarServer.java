package cn.caict.lingdong.elk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import org.semanticweb.elk.owlapi.ElkReasonerFactory;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.OWLClass;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.reasoner.InferenceType;
import org.semanticweb.owlapi.reasoner.OWLReasoner;

/**
 * Pure stateless ~120-line Java 21 microservice wrapping OWLAPI 5.5 + ELK 0.6.0
 * for polynomial-time OWL 2 EL classification and unsatisfiable-class checks.
 * Zero database access, zero file locks, zero business glue.
 */
public final class ElkSidecarServer {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8281"));
    HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
    server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    server.createContext("/health", ElkSidecarServer::handleHealth);
    server.createContext("/reason", ElkSidecarServer::handleReason);
    server.start();
    System.out.println("ELK OWL 2 EL Sidecar listening on :" + port);
  }

  private static void handleHealth(HttpExchange exchange) throws IOException {
    writeJson(exchange, 200, Map.of("status", "ok", "engine", "OWLAPI-5.5.1+ELK-0.6.0"));
  }

  private static void handleReason(HttpExchange exchange) throws IOException {
    if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
      writeJson(exchange, 405, Map.of("error", "Method Not Allowed"));
      return;
    }
    long started = System.nanoTime();
    try {
      JsonNode body = MAPPER.readTree(exchange.getRequestBody());
      String turtle = body.path("turtle").asText("");
      OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
      OWLOntology ontology = manager.loadOntologyFromOntologyDocument(
          new ByteArrayInputStream(turtle.getBytes(StandardCharsets.UTF_8)));

      OWLReasoner reasoner = new ElkReasonerFactory().createReasoner(ontology);
      try {
        reasoner.precomputeInferences(InferenceType.CLASS_HIERARCHY);
        boolean consistent = reasoner.isConsistent();
        List<String> unsatisfiable = new ArrayList<>();
        if (consistent) {
          for (OWLClass cls : reasoner.getUnsatisfiableClasses().getEntitiesMinusBottom()) {
            unsatisfiable.add(cls.getIRI().toString());
          }
        }
        double elapsedMs = (System.nanoTime() - started) / 1_000_000.0;
        writeJson(exchange, 200, Map.of(
            "consistent", consistent && unsatisfiable.isEmpty(),
            "unsatisfiableClasses", unsatisfiable,
            "axiomCount", ontology.getAxiomCount(),
            "elapsedMs", elapsedMs,
            "engine", "OWLAPI-5.5.1+ELK-0.6.0"
        ));
      } finally {
        reasoner.dispose();
      }
    } catch (Exception ex) {
      writeJson(exchange, 400, Map.of(
          "consistent", false,
          "error", ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage()
      ));
    }
  }

  private static void writeJson(HttpExchange exchange, int status, Object payload) throws IOException {
    byte[] bytes = MAPPER.writeValueAsBytes(payload);
    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(bytes);
    }
  }
}
