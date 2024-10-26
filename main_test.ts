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
  const t = rateLimit(() => called++, { timeframe: 100 });
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
  t.close();
});

Deno.test("rateLimit() handles clear", () => {
  let called = 0;
  const t = rateLimit(() => called++, { timeframe: 100 });
  t();
  t();
  t();
  assertLessOrEqual(called, 1);
  assertGreaterOrEqual(t.pending, 2);
  t.clear();
  assertLessOrEqual(called, 1);
  assertEquals(t.pending, 0);
  t.close();
});

Deno.test("rateLimit() handles flush", async () => {
  let called = 0;
  let arg = "";
  const t = rateLimit((_arg: string) => {
    arg = _arg;
    called++;
  }, { timeframe: 100 });
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
  t.close();
});

Deno.test("rateLimit() handles params and context", async () => {
  const params: Array<string | number> = [];
  const t: RateLimitedFunction<[string, number], void> = rateLimit(
    function (param1: string, param2: number) {
      params.push(param1);
      params.push(param2);
      assertStrictEquals(t, this);
    },
    { timeframe: 100 },
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
  t.close();
});

Deno.test("rateLimit() handles close", () => {
  let called = 0;
  const t = rateLimit(() => called++, { timeframe: 100 });
  t();
  t();
  t();
  expect(() => t.close()).toThrow();
  t.clear();
  expect(() => t.close()).not.toThrow();
  expect(() => t()).toThrow();
});

Deno.test("rateLimit() handles results", async () => {
  const t1 = rateLimit((x: number) => x * 2, { timeframe: 100 });
  const t2 = rateLimit((x: number) => Promise.resolve(x * 2), {
    timeframe: 100,
  });
  const results = await Promise.all([t1(1), t1(2), t1(3), t2(1), t2(2), t2(3)]);
  assertEquals(results, [2, 4, 6, 2, 4, 6]);
  t1.clear();
  t1.close();
  t2.clear();
  t2.close();
});

Deno.test("rateLimit() handles errors", async () => {
  const t1 = rateLimit(() => {
    throw new Error("foo");
  }, { timeframe: 100 });
  const t2 = rateLimit(() => Promise.reject(new Error("bar")), {
    timeframe: 100,
  });
  await expect(t1()).rejects.toThrow("foo");
  await expect(t2()).rejects.toThrow("bar");
  t1.clear();
  t1.close();
  t2.clear();
  t2.close();
});
