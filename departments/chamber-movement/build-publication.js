"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = __dirname;
const sourceDir = path.join(root, "source-parts");
const parts = fs.readdirSync(sourceDir)
  .filter(name => name.startsWith("block-rearrangement.") && name.endsWith(".part"))
  .sort();

if (!parts.length) throw new Error("No chamber-movement source parts found.");

const encoded = parts
  .map(name => fs.readFileSync(path.join(sourceDir, name), "utf8").trim())
  .join("");
const content = zlib.gunzipSync(Buffer.from(encoded, "base64"));
const output = path.join(root, "block-rearrangement.js");
fs.writeFileSync(output, content);

console.log(JSON.stringify({
  output: path.relative(root, output),
  parts: parts.length,
  bytes: content.length
}, null, 2));
