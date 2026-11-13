const configuredApiUrl = document.querySelector('meta[name="cinewave-api-url"]')?.content.trim();
const API_URL = configuredApiUrl || (
  window.location.port === "5001"
    ? "/api"
    : `http://${window.location.hostname || "localhost"}:5001/api`
);
const IMAGE_URL = "https://image.tmdb.org/t/p/w500";
const FALLBACK_POSTER = "https://placehold.co/300x450?text=No+Poster";
const authTokenKey = "cinewave-session";

const container = document.getElementById("movie-container");
const searchInput = document.getElementById("movie-search");
const searchButton = document.getElementById("search-btn");
const moviesHeading = document.getElementById("movies-heading");
const resultsExplanation = document.getElementById("results-explanation");
const authDialog = document.getElementById("auth-dialog");
const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");
const authNameInput = document.getElementById("auth-name");
const authPasswordInput = document.getElementById("auth-password");

let authToken = sessionStorage.getItem(authTokenKey) || "";
let currentRequest = null;
let detailsRequest = null;
let currentQuery = "";
let currentView = "movies";
let moodMatchCriteria = null;
let watchlist = [];
let authMode = "login";

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

async function apiRequest(url, { method = "GET", body, authenticated = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authenticated && authToken) headers.Authorization = `Bearer ${authToken}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Unable to reach CineWave. Check your connection and try again.");
  }
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      const contentType = response.headers.get("content-type") || "unknown content type";
      if (/text\/html/i.test(contentType) || /^\s*(?:<!doctype html|<html)/i.test(responseText)) {
        throw new Error(
          "The movie API returned a web page instead of JSON. Start the CineWave backend on port 5001, then reload. If you're using VS Code Live Server, the page can stay open there.",
        );
      }
      throw new Error(`The movie API returned invalid data (HTTP ${response.status}, ${contentType}).`);
    }
  }
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

function setActiveNavigation(activeLink) {
  document.querySelectorAll(".navbar nav a").forEach((link) => {
    const active = link === activeLink;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function updateAuthenticationUI(user) {
  const button = document.getElementById("auth-button");
  button.textContent = user ? "Sign Out" : "Sign In";
  button.setAttribute("aria-label", user ? `Sign out ${user.name}` : "Sign in");
  button.dataset.signedIn = String(Boolean(user));
  button.title = user ? `Signed in as ${user.name}` : "";
}

function openAuthDialog() {
  authMessage.textContent = "";
  authDialog.showModal();
  document.getElementById("auth-email").focus();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  document.getElementById("auth-title").textContent = registering ? "Create your account" : "Welcome back";
  document.getElementById("auth-description").textContent = registering
    ? "Create an account to keep your watchlist in one place."
    : "Sign in to keep your watchlist with your account.";
  document.getElementById("auth-name-label").hidden = !registering;
  authNameInput.hidden = !registering;
  authNameInput.required = registering;
  authPasswordInput.autocomplete = registering ? "new-password" : "current-password";
  authPasswordInput.minLength = registering ? 10 : 1;
  document.getElementById("auth-submit").textContent = registering ? "Create Account" : "Sign In";
  document.getElementById("auth-mode-toggle").textContent = registering
    ? "Already have an account? Sign in"
    : "New to CineWave? Create an account";
  authMessage.textContent = "";
}

function isInWatchlist(movieId) {
  return watchlist.some((movie) => movie.id === movieId);
}

async function refreshWatchlist() {
  watchlist = authToken ? await apiRequest(`${API_URL}/watchlist/movies`) : [];
}

function createWatchlistButton(movie, className = "watchlist-btn") {
  const saved = isInWatchlist(movie.id);
  const button = createTextElement("button", className, saved ? "✓ In My List" : "＋ Add to My List");
  button.type = "button";
  button.setAttribute("aria-pressed", String(saved));
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!authToken) {
      openAuthDialog();
      authMessage.textContent = "Sign in to save movies to your personal list.";
      return;
    }

    button.disabled = true;
    try {
      if (isInWatchlist(movie.id)) {
        watchlist = await apiRequest(`${API_URL}/watchlist/movies/${movie.id}`, { method: "DELETE" });
      } else {
        watchlist = await apiRequest(`${API_URL}/watchlist/movies`, {
          method: "POST",
          body: { movie },
        });
      }
      button.textContent = isInWatchlist(movie.id) ? "✓ In My List" : "＋ Add to My List";
      button.setAttribute("aria-pressed", String(isInWatchlist(movie.id)));
      if (currentView === "my-list") await showWatchlist();
    } catch (error) {
      console.error("Watchlist update failed:", error);
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function showStatus(message, isError = false, busy = false) {
  container.replaceChildren(createTextElement("p", isError ? "status-message error-message" : "status-message", message));
  container.setAttribute("aria-busy", String(busy));
}

function makeMovieCard(movie) {
  const card = document.createElement("article");
  card.className = "movie-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View details for ${movie.title || "movie"}`);

  const openDetails = () => fetchMovieDetails(movie.id);
  card.addEventListener("click", openDetails);
  card.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target === card) {
      event.preventDefault();
      openDetails();
    }
  });

  const poster = document.createElement("img");
  poster.src = movie.poster_path ? `${IMAGE_URL}${movie.poster_path}` : FALLBACK_POSTER;
  poster.alt = `${movie.title || "Movie"} poster`;
  poster.loading = "lazy";

  card.append(
    poster,
    createTextElement("h3", "", movie.title || "Untitled movie"),
    createTextElement("p", "", `⭐ ${Number(movie.vote_average || 0).toFixed(1)}/10`),
    createWatchlistButton(movie),
  );
  return card;
}

