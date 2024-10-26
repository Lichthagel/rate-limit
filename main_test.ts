import {
  assertArrayIncludes,
  assertEquals,
  assertGreaterOrEqual,
  assertLessOrEqual,
  assertStrictEquals,
} from "@std/assert";
import { rateLimit, type RateLimitedFunction } from "./main.ts";
import { delay } from "@std/async";
import { expect } from "@std/expect";

Deno.test("rateLimit() handles called", async () => {
  let called = 0;
  const t = rateLimit(() => called++, 100);
  assertEquals(t.pending, 0);
  t();
  t();
  t();
  assertLessOrEqual(called, 1);
  assertGreaterOrEqual(t.pending, 2);
  await delay(210);
  assertEquals(called, 3);
  assertEquals(t.pending, 0);
  t.clear();
});

Deno.test("rateLimit() handles clear", () => {
  let called = 0;
  const t = rateLimit(() => called++, 100);
  t();
  t();
  t();
  assertLessOrEqual(called, 1);
  assertGreaterOrEqual(t.pending, 2);
  t.clear();
  assertLessOrEqual(called, 1);
  assertEquals(t.pending, 0);
});

Deno.test("rateLimit() handles flush", async () => {
  let called = 0;
  let arg = "";
  const t = rateLimit((_arg: string) => {
    arg = _arg;
    called++;
  }, 100);
  t("foo");
  t("bar");
  t("baz");
  assertLessOrEqual(called, 1);
  assertGreaterOrEqual(t.pending, 2);
  assertArrayIncludes(["", "foo"], [arg]);
  await t.flush();
  assertEquals(called, 3);
  assertEquals(arg, "baz");
  assertEquals(t.pending, 0);
});

Deno.test("rateLimit() handles params and context", async () => {
  const params: Array<string | number> = [];
  const t: RateLimitedFunction<[string, number], void> = rateLimit(
    function (param1: string, param2: number) {
      params.push(param1);
      params.push(param2);
      assertStrictEquals(t, this);
    },
    100,
  );
  t("foo", 1);
  t("bar", 1);
  t("baz", 1);
  // @ts-expect-error Argument of type 'number' is not assignable to parameter of type 'string'.
  t(1, 1);
  assertLessOrEqual(params.length, 2);
  assertGreaterOrEqual(t.pending, 2);
  await delay(210);
  assertEquals(params, ["foo", 1, "bar", 1, "baz", 1]);
  assertEquals(t.pending, 1);
  t.clear();
});

Deno.test("rateLimit() handles close", () => {
  let called = 0;
  const t = rateLimit(() => called++, 100);
  t();
  t();
  t();
  expect(() => t.close()).toThrow();
  t.clear();
  expect(() => t.close()).not.toThrow();
  expect(() => t()).toThrow();
});
