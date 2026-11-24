# CineWave

CineWave is an educational movie-discovery prototype. It uses TMDB metadata to browse and search films, view details and available trailers, maintain an account-based watchlist, and get rule-based MoodMatch suggestions.

It does not host or stream full-length movies.

## Requirements

- Node.js 20 or newer
- npm
- A TMDB API read access token

## Project Setup

1. Copy `backend/movie-service/.env.example` to `backend/movie-service/.env`.
2. Add your TMDB API read access token:

```env
TMDB_ACCESS_TOKEN=your_tmdb_read_access_token
```

3. Open a terminal in the `backend` directory.
4. Install dependencies:

```bash
npm install
```

5. Start the backend:

```bash
npm start
```

6. Open CineWave in your browser:

```text
http://localhost:5001
```

The Express application serves both the frontend and REST API. Alternatively, you can serve the `frontend` folder using VS Code Live Server. Its API requests are sent to the CineWave backend on port `5001`.

When hosting the frontend separately, set the following meta tag in `frontend/index.html` to configure the backend URL:

```html
<meta name="cinewave-api-url" content="https://your-backend.example/api">
```

## Features

- Popular movies and title search
- Movie details, cast and crew metadata
- Available YouTube trailer links
- MoodMatch preferences for mood, maximum runtime and original language
- Registration, login and logout
- Personal account-based watchlist
- Responsive layout for desktop and mobile
- REST API endpoints under `/api`
- Local JSON file storage for user data

## Troubleshooting

- Check whether the backend is running by opening `http://localhost:5001/api/health`. It should return:

```json
{"status":"ok"}
```

- Open CineWave at `http://localhost:5001`.
- If movies do not load, verify that `backend/movie-service/.env` contains a valid TMDB API read access token under `TMDB_ACCESS_TOKEN`.
- Restart the backend after changing environment variables.
- TMDB requests require outbound internet access. Check network connectivity, DNS, firewall or proxy settings if TMDB cannot be reached.
- Open browser Developer Tools → Network → `/api/movies/popular` to inspect HTTP status codes and API errors.
- A 502 response usually indicates TMDB connectivity or authorization trouble.
- A non-JSON web-page response usually indicates that the frontend is pointing to the wrong server.

## Security and Data Storage

Passwords are stored as salted scrypt hashes. The browser holds a short-lived bearer token in session storage.

The JSON file store and in-memory sessions are intended for a single-instance educational demonstration, not production use.

Before deploying real user accounts, use:

- A managed database
- HTTPS/TLS
- Rate limiting
- Secure session storage
- Appropriate operational and security controls

## MoodMatch

MoodMatch applies genre, runtime and language filters to TMDB discovery results and orders them by popularity.

It is a transparent, rules-based discovery aid, not a psychological assessment or machine-learning recommendation system.

Recommendations may return no results when TMDB has no matching titles.

## API Documentation

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Service health |
| GET | `/api/movies/popular` | Popular movie metadata