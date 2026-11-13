const {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} = require("node:crypto");
const express = require("express");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createAuthService(userStore) {
  const router = express.Router();
  const sessions = new Map();

  function authenticate(req, res, next) {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/);
    if (!match) {
      return res.status(401).json({ message: "Please sign in to continue" });
    }

    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const session = sessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(tokenHash);
      return res.status(401).json({ message: "Your session has expired. Sign in again." });
    }

    const user = userStore.readUsers()[session.email];
    if (!user || user.id !== session.userId) {
      sessions.delete(tokenHash);
      return res.status(401).json({ message: "Your session is no longer valid" });
    }

    req.userEmail = user.email;
    req.userId = user.id;
    next();
  }

  function createSession(user) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    sessions.set(tokenHash, {
      email: user.email,
      userId: user.id,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }

  router.post("/register", (req, res) => {
    const { name, email, password } = req.body || {};
    if (
      typeof name !== "string" ||
      name.trim().length < 1 ||
      name.trim().length > 80 ||
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Enter a valid name and email, and a password of at least 10 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = userStore.readUsers();
    if (users[normalizedEmail]) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const salt = randomBytes(16).toString("hex");
    const user = {
      id: randomBytes(16).toString("hex"),
      name: name.trim(),
      email: normalizedEmail,
      passwordSalt: salt,
      passwordHash: scryptSync(password, salt, 64).toString("hex"),
      watchlist: [],
    };
    users[normalizedEmail] = user;
    userStore.writeUsers(users);

    res.status(201).json({
      token: createSession(user),
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  router.post("/login", (req, res) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > 128
    ) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = userStore.readUsers()[normalizedEmail];
    const submittedHash = scryptSync(password, user?.passwordSalt || "invalid-user-salt", 64);
    const storedHash = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(64);
    if (!user || storedHash.length !== submittedHash.length || !timingSafeEqual(storedHash, submittedHash)) {
      return res.status(401).json({ message: "Email or password is incorrect" });
    }

    res.json({
      token: createSession(user),
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  router.get("/me", authenticate, (req, res) => {
    const user = userStore.readUsers()[req.userEmail];
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  router.post("/logout", authenticate, (req, res) => {
    const token = req.get("authorization").slice("Bearer ".length);
    sessions.delete(createHash("sha256").update(token).digest("hex"));
    res.status(204).end();
  });

  return { router, authenticate };
}

module.exports = { createAuthService };
