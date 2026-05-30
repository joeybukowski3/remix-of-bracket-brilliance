import readline from "node:readline/promises";
import process from "node:process";
import { stdin as input, stdout as output } from "node:process";
import { TwitterApi } from "twitter-api-v2";

const EXPECTED_USERNAME = "_joeknowsball_";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@/, "").toLowerCase();
}

function createAppClient() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;

  if (!appKey || !appSecret) {
    throw new Error("Missing X app credentials. Expected X_API_KEY and X_API_SECRET.");
  }

  return new TwitterApi({ appKey, appSecret });
}

function createRequestClient({ oauth_token, oauth_token_secret }) {
  return new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: oauth_token,
    accessSecret: oauth_token_secret,
  });
}

async function main() {
  console.log("JoeKnowsBall X OAuth 1.0a PIN helper");
  console.log("");
  console.log("This script is for local one-time use only. It does not save secrets.");
  console.log(`Log into @${EXPECTED_USERNAME} in your browser before authorizing the app.`);
  console.log("");

  const appClient = createAppClient();
  const authLink = await appClient.generateAuthLink("oob", {
    authAccessType: "write",
    forceLogin: true,
    screenName: EXPECTED_USERNAME,
  });

  console.log("Open this authorization URL:");
  console.log(authLink.url);
  console.log("");

  const rl = readline.createInterface({ input, output });
  const pin = normalizeText(await rl.question("Paste the PIN / verifier from X: "));
  rl.close();

  if (!pin) throw new Error("No PIN provided.");

  const requestClient = createRequestClient(authLink);
  const loginResult = await requestClient.login(pin);
  const account = await loginResult.client.v1.verifyCredentials();
  const username = normalizeUsername(account?.screen_name || loginResult.screenName);
  const name = normalizeText(account?.name);
  const id = normalizeText(account?.id_str ?? account?.id ?? loginResult.userId);

  console.log("");
  console.log(`Authenticated X account: @${username}${name ? ` (${name})` : ""}${id ? ` id=${id}` : ""}`);

  if (username !== EXPECTED_USERNAME) {
    throw new Error(`Authenticated X account @${username || "unknown"} does not match expected @${EXPECTED_USERNAME}. Do not use these tokens for JoeKnowsBall.`);
  }

  console.log("");
  console.log("Copy these values into GitHub Actions secrets manually. Do not commit them.");
  console.log("");
  console.log(`JKB_X_ACCESS_TOKEN=${loginResult.accessToken}`);
  console.log(`JKB_X_ACCESS_SECRET=${loginResult.accessSecret}`);
  console.log("");
  console.log("Use the same app credentials as:");
  console.log("JKB_X_API_KEY=<your X_API_KEY>");
  console.log("JKB_X_API_SECRET=<your X_API_SECRET>");
}

try {
  await main();
} catch (error) {
  console.error(`[x-oauth1-pin-auth] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
