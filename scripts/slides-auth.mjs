// Разовый вход в Google: меняет код авторизации на refresh token и дописывает его
// в .env.local. Запускать из корня: node scripts/slides-auth.mjs
import { createServer } from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

const PORT = 5757;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("В .env.local нет GOOGLE_OAUTH_CLIENT_ID или GOOGLE_OAUTH_CLIENT_SECRET");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

const server = createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Нет кода в ответе Google");
    return;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const token = await response.json();

  if (!token.refresh_token) {
    res.writeHead(500).end("Google не вернул refresh token");
    console.error(token);
    process.exit(1);
  }

  appendFileSync(".env.local", `GOOGLE_OAUTH_REFRESH_TOKEN=${token.refresh_token}\n`);
  res.end("Готово, можно закрыть вкладку.");
  console.log("Refresh token записан в .env.local");
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Открываю браузер. Если не открылся — зайди сам:\n${authUrl}`);
  spawn("open", [authUrl]);
});
