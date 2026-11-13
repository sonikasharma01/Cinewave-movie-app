const cors = require("cors");
const express = require("express");
const dns = require("node:dns");
const path = require("node:path");

dns.setDefaultResultOrder("ipv4first");

const { createAuthService } = require("./services/auth");
const { createMovieRouter } = require("./services/movies");
const { createUserStore } = require("./services/user-store");
const { createWatchlistRouter } = require("./services/watchlist");

function createApp({
  dataFile = process.env.DATA_FILE || path.join(__dirname, "data", "users.json"),
  fetchImpl = globalThis.fetch,
  tmdbToken = process.env.TMDB_ACCESS_TOKEN,
} = {}) {
  const app = express();
  const userStore = createUserStore(dataFile);
  const auth = createAuthService(userStore);

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/auth", auth.router);
  app.use("/api/watchlist", createWatchlistRouter(userStore, auth.authenticate));
  app.use("/api/movies", createMovieRouter({ fetchImpl, tmdbToken }));
  app.use(express.static(path.join(__dirname, "..", "frontend")));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
  });

  app.use((err, _req, res, _next) => {
    console.error("Request failed:", err.message);
    res.status(err.status || 500).json({
      message: err.status ? err.message : "The request could not be completed",
    });
  });

  return app;
}

if (require.main === module) {
  require("dotenv").config({
    path: path.join(__dirname, "movie-service", ".env"),
  });

  const app = createApp();
  const port = Number(process.env.PORT) || 5001;
  app.listen(port, "0.0.0.0", () => {
    console.log(`CineWave is running at http://localhost:${port}`);
  });
}

module.exports = { createApp };
