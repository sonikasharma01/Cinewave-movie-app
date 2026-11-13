const express = require("express");

const MOOD_RULES = Object.freeze({
  happy: { genres: [35, 10751], label: "Comedy and family films" },
  sad: { genres: [18, 10749], label: "Drama and romance" },
  bored: { genres: [12, 28, 53], label: "Adventure, action and thrillers" },
  romantic: { genres: [10749, 35], label: "Romance and romantic comedy" },
  excited: {
    genres: [28, 12, 878],
    label: "Action, adventure and science fiction",
  },
});
const ALLOWED_RUNTIMES = new Set([60, 90, 120, 180]);
const ALLOWED_LANGUAGES = new Set(["any", "en", "hi", "es", "fr", "ja", "ko"]);

function createMovieRouter({ fetchImpl, tmdbToken }) {
  const router = express.Router();

  async function tmdbRequest(endpoint, params = {}) {
    if (!tmdbToken) {
      const error = new Error("Movie service is missing its TMDB access token");
      error.status = 503;
      throw error;
    }

    const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    let response;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${tmdbToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        });

        break;
      } catch (error) {
        lastError = error;

        const causeCode = error.cause?.code || error.code;

        console.error(
          `TMDB attempt ${attempt} failed:`,
          causeCode || error.message,
        );

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    if (!response) {
      const message =
        lastError?.name === "TimeoutError"
          ? "TMDB took too long to respond. Please try again."
          : "Unable to reach TMDB after 3 attempts. Please check your connection.";

      const networkError = new Error(message);
      networkError.status = 502;
      throw networkError;
    }
    return response.json();
  }

  router.get("/popular", async (_req, res, next) => {
    try {
      const data = await tmdbRequest("/movie/popular");
      res.json(data.results || []);
    } catch (error) {
      next(error);
    }
  });

  router.get("/search", async (req, res, next) => {
    const query =
      typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }
    if (query.length > 120) {
      return res
        .status(400)
        .json({ message: "Search query must be 120 characters or fewer" });
    }

    try {
      const data = await tmdbRequest("/search/movie", { query });
      res.json(data.results || []);
    } catch (error) {
      next(error);
    }
  });

  router.get("/recommend", async (req, res, next) => {
    const { mood, language, maxRuntime } = req.query;
    const runtime = Number(maxRuntime);
    if (
      typeof mood !== "string" ||
      !MOOD_RULES[mood] ||
      !ALLOWED_RUNTIMES.has(runtime) ||
      typeof language !== "string" ||
      !ALLOWED_LANGUAGES.has(language)
    ) {
      return res.status(400).json({
        message: "Choose a supported mood, available time and language.",
      });
    }

    const moodRule = MOOD_RULES[mood];
    const criteria = {
      mood,
      maxRuntime: runtime,
      language,
      genres: moodRule.label,
    };

    try {
      const data = await tmdbRequest("/discover/movie", {
        include_adult: false,
        sort_by: "popularity.desc",
        with_genres: moodRule.genres.join("|"),
        "with_runtime.gte": 60,
        "with_runtime.lte": runtime,
        with_original_language: language === "any" ? undefined : language,
      });
      res.json({ results: data.results || [], criteria });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
      return res.status(400).json({ message: "A valid movie ID is required" });
    }

    try {
      const data = await tmdbRequest(`/movie/${req.params.id}`, {
        append_to_response: "videos,credits",
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createMovieRouter, MOOD_RULES };
