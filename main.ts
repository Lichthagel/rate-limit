import { assert } from "@std/assert/assert";
import process from "node:process";

/**
 * A rate-limited function that will be executed at most once per `timeframe` (in milliseconds), queuing calls if necessary.
 */
export interface RateLimitedFunction<T extends Array<unknown>, R> {
  (...args: T): Promise<R>;

  /**
   * Clears all pending calls.
   */
  clear(): void;

  /**
   * Waits for all pending calls to complete.
   */
  flush(): Promise<void>;

  /**
   * Closes the rate-limited function, preventing further calls.
   */
  close(): void;

  /**
   * The number of pending calls.
   */
  readonly pending: number;
}

/**
 * Rate-limiting options.
 */
export interface RateLimitOptions {
  /**
   * The timeframe in milliseconds.
   */
  timeframe: number;
}

/**
 * Creates a rate-limited function that prevents the given `fn` from being called more than once per `timeframe` (in milliseconds).
 *
 * @example Usage
 * ```ts
 * import { rateLimit } from "./main.ts";
 * import { retry } from "@std/async/retry";
 * import { assert } from "@std/assert";
 *
 * let called = 0;
 * await using server = Deno.serve(
 *   { port: 0, onListen: () => null },
 *   () => new Response(`${called++}`),
 * );
 *
 * // A throttled function will be executed at most once during a specified ms timeframe
 * const timeframe = 1000;
 * const func = rateLimit<[string], void>(
 *   (url) => fetch(url).then((r) => r.body?.cancel()),
 *   { timeframe },
 * );
 *
 * const startTime = Date.now();
 *
 * for (let i = 0; i < 10; i++) {
 *   func(`http://localhost:${server.addr.port}/api`);
 * }
 *
 * await retry(() => assert(!(func.pending > 8)));
 *
 * const elapsedTime = Date.now() - startTime;
 * console.log("Function was called", called, "times in", elapsedTime, "ms");
 *
 * func.clear();
 * func.close();
 *
 * ```
 *
 * let called = 0;
 * await using
 *
 * @param fn The function to rate-limit
 * @param options The rate-limiting options
 * @returns The rate-limited function
 */
export function rateLimit<T extends Array<unknown>, R>(
  fn: (this: RateLimitedFunction<T, R>, ...args: T) => R | PromiseLike<R>,
  options: { timeframe: number },
): RateLimitedFunction<T, R> {
  let ready = true;
  const pending: (() => void)[] = [];
  let currentTimeout: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const run = (
    args: T,
    resolve: (value: R | PromiseLike<R>) => void,
    reject: (reason?: unknown) => void,
  ) =>
  () => {
    try {
      resolve(fn.call(rateLimited, ...args));
    } catch (error) {
      reject(error);
    }

    assert(currentTimeout == null);
    currentTimeout = setTimeout(() => {
      currentTimeout = null;
      if (pending.length > 0) {
        pending.shift()?.();
      } else {
        ready = true;
      }
    }, options.timeframe);
  };

  const rateLimited = ((...args: T): Promise<R> => {
    if (closed) {
      throw new Error("rate-limited function is closed");
    }

    if (ready) {
      ready = false;
      return new Promise<R>((resolve, reject) => {
        run(args, resolve, reject)();
      });
    } else {
      return new Promise<R>((resolve, reject) => {
        pending.push(run(args, resolve, reject));
      });
    }
  }) as RateLimitedFunction<T, R>;

  rateLimited.clear = () => {
    pending.splice(0, pending.length);
  };

  rateLimited.flush = async () => {
    if (!ready) {
      await new Promise<void>((resolve) => {
        pending.push(resolve);
      });
    }
  };

  rateLimited.close = () => {
    if (pending.length > 0) {
      throw new Error("rate-limited function has pending calls");
    }
    closed = true;
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }
    process.off("exit", rateLimited.close);
  };

  process.on("exit", rateLimited.close);

  Object.defineProperties(rateLimited, {
    pending: {
      get() {
        return pending.length;
      },
    },
  });

  return rateLimited;
}
