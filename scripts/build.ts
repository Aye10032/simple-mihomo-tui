import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const target = process.argv[2] as Bun.Build.CompileTarget | undefined;
const output = process.argv[3];

if (!target || !output) {
  console.error("Usage: bun run build <bun-target> <output-file>");
  process.exit(1);
}

const outfile = resolve(output);
await mkdir(dirname(outfile), { recursive: true });

const result = await Bun.build({
  entrypoints: [resolve("src/index.tsx")],
  compile: {
    target,
    outfile,
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
  minify: true,
  define: target.includes("linux")
    ? { "process.env.OPENTUI_LIBC": JSON.stringify(target.includes("musl") ? "musl" : "glibc") }
    : undefined,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${target}: ${outfile}`);