function displayMovies(movies) {
  moviesHeading.textContent = currentView === "search"
    ? "Search Results"
    : currentView === "moodmatch"
      ? "Your MoodMatch Picks"
      : currentView === "my-list"
        ? "My List"
        : "Popular Movies";
  container.replaceChildren();

  if (!Array.isArray(movies) || movies.length === 0) {
    showStatus(currentView === "my-list" ? "Your list is waiting. Save a movie to see it here." : "No movies found. Try another search or mood.");
    return;
  }

  movies.forEach((movie) => container.appendChild(makeMovieCard(movie)));
  container.setAttribute("aria-busy", "false");
}

async function showWatchlist() {
  currentView = "my-list";
  if (currentRequest) currentRequest.abort();
  if (detailsRequest) detailsRequest.abort();
  moviesHeading.textContent = "My List";
  setActiveNavigation(document.getElementById("my-list-link"));
  resultsExplanation.textContent = "";
  if (!authToken) {
    showStatus("Sign in to view your personal list.");
    const signInButton = createTextElement("button", "watchlist-browse-btn", "Sign In");
    signInButton.type = "button";
    signInButton.addEventListener("click", () => {
      setAuthMode("login");
      openAuthDialog();
    });
    container.appendChild(signInButton);
    return;
  }
  container.setAttribute("aria-busy", "true");
  try {
    await refreshWatchlist();
    displayMovies(watchlist);
  } catch (error) {
    console.error("Watchlist could not be loaded:", error);
    showStatus(error.message, true);
  }
}

function returnToMovieView() {
  if (currentView === "my-list") {
    showWatchlist();
  } else if (currentView === "moodmatch" && moodMatchCriteria) {
    requestMoodMatch(moodMatchCriteria);
  } else {
    fetchMovies(currentQuery);
  }
}

async function fetchMovieDetails(movieId) {
  if (detailsRequest) detailsRequest.abort();
  detailsRequest = new AbortController();
  const signal = detailsRequest.signal;
  container.setAttribute("aria-busy", "true");
  showStatus("Loading movie details...", false, true);

  try {
    const movie = await apiRequest(`${API_URL}/movies/${movieId}`);
    if (signal.aborted) return;
    renderMovieDetails(movie);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Movie details could not be loaded:", error);
    showStatus(error.message || "Unable to load movie details. Please try again.", true);
  }
}

