import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const site = "https://www.joeknowsball.com";
const today = new Date().toISOString().slice(0, 10);

const pages = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/mlb", changefreq: "daily", priority: "0.95" },
  { path: "/mlb/hr-props", changefreq: "daily", priority: "0.95" },
  { path: "/mlb/strikeout-props", changefreq: "daily", priority: "0.92" },
  { path: "/mlb/batter-vs-pitcher", changefreq: "daily", priority: "0.9" },
  { path: "/pga", changefreq: "daily", priority: "0.9" },
  { path: "/pga/custom", changefreq: "weekly", priority: "0.8" },
  { path: "/pga/dfs", changefreq: "weekly", priority: "0.75" },
  { path: "/pga/best-bets", changefreq: "daily", priority: "0.88" },
  { path: "/pga/model", changefreq: "daily", priority: "0.88" },
  { path: "/pga/top-40-golf-picks", changefreq: "weekly", priority: "0.82" },
  { path: "/nfl", changefreq: "weekly", priority: "0.7" },
  { path: "/ncaa", changefreq: "daily", priority: "0.85" },
  { path: "/ncaa/schedule", changefreq: "daily", priority: "0.82" },
  { path: "/ncaa/matchup", changefreq: "daily", priority: "0.82" },
  { path: "/ncaa/betting-edge", changefreq: "daily", priority: "0.8" },
  { path: "/ncaa/bracket", changefreq: "weekly", priority: "0.76" },
  { path: "/donate", changefreq: "monthly", priority: "0.3" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${site}${page.path}</loc>
    <lastmod>${today}</lastmod>
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
