import * as path from "path";
import { ANSI_RESET, artifactToMessage, toReadableSize, ansi } from "./util";
import { cp } from "fs/promises";

const includeDirs = ["./assets"];
const outDir = "./out";

const fullOutdir = path.resolve(outDir);

const timeLabel = "build time";
console.time(timeLabel);
let output = await Bun.build({
    entrypoints: ["./src/index.html"],
    outdir: outDir,
    target: "browser",
    sourcemap: "linked",
    minify: true,
    splitting: true,
    throw: true,
});
console.timeEnd(timeLabel);

for (let log of output.logs) {
    console.log(log);
}

console.log(`Build output directory: ${fullOutdir}`);

console.log("Build artifacts: ");
console.table(output.outputs.map(artifact => {
    const m = artifactToMessage(fullOutdir, artifact);

    const readable = toReadableSize(m.size);
    const threshold = 1000 * 1000;
    return {
        ...m,
        size: `${ansi(m.size > threshold ? "orange" : "aquamarine")} ${readable} ${ANSI_RESET}`,
    };
}));

for (const dir of includeDirs) {
    await cp(dir, fullOutdir, { recursive: true });
}
