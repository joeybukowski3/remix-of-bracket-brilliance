import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const site = "https://www.joeknowsball.com";
const pages = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/pga/rbc-heritage-2026-picks", changefreq: "daily", priority: "0.95" },
  { path: "/pga/wells-fargo-championship-2026-picks", changefreq: "daily", priority: "0.93" },
  { path: "/pga/model", changefreq: "daily", priority: "0.9" },
  { path: "/pga/top-40-golf-picks", changefreq: "weekly", priority: "0.88" },
  { path: "/ncaa", changefreq: "daily", priority: "0.8" },
  { path: "/schedule", changefreq: "daily", priority: "0.8" },
  { path: "/betting-edge", changefreq: "daily", priority: "0.8" },
  { path: "/bracket", changefreq: "weekly", priority: "0.75" },
  { path: "/donate", changefreq: "monthly", priority: "0.3" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${site}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`;

writeFileSync(resolve("public", "sitemap.xml"), sitemap, "utf8");
writeFileSync(resolve("public", "robots.txt"), robots, "utf8");

console.log("Generated public/sitemap.xml and public/robots.txt");
