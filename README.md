# CineWave

CineWave is an educational movie-discovery prototype. It uses TMDB metadata to browse and search films, view details and available trailers, maintain an account-based watchlist, and get rule-based MoodMatch suggestions. It does not host or stream full-length movies.

## Requirements

- Node.js 20 or newer
- A TMDB API read access token
- Docker Desktop (optional, for the containerized setup)

## Run locally

1. Copy `backend/movie-service/.env.example` to `backend/movie-service/.env` and add your TMDB API read access token.
2. From the `backend` directory, install dependencies and start the service:

   ```powershell
   npm install
   npm start
   ```

3. Open `http://localhost:5001`. You can also serve the `frontend` folder with VS Code Live Server; its API requests are sent to the CineWave backend on port `5001`.

The Express app serves both the frontend and REST API. If the TMDB token is missing or invalid, the page still loads and displays a clear movie-service error. When hosting the frontend separately, set `<meta name="cinewave-api-url" content="https://your-backend.example/api">` in `frontend/index.html` to use your backend URL.

## Troubleshooting

- Check that the backend is running: open `http://localhost:5001/api/health`; it should return `{"status":"ok"}`.
- Open CineWave at `http://localhost:5001`. If using VS Code Live Server, leave the backend running on port `5001`; the frontend detects a separate local frontend server and sends API requests to the backend.
- If movies still do not load, verify that `backend/movie-service/.env` contains a valid TMDB API **read access token** under `TMDB_ACCESS_TOKEN`, then restart the backend.
- TMDB requests also require outbound internet access. If the page reports it cannot reach TMDB, check the network, DNS, firewall or proxy; movie metadata will not load while TMDB is unreachable.
- Browser developer tools → Network → `/api/movies/popular` shows the HTTP status and API error details. A 502 indicates TMDB connectivity or authorization trouble; a non-JSON web-page response usually means the frontend is pointed at the wrong server.

## Run with Docker Compose

Put `TMDB_ACCESS_TOKEN=your_token` in `backend/movie-service/.env`, then run from the project root:

```powershell
docker compose up --build
```

Open `http://localhost:5001`. Account and watchlist records are stored in the `cinewave-data` Docker volume. For local development without Docker, the default data file is `backend/data/users.json`.

## Features

- Popular movies, title search, movie details, cast/crew metadata and available YouTube trailer links
- MoodMatch preferences for mood, maximum runtime and original language
- Registration, login, logout and a personal watchlist
- Responsive layout for desktop and mobile
- REST endpoints under `/api`, with user data stored locally for this prototype

Passwords are stored as salted scrypt hashes, and the browser holds a short-lived bearer token in session storage. The JSON file store and in-memory sessions are intended for a single-instance educational demo, not production use. Use a managed database, TLS, rate limiting, secure session storage and operational controls before deploying real user accounts.

MoodMatch applies genre, runtime and language filters to TMDB discovery results and orders them by popularity. It is a transparent rules-based discovery aid, not a psychological assessment or machine-learning recommendation system. A recommendation may return no results when TMDB has no matching titles.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health |
| `GET` | `/api/movies/popular` | Popular movie metadata |
| `GET` | `/api/movies/search?query=...` | Search by title |
| `GET` | `/api/movies/:id` | Movie details, credits and videos |
| `GET` | `/api/movies/recommend?mood=happy&maxRuntime=90&language=en` | MoodMatch recommendations |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/auth/me` | Get the signed-in account |
| `POST` | `/api/auth/logout` | End the session |
| `GET` | `/api/watchlist/movies` | Get the signed-in user's watchlist |
| `POST` | `/api/watchlist/movies` | Save a movie (`{ "movie": { ... } }`) |
| `DELETE` | `/api/watchlist/movies/:id` | Remove a saved movie |

Watchlist endpoints require `Authorization: Bearer <token>`. Registration requires a valid email and a password of at least 10 characters.

## Test

From `backend`, run:

```powershell
npm test
```

The tests cover API responses, MoodMatch filters, account validation and authentication-protected watchlist operations using a mocked movie-data provider.

## Data attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Movie metadata, images and trailer availability are provided by third parties and remain subject to their terms and availability. AWS deployment and CI/CD are future work and are not configured by this local prototype.
