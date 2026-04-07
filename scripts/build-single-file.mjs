import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(".");
const distDir = path.resolve(rootDir, "dist");
const distHtmlPath = path.resolve(distDir, "index.html");
const eventsPath = path.resolve(rootDir, "public/data/events.json");
const outputPath = path.resolve(distDir, "olympics-planner.single.html");

function escapeInlineScript(content) {
  return content.replace(/<\/(script)/gi, "<\\/$1");
}

async function main() {
  const html = await readFile(distHtmlPath, "utf-8");
  const eventsJson = await readFile(eventsPath, "utf-8");

  const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/i);
  const jsMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/i);

  if (!cssMatch || !jsMatch) {
    throw new Error("Could not locate CSS/JS asset references in dist/index.html.");
  }

  const cssPath = path.resolve(distDir, cssMatch[1].replace(/^\//, ""));
  const jsPath = path.resolve(distDir, jsMatch[1].replace(/^\//, ""));

  const css = await readFile(cssPath, "utf-8");
  const js = await readFile(jsPath, "utf-8");

  const eventsScript = `<script>window.__EVENTS__=${escapeInlineScript(eventsJson.trim())};</script>`;
  const inlineCss = `<style>${css}</style>`;
  const inlineJs = `<script type="module">${escapeInlineScript(js)}</script>`;

  const withInlinedCss = html.replace(cssMatch[0], inlineCss);
  const withInlinedData = withInlinedCss.replace("</head>", `${eventsScript}\n</head>`);
  const singleFileHtml = withInlinedData.replace(jsMatch[0], inlineJs);

  await writeFile(outputPath, `${singleFileHtml}\n`, "utf-8");
  console.log(`Wrote standalone file: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
