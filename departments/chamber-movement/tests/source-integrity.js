"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "source-parts");
const parts = fs.readdirSync(sourceDir)
  .filter(name => name.startsWith("block-rearrangement.") && name.endsWith(".part"))
  .sort();
assert.ok(parts.length > 0, "source parts are missing");
const encoded = parts.map(name => fs.readFileSync(path.join(sourceDir, name), "utf8").trim()).join("");
const source = zlib.gunzipSync(Buffer.from(encoded, "base64"));
const digest = crypto.createHash("sha256").update(source).digest("hex");
assert.equal(digest, "47b14c7f10259f2407f770d6c900e55c131418d423d5b6796d09375ecb316c82", "block source parts changed");
console.log("PASS: NCN chamber-motion source-part integrity");