function renderMovieDetails(movie) {
  const details = document.createElement("section");
  details.className = "movie-details";
  details.setAttribute("aria-labelledby", "movie-detail-title");

  if (movie.backdrop_path) {
    const backdrop = document.createElement("img");
    backdrop.className = "details-backdrop";
    backdrop.src = `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`;
    backdrop.alt = "";
    backdrop.setAttribute("aria-hidden", "true");
    details.appendChild(backdrop);
  }

  const content = document.createElement("div");
  content.className = "movie-details-content";
  const backButton = createTextElement("button", "back-to-movies", "← Back to movies");
  backButton.type = "button";
  backButton.addEventListener("click", returnToMovieView);

  const layout = document.createElement("div");
  layout.className = "movie-detail-layout";
  const poster = document.createElement("img");
  poster.className = "details-poster";
  poster.src = movie.poster_path ? `${IMAGE_URL}${movie.poster_path}` : FALLBACK_POSTER;
  poster.alt = `${movie.title || "Movie"} poster`;

  const info = document.createElement("div");
  info.className = "movie-info";
  info.append(
    createTextElement("p", "detail-eyebrow", "MOVIE DETAILS"),
    createTextElement("h2", "", movie.title || "Untitled movie"),
  );
  info.lastElementChild.id = "movie-detail-title";

  const releaseYear = movie.release_date ? movie.release_date.slice(0, 4) : "Release date unavailable";
  const runtime = Number(movie.runtime) > 0
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
    : "Runtime unavailable";
  const rating = Number(movie.vote_average) > 0
    ? `⭐ ${Number(movie.vote_average).toFixed(1)}/10`
    : "Not rated";
  const metadata = document.createElement("div");
  metadata.className = "movie-meta";
  [releaseYear, runtime, rating].forEach((value) => metadata.appendChild(createTextElement("span", "", value)));
  info.appendChild(metadata);

  if (Array.isArray(movie.genres) && movie.genres.length > 0) {
    const genres = document.createElement("div");
    genres.className = "movie-genres";
    movie.genres.forEach((genre) => genres.appendChild(createTextElement("span", "genre-chip", genre.name)));
    info.appendChild(genres);
  }
  info.appendChild(createTextElement("p", "movie-overview", movie.overview || "No synopsis is available for this movie yet."));

  const credits = movie.credits || {};
  const director = Array.isArray(credits.crew) ? credits.crew.find((person) => person.job === "Director") : null;
  const cast = Array.isArray(credits.cast) ? credits.cast.slice(0, 5).map((person) => person.name) : [];
  if (director || cast.length) {
    const people = document.createElement("div");
    people.className = "movie-credits";
    if (director) people.appendChild(createTextElement("p", "", `Director: ${director.name}`));
    if (cast.length) people.appendChild(createTextElement("p", "", `Starring: ${cast.join(", ")}`));
    info.appendChild(people);
  }

  const actions = document.createElement("div");
  actions.className = "movie-detail-actions";
  const videos = movie.videos?.results || [];
  const trailer = videos.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official)
    || videos.find((video) => video.site === "YouTube" && video.type === "Trailer");
  if (trailer?.key) {
    const trailerLink = createTextElement("a", "trailer-link", "▶ Watch trailer");
    trailerLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`;
    trailerLink.target = "_blank";
    trailerLink.rel = "noopener noreferrer";
    actions.appendChild(trailerLink);
  } else {
    actions.appendChild(createTextElement("span", "trailer-unavailable", "No trailer available"));
  }
  actions.appendChild(createWatchlistButton(movie, "detail-watchlist-btn"));

  content.appendChild(backButton);
  layout.append(poster, info);
  content.appendChild(layout);
  info.appendChild(actions);
  details.appendChild(content);
  container.replaceChildren(details);
  container.setAttribute("aria-busy", "false");
}

async function fetchMovies(query = "") {
  currentQuery = query;
  currentView = query ? "search" : "movies";
  if (detailsRequest) detailsRequest.abort();
  if (currentRequest) currentRequest.abort();
  currentRequest = new AbortController();
  const { signal } = currentRequest;
  setActiveNavigation(document.getElementById(query ? "movies-link" : "home-link"));
  resultsExplanation.textContent = "";
  container.setAttribute("aria-busy", "true");
  showStatus(query ? "Searching movies..." : "Loading movies...", false, true);
  const endpoint = query
    ? `${API_URL}/movies/search?query=${encodeURIComponent(query)}`
    : `${API_URL}/movies/popular`;

  try {
    const movies = await apiRequest(endpoint);
    if (!signal.aborted) displayMovies(movies);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Movies could not be loaded:", error);
    showStatus(error.message || "Unable to load movies. Please try again.", true);
  }
}

async function requestMoodMatch(criteria) {
  currentView = "moodmatch";
  if (currentRequest) currentRequest.abort();
  if (detailsRequest) detailsRequest.abort();
  currentRequest = new AbortController();
  const { signal } = currentRequest;
  const params = new URLSearchParams(criteria);
  container.setAttribute("aria-busy", "true");
  showStatus("Finding movies for you...", false, true);
  resultsExplanation.textContent = "";
  setActiveNavigation(document.getElementById("moodmatch-link"));

  try {
    const response = await apiRequest(`${API_URL}/movies/recommend?${params}`);
    if (signal.aborted) return;
    const languageLabels = {
      any: "any language",
      en: "English",
      hi: "Hindi",
      es: "Spanish",
      fr: "French",
      ja: "Japanese",
      ko: "Korean",
    };
    const moodLabel = criteria.mood.charAt(0).toUpperCase() + criteria.mood.slice(1);
    resultsExplanation.textContent = `${moodLabel} mood · up to ${criteria.maxRuntime} minutes · ${languageLabels[criteria.language]}. Suggestions favour ${response.criteria.genres.toLowerCase()} and are sorted by popularity.`;
    displayMovies(response.results);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("MoodMatch could not be completed:", error);
    showStatus(error.message || "Unable to find recommendations. Please try again.", true);
  }
}

searchButton.addEventListener("click", () => fetchMovies(searchInput.value.trim()));
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") fetchMovies(searchInput.value.trim());
});
document.getElementById("moodmatch-form").addEventListener("submit", (event) => {
  event.preventDefault();
  moodMatchCriteria = {
    mood: document.getElementById("mood-select").value,
    maxRuntime: document.getElementById("runtime-select").value,
    language: document.getElementById("language-select").value,
  };
  requestMoodMatch(moodMatchCriteria);
  document.getElementById("movies-section").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("my-list-link").addEventListener("click", (event) => {
  event.preventDefault();
  showWatchlist();
  document.getElementById("movies-section").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("movies-link").addEventListener("click", (event) => {
  event.preventDefault();
  fetchMovies(currentQuery);
  document.getElementById("movies-section").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("home-link").addEventListener("click", () => {
  fetchMovies();
});
document.getElementById("moodmatch-link").addEventListener("click", () => {
  setActiveNavigation(document.getElementById("moodmatch-link"));
});

document.getElementById("auth-button").addEventListener("click", async (event) => {
  if (event.currentTarget.dataset.signedIn === "true") {
    try {
      await apiRequest(`${API_URL}/auth/logout`, { method: "POST" });
    } catch (error) {
      console.error("Sign out could not be confirmed:", error);
    }
    authToken = "";
    sessionStorage.removeItem(authTokenKey);
    watchlist = [];
    updateAuthenticationUI(null);
    if (currentView === "my-list") showWatchlist();
    return;
  }
  setAuthMode("login");
  openAuthDialog();
});
document.getElementById("auth-close").addEventListener("click", () => authDialog.close());
document.getElementById("auth-mode-toggle").addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
});
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const endpoint = authMode === "register" ? "register" : "login";
  const payload = {
    email: document.getElementById("auth-email").value.trim(),
    password: authPasswordInput.value,
  };
  if (authMode === "register") payload.name = authNameInput.value.trim();

  const submitButton = document.getElementById("auth-submit");
  submitButton.disabled = true;
  authMessage.textContent = "";
  try {
    const result = await apiRequest(`${API_URL}/auth/${endpoint}`, {
      method: "POST",
      body: payload,
      authenticated: false,
    });
    authToken = result.token;
    sessionStorage.setItem(authTokenKey, authToken);
    await refreshWatchlist();
    updateAuthenticationUI(result.user);
    authDialog.close();
    authForm.reset();
    setAuthMode("login");
    if (currentView === "my-list") displayMovies(watchlist);
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

async function restoreSession() {
  if (!authToken) {
    updateAuthenticationUI(null);
    return;
  }
  try {
    const result = await apiRequest(`${API_URL}/auth/me`);
    await refreshWatchlist();
    updateAuthenticationUI(result.user);
  } catch (error) {
    console.error("Saved session could not be restored:", error);
    authToken = "";
    sessionStorage.removeItem(authTokenKey);
    updateAuthenticationUI(null);
  }
}

updateAuthenticationUI(null);
fetchMovies();
restoreSession();
