import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkLocalPostgresPrereqs,
  describeDatabaseUrl,
  isLocalDatabaseHost,
  LOCAL_SMOKE_ARTIFACTS,
  parsePsqlReadyOutput,
  postgresUrlToPsqlEnv,
  psqlCandidates,
  requireExpectedSmokeDatabaseIdentity,
  requireLocalDatabaseUrl,
} from "../local-postgres-prereqs.mjs";

async function withTempArtifacts(callback) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-smoke-prereqs-"));
  try {
    await Promise.all(
      LOCAL_SMOKE_ARTIFACTS.map(async (artifact) => {
        const artifactPath = path.join(repoRoot, artifact);
        await mkdir(path.dirname(artifactPath), { recursive: true });
        await writeFile(artifactPath, "");
      })
    );
    return await callback(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

describe("local PostgreSQL smoke prerequisites", () => {
  it("recognizes localhost PostgreSQL URLs", () => {
    expect(isLocalDatabaseHost("postgresql://u:p@localhost:5432/castles")).toBe(true);
    expect(isLocalDatabaseHost("postgresql://u:p@127.0.0.1:5432/castles")).toBe(true);
    expect(isLocalDatabaseHost("postgresql://u:p@cloud.ls314.com:5432/castles")).toBe(false);
  });

  it("refuses a non-local database unless explicitly allowed", () => {
    expect(() =>
      requireLocalDatabaseUrl("postgresql://u:p@cloud.ls314.com:5432/castles", {
        context: "test smoke",
      })
    ).toThrow(/non-local DATABASE_URL/);
    expect(
      requireLocalDatabaseUrl("postgresql://u:p@cloud.ls314.com:5432/castles", {
        allowNonLocal: true,
      }).isLocal
    ).toBe(false);
  });

  it("describes database URLs without leaking passwords", () => {
    expect(describeDatabaseUrl("postgresql://liam:secret@localhost:5432/castles")).toBe(
      "postgresql://<user>@localhost:5432/castles"
    );
  });

  it("converts DATABASE_URL to psql environment variables without argv secrets", () => {
    expect(postgresUrlToPsqlEnv("postgresql://liam:s%20ecret@[::1]:5440/castles?sslmode=require")).toEqual({
      PGDATABASE: "castles",
      PGHOST: "::1",
      PGPASSWORD: "s ecret",
      PGPORT: "5440",
      PGSSLMODE: "require",
      PGUSER: "liam",
    });
  });

  it("supports PGCLIENT_BIN as a PostgreSQL bin directory", () => {
    const candidates = psqlCandidates({
      PGCLIENT_BIN: "C:\\Program Files\\PostgreSQL\\18\\bin",
    });

    expect(candidates).toContain("C:\\Program Files\\PostgreSQL\\18\\bin");
    expect(candidates).toContain("C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe");
  });

  it("parses psql readiness output and requires the local smoke identity by default", () => {
    const identity = parsePsqlReadyOutput("castles_local\tcastles_local\t::1\t5432\t1\n");

    expect(identity).toEqual({
      database: "castles_local",
      ready: true,
      serverAddress: "::1",
      serverPort: "5432",
      user: "castles_local",
    });
    expect(() => requireExpectedSmokeDatabaseIdentity(identity)).not.toThrow();
    expect(() =>
      requireExpectedSmokeDatabaseIdentity({
        database: "liam_castles",
        ready: true,
        serverAddress: "127.0.0.1",
        serverPort: "5432",
        user: "liam_castles",
      })
    ).toThrow(/Local smoke checks require castles_local\/castles_local/);
  });

  it("checks built artifacts, psql availability, and database readiness", async () => {
    await withTempArtifacts(async (repoRoot) => {
      const result = await checkLocalPostgresPrereqs({
        repoRoot,
        env: {
          DATABASE_URL: "postgresql://castles_local:castles_local_dev@localhost:5432/castles_local",
        },
        resolvePsql: async () => "fake-psql",
        runReadinessCheck: async () => ({
          identity: {
            database: "castles_local",
            ready: true,
            serverAddress: "::1",
            serverPort: "5432",
            user: "castles_local",
          },
          ok: true,
          ready: true,
          stdout: "castles_local\tcastles_local\t::1\t5432\t1\n",
          stderr: "",
        }),
      });

      expect(result.database.description).toBe("postgresql://<user>@localhost:5432/castles_local");
      expect(result.psqlCommand).toBe("fake-psql");
    });
  });

  it("rejects localhost connections that resolve to an unexpected database identity", async () => {
    await withTempArtifacts(async (repoRoot) => {
      await expect(
        checkLocalPostgresPrereqs({
          repoRoot,
          env: {
            DATABASE_URL: "postgresql://liam_castles:secret@localhost:5432/liam_castles",
          },
          resolvePsql: async () => "fake-psql",
          runReadinessCheck: async () => ({
            identity: {
              database: "liam_castles",
              ready: true,
              serverAddress: "127.0.0.1",
              serverPort: "5432",
              user: "liam_castles",
            },
            ok: true,
            ready: true,
            stdout: "liam_castles\tliam_castles\t127.0.0.1\t5432\t1\n",
            stderr: "",
          }),
        })
      ).rejects.toThrow(/Local smoke checks require castles_local\/castles_local/);
    });
  });

  it("fails before psql when built artifacts are missing", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-smoke-prereqs-missing-"));
    try {
      await expect(
        checkLocalPostgresPrereqs({
          repoRoot,
          env: {
            DATABASE_URL: "postgresql://castles_local:castles_local_dev@localhost:5432/castles_local",
          },
          resolvePsql: async () => "fake-psql",
          runReadinessCheck: async () => ({
            identity: {
              database: "castles_local",
              ready: true,
              serverAddress: "::1",
              serverPort: "5432",
              user: "castles_local",
            },
            ok: true,
            ready: true,
            stdout: "castles_local\tcastles_local\t::1\t5432\t1\n",
            stderr: "",
          }),
        })
      ).rejects.toThrow(/Built artifacts were not found/);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
