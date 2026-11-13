const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createApp } = require("../server");

test("CineWave API supports discovery, accounts and a private watchlist", async (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cinewave-test-"));
  const tmdbCalls = [];
  let providerFailure = false;
  const app = createApp({
    dataFile: path.join(dataDirectory, "users.json"),
    tmdbToken: "test-token",
    fetchImpl: async (url, options) => {
      tmdbCalls.push({ url: new URL(url), options });
      if (providerFailure) {
        const error = new TypeError("fetch failed");
        error.cause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
        throw error;
      }
      const body = url.pathname.endsWith("/discover/movie")
        ? { results: [{ id: 7, title: "Test adventure" }] }
        : url.pathname.endsWith("/movie/7")
          ? { id: 7, title: "Test adventure", videos: { results: [] }, credits: { cast: [], crew: [] } }
          : { results: [{ id: 7, title: "Test adventure" }] };
      return { ok: true, json: async () => body };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });

  const call = (endpoint, options) => fetch(`${baseUrl}${endpoint}`, options);
  assert.equal((await call("/api/health")).status, 200);
  assert.match(await (await call("/")).text(), /Discover Your/);
  assert.equal((await call("/api/movies/search")).status, 400);
  assert.equal((await call("/api/movies/recommend?mood=unknown&maxRuntime=90&language=en")).status, 400);

  const popular = await call("/api/movies/popular");
  assert.equal(popular.status, 200);
  assert.equal((await popular.json())[0].id, 7);
  assert.equal(tmdbCalls[0].options.headers.Authorization, "Bearer test-token");

  const recommendations = await call("/api/movies/recommend?mood=happy&maxRuntime=90&language=hi");
  assert.equal(recommendations.status, 200);
  assert.deepEqual(tmdbCalls[1].url.searchParams.get("with_genres"), "35|10751");
  assert.equal(tmdbCalls[1].url.searchParams.get("with_runtime.lte"), "90");
  assert.equal(tmdbCalls[1].url.searchParams.get("with_original_language"), "hi");

  providerFailure = true;
  const providerError = await call("/api/movies/popular");
  assert.equal(providerError.status, 502);
  assert.match((await providerError.json()).message, /Unable to reach TMDB/);
  providerFailure = false;

  assert.equal((await call("/api/watchlist/movies")).status, 401);
  const invalidRegistration = await call("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email: "test@example.com", password: "short" }),
  });
  assert.equal(invalidRegistration.status, 400);

  const registration = await call("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email: "TEST@example.com", password: "long-enough-password" }),
  });
  assert.equal(registration.status, 201);
  const { token, user } = await registration.json();
  assert.equal(user.email, "test@example.com");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  assert.equal((await call("/api/auth/me", { headers })).status, 200);
  assert.equal((await call("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email: "test@example.com", password: "long-enough-password" }),
  })).status, 409);

  assert.equal((await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "incorrect-password" }),
  })).status, 401);
  const login = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "long-enough-password" }),
  });
  assert.equal(login.status, 200);

  const saved = await call("/api/watchlist/movies", {
    method: "POST",
    headers,
    body: JSON.stringify({ movie: { id: 7, title: "Test adventure", vote_average: 8.2 } }),
  });
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).length, 1);
  assert.equal((await (await call("/api/watchlist/movies", { headers })).json()).length, 1);

  const removed = await call("/api/watchlist/movies/7", { method: "DELETE", headers });
  assert.equal((await removed.json()).length, 0);

  const logout = await call("/api/auth/logout", { method: "POST", headers });
  assert.equal(logout.status, 204);
  assert.equal((await call("/api/watchlist/movies", { headers })).status, 401);
});
