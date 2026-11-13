const express = require("express");

function createWatchlistRouter(userStore, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get("/movies", (req, res) => {
    const users = userStore.readUsers();
    res.json(users[req.userEmail].watchlist || []);
  });

  router.post("/movies", (req, res) => {
    const movie = req.body?.movie;
    if (
      !movie ||
      !Number.isSafeInteger(movie.id) ||
      movie.id <= 0 ||
      typeof movie.title !== "string" ||
      movie.title.trim().length === 0 ||
      movie.title.length > 300
    ) {
      return res.status(400).json({ message: "A valid movie is required" });
    }

    const users = userStore.readUsers();
    const user = users[req.userEmail];
    if (!user.watchlist.some((item) => item.id === movie.id)) {
      user.watchlist.push({
        id: movie.id,
        title: movie.title.trim(),
        poster_path: typeof movie.poster_path === "string" ? movie.poster_path : null,
        backdrop_path: typeof movie.backdrop_path === "string" ? movie.backdrop_path : null,
        vote_average: Number.isFinite(movie.vote_average) ? movie.vote_average : 0,
        release_date: typeof movie.release_date === "string" ? movie.release_date : "",
        overview: typeof movie.overview === "string" ? movie.overview.slice(0, 5000) : "",
      });
      userStore.writeUsers(users);
    }

    res.status(201).json(user.watchlist);
  });

  router.delete("/movies/:id", (req, res) => {
    const movieId = Number(req.params.id);
    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
      return res.status(400).json({ message: "A valid movie ID is required" });
    }

    const users = userStore.readUsers();
    const user = users[req.userEmail];
    user.watchlist = user.watchlist.filter((movie) => movie.id !== movieId);
    userStore.writeUsers(users);
    res.json(user.watchlist);
  });

  return router;
}

module.exports = { createWatchlistRouter };
