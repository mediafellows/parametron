/**
 * @jest-environment jsdom
 */
import * as queryString from './queryString';
import { Parametron, createParametron } from "./Parametron";

// ---------- helpers ----------

const ok = (over: any = {}): any => ({
  objects: [],
  aggregations: {},
  pagination: { total_count: 0, total_pages: 0 },
  ...over,
});

const deferred = () => {
  let resolve!: (v: any) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<any>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeExecutor = (result: any = ok()) =>
  jest.fn().mockResolvedValue(result);

const make = (executor = makeExecutor(), extra: any = {}) =>
  new Parametron({ executor, ...extra });

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

// ---------- Parametron: initial state ----------

describe("Parametron / initial state", () => {
  it("has default params, empty filters and empty results", () => {
    const p = make();

    expect(p.data).toEqual({
      reqId: 0,
      running: false,
      filters: [],
      persistentFilters: [],
      totalCount: 0,
      totalPages: 0,
      objects: [],
      aggregations: {},
      params: { page: 1, per: 24, sort: "created_at", order: "desc" },
    });
  });

  it("does not share state between instances", () => {
    const a = make();
    const b = make();

    a.setParams({ per: 100 });
    a.setFilter("x", "eq", 1);

    expect(b.data.params.per).toBe(24);
    expect(b.data.filters).toEqual([]);
  });
});

// ---------- filters ----------

describe("Parametron / setFilter", () => {
  it("adds a filter and resets page to 1", () => {
    const p = make();
    p.setParams({ page: 5 });

    p.setFilter("genre", "eq", "drama");

    expect(p.data.filters).toEqual([["genre", "eq", "drama"]]);
    expect(p.data.params.page).toBe(1);
  });

  it("omits null/undefined values", () => {
    const p = make();

    p.setFilter("title", "exist");
    p.setFilter("a", "eq", null);

    expect(p.data.filters).toEqual([
      ["title", "exist"],
      ["a", "eq"],
    ]);
  });

  it("keeps falsy but defined values (0, false)", () => {
    const p = make();

    p.setFilter("count", "eq", 0);
    p.setFilter("flag", "eq", false);

    expect(p.data.filters).toEqual([
      ["count", "eq", 0],
      ["flag", "eq", false],
    ]);
  });

  it("supports two values (range)", () => {
    const p = make();
    p.setFilter("year", "range", 1900, 2008);
    expect(p.data.filters).toEqual([["year", "range", 1900, 2008]]);
  });

  describe("replaces conflicting filters of the same attribute", () => {
    it("q: replaces previous search on '_'", () => {
      const p = make();
      p.setFilter("_", "q", "foo");
      p.setFilter("_", "q", "bar");
      expect(p.data.filters).toEqual([["_", "q", "bar"]]);
    });

    it("match: replaces only 'match'", () => {
      const p = make();
      p.setFilter("title", "match", "a");
      p.setFilter("title", "eq", "b");
      p.setFilter("title", "match", "c");
      expect(p.data.filters).toEqual([
        ["title", "eq", "b"],
        ["title", "match", "c"],
      ]);
    });

    it("eq / ne replace each other", () => {
      const p = make();
      p.setFilter("a", "eq", 1);
      p.setFilter("a", "ne", 2);
      expect(p.data.filters).toEqual([["a", "ne", 2]]);

      p.setFilter("a", "eq", 3);
      expect(p.data.filters).toEqual([["a", "eq", 3]]);
    });

    it("range / in / not_in replace each other", () => {
      const p = make();
      p.setFilter("a", "range", 1, 2);
      p.setFilter("a", "in", [1, 2]);
      expect(p.data.filters).toEqual([["a", "in", [1, 2]]]);

      p.setFilter("a", "not_in", [3]);
      expect(p.data.filters).toEqual([["a", "not_in", [3]]]);

      p.setFilter("a", "range", 5, 6);
      expect(p.data.filters).toEqual([["a", "range", 5, 6]]);
    });

    it("exist / not_exist replace each other", () => {
      const p = make();
      p.setFilter("a", "exist");
      p.setFilter("a", "not_exist");
      expect(p.data.filters).toEqual([["a", "not_exist"]]);
    });

    it("gt replaces previous gt", () => {
      const p = make();
      p.setFilter("a", "gt", 1);
      p.setFilter("a", "gt", 2);
      expect(p.data.filters).toEqual([["a", "gt", 2]]);
    });

    it("does not touch filters of other attributes", () => {
      const p = make();
      p.setFilter("a", "eq", 1);
      p.setFilter("b", "eq", 2);
      expect(p.data.filters).toEqual([
        ["a", "eq", 1],
        ["b", "eq", 2],
      ]);
    });
  });
});

describe("Parametron / dropFilters", () => {
  const seeded = () => {
    const p = make();
    p.setFilter("a", "eq", 1);
    p.setFilter("a", "range", 1, 5);
    p.setFilter("b", "eq", 2);
    p.setParams({ page: 3 });
    return p;
  };

  it("drops all filters without arguments", () => {
    const p = seeded();
    p.dropFilters();
    expect(p.data.filters).toEqual([]);
  });

  it("drops by attribute", () => {
    const p = seeded();
    p.dropFilters("a");
    expect(p.data.filters).toEqual([["b", "eq", 2]]);
  });

  it("drops by method only", () => {
    const p = seeded();
    p.dropFilters(undefined, "eq");
    expect(p.data.filters).toEqual([["a", "range", 1, 5]]);
  });

  it("drops by attribute + method", () => {
    const p = seeded();
    p.dropFilters("a", "eq");
    expect(p.data.filters).toEqual([
      ["a", "range", 1, 5],
      ["b", "eq", 2],
    ]);
  });

  it("resets page to 1", () => {
    const p = seeded();
    p.setParams({ page: 3 });
    p.dropFilters("a");
    expect(p.data.params.page).toBe(1);
  });
});

describe("Parametron / getFilters, getFilterValues, pristine", () => {
  it("getFilters returns matching filters", () => {
    const p = make();
    p.setFilter("a", "eq", 1);
    p.setFilter("b", "in", [1]);

    expect(p.getFilters()).toHaveLength(2);
    expect(p.getFilters("a")).toEqual([["a", "eq", 1]]);
    expect(p.getFilters(undefined, "in")).toEqual([["b", "in", [1]]]);
    expect(p.getFilters("a", "in")).toEqual([]);
  });

  it("getFilterValues returns a single value as scalar", () => {
    const p = make();
    p.setFilter("_", "q", "Foo");
    expect(p.getFilterValues("_", "q")).toBe("Foo");
  });

  it("getFilterValues returns an array for multiple values", () => {
    const p = make();
    p.setFilter("year", "range", 1900, 2008);
    expect(p.getFilterValues("year", "range")).toEqual([1900, 2008]);
  });

  it("getFilterValues returns undefined if nothing matches", () => {
    expect(make().getFilterValues("x", "eq")).toBeUndefined();
  });

  it("pristine is true without filters and false with them", () => {
    const p = make();
    expect(p.pristine()).toBe(true);
    p.setFilter("a", "eq", 1);
    expect(p.pristine()).toBe(false);
    p.dropFilters();
    expect(p.pristine()).toBe(true);
  });

  it("pristine ignores persistent filters", () => {
    const p = make();
    p.setPersistentFilter("a", "eq", 1);
    expect(p.pristine()).toBe(true);
  });
});

describe("Parametron / setPersistentFilter", () => {
  it("adds persistent filters that survive dropFilters", () => {
    const p = make();
    p.setPersistentFilter("kind", "eq", "movie");
    p.setFilter("a", "eq", 1);

    p.dropFilters();

    expect(p.data.persistentFilters).toEqual([["kind", "eq", "movie"]]);
    expect(p.data.filters).toEqual([]);
  });

  it("does not replace existing persistent filters", () => {
    const p = make();
    p.setPersistentFilter("a", "eq", 1);
    p.setPersistentFilter("a", "eq", 2);
    expect(p.data.persistentFilters).toHaveLength(2);
  });
});

// ---------- params ----------

describe("Parametron / params", () => {
  it("setParams merges with existing params and returns them", () => {
    const p = make();
    const result = p.setParams({ per: 50, custom: "x" });

    expect(result).toEqual({
      page: 1,
      per: 50,
      sort: "created_at",
      order: "desc",
      custom: "x",
    });
    expect(p.data.params).toBe(result);
  });

  it("setParams removes null / undefined values", () => {
    const p = make();
    p.setParams({ sort: null, order: null });

    expect(p.data.params).toEqual({ page: 1, per: 24 });
  });

  it("dropParams removes the given keys", () => {
    const p = make();
    p.setParams({ foo: 1, bar: 2 });

    p.dropParams("foo", "per");

    expect(p.data.params).not.toHaveProperty("foo");
    expect(p.data.params).not.toHaveProperty("per");
    expect(p.data.params).toHaveProperty("bar", 2);
  });
});

// ---------- fixed order ----------

describe("Parametron / setFixedOrder", () => {
  it("resets sorting, page and sets per=250", () => {
    const p = make();
    p.setParams({ page: 4 });

    p.setFixedOrder([3, 1, 2]);

    expect(p.data.params).toEqual({ page: 1, per: 250 });
  });

  it("sorts fetched objects by the given id order", async () => {
    const executor = makeExecutor(
      ok({ objects: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    );
    const p = make(executor);
    p.setFixedOrder([3, 1, 2]);

    await p.fire();

    expect(p.data.objects.map((o) => o.id)).toEqual([3, 1, 2]);
  });

  it("is kept when other params change afterwards", async () => {
    const executor = makeExecutor(ok({ objects: [{ id: 1 }, { id: 2 }] }));
    const p = make(executor);
    p.setFixedOrder([2, 1]);
    p.setParams({ page: 1 });

    await p.fire();

    expect(p.data.objects.map((o) => o.id)).toEqual([2, 1]);
  });

  it("is reset when new sorting is set", async () => {
    const executor = makeExecutor(ok({ objects: [{ id: 1 }, { id: 2 }] }));
    const p = make(executor);
    p.setFixedOrder([2, 1]);
    p.setParams({ sort: "title", order: "asc" });

    await p.fire();

    expect(p.data.objects.map((o) => o.id)).toEqual([1, 2]);
  });
});

// ---------- prepare / fire ----------

describe("Parametron / prepare", () => {
  it("marks as running, bumps reqId and clears results", async () => {
    const p = make(makeExecutor(ok({ objects: [{ id: 1 }], aggregations: { a: 1 } })));
    await p.fire();

    p.prepare();

    expect(p.data.running).toBe(true);
    expect(p.data.reqId).toBe(1);
    expect(p.data.objects).toEqual([]);
    expect(p.data.aggregations).toEqual({});
    expect(p.data.totalCount).toBe(0);
    expect(p.data.totalPages).toBe(0);
  });
});

describe("Parametron / fire", () => {
  it("calls executor with body, params and schema", async () => {
    const executor = makeExecutor();
    const p = make(executor, { stats: "count_by_genre", schema: "movies" });
    p.setPersistentFilter("kind", "eq", "movie");
    p.setFilter("a", "eq", 1);

    await p.fire();

    expect(executor).toHaveBeenCalledTimes(1);
    const arg = executor.mock.calls[0][0];
    expect(arg.schema).toBe("movies");
    expect(arg.params).toBe(p.data.params);
    expect(arg.body).toEqual({
      page: 1,
      per: 24,
      sort: "created_at",
      order: "desc",
      search: {
        filters: [
          ["kind", "eq", "movie"],
          ["a", "eq", 1],
        ],
      },
      stats: "count_by_genre",
    });
  });

  it("stores results and pagination", async () => {
    const executor = makeExecutor(
      ok({
        objects: [{ id: 1 }],
        aggregations: { count_by_genre: [1, 2] },
        pagination: { total_count: 42, total_pages: 2 },
      })
    );
    const p = make(executor);

    const data = await p.fire();

    expect(data).toBe(p.data);
    expect(p.data).toMatchObject({
      running: false,
      objects: [{ id: 1 }],
      aggregations: { count_by_genre: [1, 2] },
      totalCount: 42,
      totalPages: 2,
    });
  });

  it("falls back to 0 if pagination is missing", async () => {
    const p = make(makeExecutor({ objects: [], aggregations: {} }));
    await p.fire();
    expect(p.data.totalCount).toBe(0);
    expect(p.data.totalPages).toBe(0);
  });

  it("resets running and rejects if executor fails", async () => {
    const error = new Error("boom");
    const p = make(jest.fn().mockRejectedValue(error));
    p.prepare();

    await expect(p.fire()).rejects.toBe(error);
    expect(p.data.running).toBe(false);
  });

  it("rejects with AbortedExecution when superseded by a newer fire", async () => {
    const first = deferred();
    const second = deferred();
    const executor = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const p = make(executor);

    const r1 = p.fire();
    const r2 = p.fire();

    first.resolve(ok({ objects: [{ id: "old" }] }));
    second.resolve(ok({ objects: [{ id: "new" }] }));

    await expect(r1).rejects.toThrow("AbortedExecution");
    await r2;
    expect(p.data.objects).toEqual([{ id: "new" }]);
  });
});

// ---------- serialization ----------

describe("Parametron / serialize & deserialize", () => {
  it("round-trips params and filters", () => {
    const p = make();
    p.setParams({ per: 10 });
    p.setFilter("a", "eq", 1);
    p.setPersistentFilter("b", "in", [1, 2]);

    const restored = p.deserialize(p.serialize());

    expect(restored).toEqual({
      params: p.data.params,
      filters: [["a", "eq", 1]],
      persistentFilters: [["b", "in", [1, 2]]],
    });
  });

  it("serializes to a base64 JSON string", () => {
    const p = make();
    const json = JSON.parse(atob(p.serialize()));
    expect(Object.keys(json).sort()).toEqual(["a", "b", "c"]);
  });

  it("returns {} for invalid input", () => {
    expect(make().deserialize("%%% not base64 %%%")).toEqual({});
    expect(make().deserialize(btoa("not json"))).toEqual({});
  });

  it("skips missing keys", () => {
    const input = btoa(JSON.stringify({ b: [["a", "eq", 1]] }));
    expect(make().deserialize(input)).toEqual({ filters: [["a", "eq", 1]] });
  });
});

// ---------- createParametron / public API ----------

describe("createParametron", () => {

  it("does not fail when init is explicitly null", () => {
  expect(() =>
    createParametron({ executor: makeExecutor(), init: null as any })
  ).not.toThrow();
});


  it("returns data, opts and api", () => {
    const executor = makeExecutor();
    const p = createParametron({ executor });

    expect(p.data.params.per).toBe(24);
    expect(p.opts.executor).toBeDefined();
    expect(typeof p.api.fire).toBe("function");
  });

  it("calls init with the Parametron instance", () => {
    const init = jest.fn();
    createParametron({ executor: makeExecutor(), init });
    expect(init).toHaveBeenCalledWith(expect.any(Parametron));
  });

  it("chainable api functions return the api", () => {
    const { api } = createParametron({ executor: makeExecutor() });

    expect(api.setFilter("a", "eq", 1)).toBe(api);
    expect(api.setPersistentFilter("b", "eq", 2)).toBe(api);
    expect(api.setParams({ per: 5 })).toBe(api);
    expect(api.setFixedOrder([1, 2])).toBe(api);
    expect(api.dropParams("x")).toBe(api);
    expect(api.dropFilters()).toBe(api);
  });

  it("getter api functions return values", () => {
    const { api } = createParametron({ executor: makeExecutor() });

    expect(api.pristine()).toBe(true);
    api.setFilter("a", "eq", 1);
    expect(api.pristine()).toBe(false);
    expect(api.getFilters("a")).toEqual([["a", "eq", 1]]);
    expect(api.getFilterValues("a", "eq")).toBe(1);
    expect(api.getAggregations("genre")).toEqual([]);
  });

  it("api changes are reflected in the returned data object", () => {
    const { api, data } = createParametron({ executor: makeExecutor() });
    api.setFilter("a", "eq", 1);
    expect(data.filters).toEqual([["a", "eq", 1]]);
  });

  describe("api.fire", () => {
    it("calls update before (running) and after (finished)", async () => {
      const states: any[] = [];
      const update = jest.fn((d) =>
        states.push({ running: d.running, reqId: d.reqId })
      );
      const { api } = createParametron({
        executor: makeExecutor(),
        update,
      });

      await api.fire();

      expect(update).toHaveBeenCalledTimes(2);
      expect(states).toEqual([
        { running: true, reqId: 1 },
        { running: false, reqId: 1 },
      ]);
    });

    it("resolves with data including aggregations", async () => {
      const { api } = createParametron({
        executor: makeExecutor(
          ok({
            objects: [{ id: 1 }],
            aggregations: { count_by_genre: ["drama"] },
          })
        ),
      });

      const data = await api.fire();

      expect(data.objects).toEqual([{ id: 1 }]);
      expect(api.getAggregations("genre")).toEqual(["drama"]);
    });

    it("rethrows executor errors", async () => {
      const error = new Error("fail");
      const { api } = createParametron({
        executor: jest.fn().mockRejectedValue(error),
      });

      await expect(api.fire()).rejects.toBe(error);
    });

    it("on aborted execution resolves with current data and skips final update", async () => {
      const first = deferred();
      const second = deferred();
      const executor = jest
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const update = jest.fn();
      const { api } = createParametron({ executor, update });

      const r1 = api.fire();
      const r2 = api.fire();
      first.resolve(ok());
      second.resolve(ok({ objects: [{ id: 1 }] }));

      await expect(r1).resolves.toBeDefined();
      await r2;

      expect(update).toHaveBeenCalledTimes(3);
    });
  });

  describe("serializeToURL", () => {
    it("writes state to ?p= after fire", async () => {
      const { api } = createParametron({
        executor: makeExecutor(),
        serializeToURL: true,
      });
      api.setFilter("a", "eq", 1);

      await api.fire();

      const { p } = queryString.parse(window.location.search);
      expect(p).toBeTruthy();
      const state = make().deserialize(p as string);
      expect(state).toMatchObject({ filters: [["a", "eq", 1]] });
    });

    it("preserves other query params", async () => {
      window.history.replaceState({}, "", "/?foo=bar");
      const { api } = createParametron({
        executor: makeExecutor(),
        serializeToURL: true,
      });

      await api.fire();

      const query = queryString.parse(window.location.search);
      expect(query.foo).toBe("bar");
      expect(query.p).toBeDefined();
    });

    it("does not touch the URL when disabled", async () => {
      const { api } = createParametron({ executor: makeExecutor() });
      await api.fire();
      expect(window.location.search).toBe("");
    });

    it("restores state from ?p= on creation", () => {
      const source = make();
      source.setParams({ per: 7 });
      source.setFilter("a", "eq", 1);
      source.setPersistentFilter("b", "eq", 2);

      window.history.replaceState(
        {},
        "",
        "/?" + queryString.stringify({ p: source.serialize() })
      );

      const { data, api } = createParametron({ executor: makeExecutor() });

      expect(data.params.per).toBe(7);
      expect(data.filters).toEqual([["a", "eq", 1]]);
      expect(data.persistentFilters).toEqual([["b", "eq", 2]]);
      expect(api.getFilters("a")).toEqual([["a", "eq", 1]]);
    });

    it("ignores a corrupted ?p= value", () => {
      window.history.replaceState({}, "", "/?p=garbage");
      const { data } = createParametron({ executor: makeExecutor() });
      expect(data.filters).toEqual([]);
      expect(data.params.per).toBe(24);
    });
  });
});