const fs = require("node:fs");
const path = require("node:path");

function createUserStore(filePath) {
  function readUsers() {
    try {
      const contents = fs.readFileSync(filePath, "utf8");
      const users = JSON.parse(contents);
      if (!users || typeof users !== "object" || Array.isArray(users)) {
        throw new Error("User data must be an object");
      }
      return users;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error(`Unable to read user data: ${error.message}`);
    }
  }

  function writeUsers(users) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(users, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, filePath);
    } catch (error) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") throw cleanupError;
      }
      throw new Error(`Unable to save user data: ${error.message}`);
    }
  }

  return { readUsers, writeUsers };
}

module.exports = { createUserStore };
