import { describe, expect, it } from "vitest";
import {
  analyzeGraphQLResponse,
  formatHeadersForDisplay,
  inferGqlOperationKind,
  inferOperationNameFromQuery,
  normalizeJsonBodyToOps,
  parseMultipartOperations,
  splitBatchedResponse,
} from "./parsers.mjs";

describe("inferGqlOperationKind", () => {
  it("detects mutation, subscription, and query keywords", () => {
    expect(inferGqlOperationKind(`  mutation Foo { ok } `)).toBe("mutation");
    expect(inferGqlOperationKind("subscription Sub { evt }")).toBe(
      "subscription",
    );
    expect(inferGqlOperationKind("query Baz { q }")).toBe("query");
  });
  it("treats anonymous shorthand as query", () => {
    expect(inferGqlOperationKind("{ hero { name } }")).toBe("query");
  });
  it("treats persisted placeholder as persisted", () => {
    expect(
      inferGqlOperationKind("(persisted — inline query not sent"),
    ).toBe("persisted");
  });
});
describe("inferOperationNameFromQuery", () => {
  it("reads named operation keyword", () => {
    expect(inferOperationNameFromQuery(`  query Foo { bar } `)).toBe("Foo");
  });
  it("returns anonymous without name", () => {
    expect(inferOperationNameFromQuery("{ field }")).toBe("(anonymous)");
  });
});

describe("normalizeJsonBodyToOps", () => {
  it("parses persisted query without inline query text", () => {
    const ops = normalizeJsonBodyToOps({
      operationName: "MyOp",
      variables: { id: "1" },
      extensions: { persistedQuery: { version: 1, sha256Hash: "abcd".repeat(8) } },
    });
    expect(ops).toHaveLength(1);
    expect(ops?.[0].kind).toBe("persisted");
    expect(ops?.[0].operationKind).toBe("persisted");
    expect(ops?.[0].operationName).toBe("MyOp");
    expect(ops?.[0].queryText).toContain("(persisted");
  });

  it("parses batched array bodies", () => {
    const ops = normalizeJsonBodyToOps([
      { query: `{ a }`, operationName: "A", variables: null },
      {
        query: "mutation B { b }",
        operationName: "B",
        variables: {},
      },
    ]);
    expect(ops?.length).toBe(2);
    expect(ops?.[0].batchSize).toBe(2);
    expect(ops?.[1].batchIndex).toBe(1);
    expect(ops?.[0].operationKind).toBe("query");
    expect(ops?.[1].operationKind).toBe("mutation");
  });
});

describe("parseMultipartOperations", () => {
  it("extracts operations part from multipart body", () => {
    const raw =
      '--x\r\nContent-Disposition: form-data; name="operations"\r\n\r\n{"query":"{x}","variables":{}}\r\n--x--\r\n';
    const mime = 'multipart/form-data; boundary=x';
    const ops = parseMultipartOperations(raw, mime);
    expect(ops?.length).toBe(1);
    expect(ops?.[0].queryText).toContain("{x}");
  });
});

describe("splitBatchedResponse", () => {
  it("splits array response matching batch size", () => {
    const body = JSON.stringify([{ data: { a: 1 } }, { errors: [{ message: "e" }] }]);
    const parts = splitBatchedResponse(body, 2);
    expect(parts).toHaveLength(2);
    expect(parts?.[1]).toContain("errors");
  });
});

describe("analyzeGraphQLResponse", () => {
  it("detects GraphQL errors array", () => {
    const r = analyzeGraphQLResponse(JSON.stringify({ errors: [{ message: "bad" }] }));
    expect(r.hasErrors).toBe(true);
    expect(r.errorsSummary).toContain("bad");
  });
});

describe("formatHeadersForDisplay", () => {
  it("sorts and joins header lines", () => {
    const s = formatHeadersForDisplay([
      { name: "B", value: "2" },
      { name: "A", value: "1" },
    ]);
    expect(s).toBe("A: 1\nB: 2");
  });
});
