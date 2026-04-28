import esbuild from "esbuild";

const mode = process.argv[2] || "dev";
const isDev = mode === "dev";

const config = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  platform: "browser",
  format: "cjs",
  sourcemap: isDev ? "inline" : false,
  minify: !isDev,
  target: "es2018",
  external: ["obsidian", "electron"],
  logLevel: "info"
};

const run = async () => {
  const ctx = await esbuild.context(config);
  if (isDev) {
    await ctx.watch();
    console.log("watching...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
