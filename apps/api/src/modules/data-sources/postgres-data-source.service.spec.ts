import { describe, expect, it } from "vitest";
import { validateDatabaseName, validateReadOnlyStatement } from "./postgres-data-source.service";

describe("validateReadOnlyStatement", () => {
  it("accepts SELECT and CTE read queries", () => {
    expect(validateReadOnlyStatement("SELECT id FROM customers;")).toBe("SELECT id FROM customers");
    expect(validateReadOnlyStatement("WITH active AS (SELECT id FROM customers) SELECT * FROM active")).toContain("WITH active");
  });

  it("rejects writes, multiple statements and row locks", () => {
    expect(() => validateReadOnlyStatement("DELETE FROM customers")).toThrow("仅允许 SELECT");
    expect(() => validateReadOnlyStatement("SELECT 1; SELECT 2")).toThrow("一条 SQL");
    expect(() => validateReadOnlyStatement("SELECT * FROM customers FOR UPDATE")).toThrow("行锁");
  });

  it("does not let comments hide a write keyword", () => {
    expect(() => validateReadOnlyStatement("/* read */ UPDATE customers SET name='x'")).toThrow("仅允许 SELECT");
  });
});

describe("validateDatabaseName", () => {
  it("allows safe PostgreSQL database identifiers", () => {
    expect(validateDatabaseName("customer_app_2026")).toBe("customer_app_2026");
  });

  it("rejects identifiers that could escape CREATE DATABASE", () => {
    expect(() => validateDatabaseName("Customer-App")).toThrow("数据库名");
    expect(() => validateDatabaseName('app"; DROP DATABASE flowmind; --')).toThrow("数据库名");
  });
});
