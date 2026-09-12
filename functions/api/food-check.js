/**
 * TEMPORARY diagnostic — delete once the food search works.
 *
 * /api/food answers with Cloudflare's own 502 page, which means the function is
 * not returning a response at all: the guard inside it never runs, so whatever
 * fails, fails before or around it. Guessing from here is cheap and wrong, so
 * this walks the same path one step at a time and reports where it stops.
 *
 * Open https://thehackwithtable.com/api/food-check and read the JSON.
 *
 * Every step is caught separately and nothing is imported that /api/food does
 * not already import, so if this page answers and that one does not, the
 * difference is the outbound call rather than the module.
 *
 * The key is never printed — only whether one is there and how long it is.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const attempt = async (label, fn) => {
  try { return { step: label, ok: true, ...(await fn()) }; }
  catch (err) { return { step: label, ok: false, threw: String(err && err.message ? err.message : err), name: err?.name || null }; }
};

export async function onRequest({ request, env }) {
  const steps = [];

  steps.push({ step: "the function ran", ok: true });

  steps.push(await attempt("the key is configured", async () => {
    const key = env.FDC_API_KEY;
    return {
      present: typeof key === "string" && key.length > 0,
      length: typeof key === "string" ? key.length : 0,
      looksTrimmed: typeof key === "string" ? key === key.trim() : null,
    };
  }));

  steps.push(await attempt("shared/access.js loads", async () => {
    const mod = await import("../../shared/access.js");
    return { identityIsAFunction: typeof mod.identity === "function" };
  }));

  steps.push(await attempt("shared/food.js loads", async () => {
    const mod = await import("../../shared/food.js");
    return { readSearchIsAFunction: typeof mod.readSearch === "function", dataTypes: mod.DATA_TYPES?.length ?? null };
  }));

  steps.push(await attempt("the token verifies", async () => {
    const { identity } = await import("../../shared/access.js");
    return { signedInAs: (await identity(request)) ? "somebody" : null };
  }));

  steps.push(await attempt("AbortSignal.timeout exists", async () => ({
    available: typeof AbortSignal?.timeout === "function",
  })));

  /* The outbound call, plainly, with nothing clever attached. */
  steps.push(await attempt("the food database can be reached", async () => {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", env.FDC_API_KEY || "DEMO_KEY");
    url.searchParams.set("query", "celery");
    url.searchParams.set("pageSize", "1");
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.text();
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      firstBytes: body.slice(0, 160),
      foods: (() => { try { return JSON.parse(body).foods?.length ?? null; } catch { return null; } })(),
    };
  }));

  return json({
    readMe: "The last step with ok:false is where it stops. If every step passes here but /api/food still 502s, the difference is in that file rather than in the platform.",
    steps,
  });
}
