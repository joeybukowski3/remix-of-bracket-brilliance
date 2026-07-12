import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const previewPath = path.join(ROOT, "public", "data", "mlb", "numerology", "email-preview.html");
const outputDir = path.join(ROOT, "artifacts", "mlb-numerology-email");

if (!fs.existsSync(previewPath)) {
  throw new Error(`Missing ${previewPath}. Run npm run mlb:numerology:email:preview first.`);
}

const emailHtml = fs.readFileSync(previewPath, "utf8").replace(/[ \t]+$/gm, "");
const previews = [
  { name: "mobile-375.html", viewportWidth: 375, shellWidth: 375 },
  { name: "desktop-680.html", viewportWidth: 720, shellWidth: 720 },
];

fs.mkdirSync(outputDir, { recursive: true });

for (const preview of previews) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${preview.viewportWidth}, initial-scale=1" />
  <title>MLB Numerology Email — ${preview.name}</title>
</head>
<body style="margin:0;background:#dbe3ec;">
  <div data-preview-width="${preview.viewportWidth}" style="width:${preview.shellWidth}px;max-width:100%;margin:0 auto;">
    ${emailHtml}
  </div>
</body>
</html>
`;
  const outputPath = path.join(outputDir, preview.name);
  fs.writeFileSync(outputPath, html);
  console.log(`[mlb-numerology] Preview artifact written to ${outputPath}`);
}
