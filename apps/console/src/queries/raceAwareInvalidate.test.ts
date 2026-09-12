import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { deferred } from "../test/deferred.js";
import { raceAwareInvalidate } from "./raceAwareInvalidate.js";

describe("invalidating a query that may be mid-fetch", () => {
  it("invalidates immediately when nothing is in flight", () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    raceAwareInvalidate(queryClient, ["lights", "detail", "l1"]);

    expect(spy).toHaveBeenCalledWith({
      queryKey: ["lights", "detail", "l1"],
      exact: true,
    });
  });

  it("waits for an in-flight fetch to settle rather than assuming its response reflects the event", async () => {
    const queryClient = new QueryClient();
    const key = ["lights", "detail", "l1"];
    const first = deferred<string>();

    const fetchPromise = queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => first.promise,
    });

    const spy = vi.spyOn(queryClient, "invalidateQueries");
    raceAwareInvalidate(queryClient, key);

    // Not yet: the fetch under way may have started before this event and
    // cannot be assumed to include it.
    expect(spy).not.toHaveBeenCalled();

    first.resolve("first value");
    await fetchPromise;

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: key, exact: true });
    });
  });

  it("does not stack a second follow-up when invalidated twice during the same in-flight fetch", async () => {
    const queryClient = new QueryClient();
    const key = ["lights", "detail", "l1"];
    const first = deferred<string>();
    const fetchPromise = queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => first.promise,
    });

    const spy = vi.spyOn(queryClient, "invalidateQueries");
    raceAwareInvalidate(queryClient, key);
    raceAwareInvalidate(queryClient, key);

    first.resolve("first value");
    await fetchPromise;

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it("invalidates again for a later event once a prior follow-up has already resolved", async () => {
    const queryClient = new QueryClient();
    const key = ["lights", "detail", "l1"];
    const first = deferred<string>();
    const fetchPromise = queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => first.promise,
    });

    const spy = vi.spyOn(queryClient, "invalidateQueries");
    raceAwareInvalidate(queryClient, key);
    first.resolve("first value");
    await fetchPromise;

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });

    raceAwareInvalidate(queryClient, key);

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("invalidating a prefix (exact: false) covering more than one query", () => {
  it("invalidates immediately when nothing under the prefix is fetching", () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    raceAwareInvalidate(queryClient, ["lights"], { exact: false });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["lights"], exact: false });
  });

  it("waits for every currently-fetching match under the prefix to settle before invalidating", async () => {
    const queryClient = new QueryClient();
    const list = deferred<string>();
    const detail = deferred<string>();

    const listFetch = queryClient.fetchQuery({
      queryKey: ["lights", "list"],
      queryFn: () => list.promise,
    });
    const detailFetch = queryClient.fetchQuery({
      queryKey: ["lights", "detail", "l1"],
      queryFn: () => detail.promise,
    });

    const spy = vi.spyOn(queryClient, "invalidateQueries");
    raceAwareInvalidate(queryClient, ["lights"], { exact: false });

    expect(spy).not.toHaveBeenCalled();

    list.resolve("list value");
    await listFetch;

    // One of the two matches settled, but the other — the detail read — may
    // still have started before whatever triggered this and so is not
    // enough on its own.
    expect(spy).not.toHaveBeenCalled();

    detail.resolve("detail value");
    await detailFetch;

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ["lights"], exact: false });
    });
  });
});
