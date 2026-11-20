FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /build/target/elk-sidecar-3.0.0.jar /app/elk-sidecar.jar
EXPOSE 8281
ENTRYPOINT ["java", "-Xmx256m", "-jar", "/app/elk-sidecar.jar"]
