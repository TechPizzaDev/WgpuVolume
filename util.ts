import { file, type BuildArtifact, type ColorInput } from "bun";
import * as path from "path";

export const ANSI_RESET = "\x1b[0m";

export function loaderToColor(loader: string): ColorInput {
    switch (loader) {
        case "file":
            return "yellow";
    }
    return "lightgray";
}

export function kindToColor(kind: string): ColorInput {
    switch (kind) {
        case "entry-point":
            return "green";
        case "sourcemap":
            return "pink";
    }
    return "lightgray";
}

export function ansi(color: ColorInput): string | null {
    return Bun.color(color, "ansi");
}

export function artifactToMessage(rootDir: string, a: BuildArtifact): { loader: string, path: string, hash: string, size: number, kind: string } {
    const size = file(a.path).size;
    const kindColor = ansi(kindToColor(a.kind));
    return {
        loader: ansi(loaderToColor(a.loader)) + a.loader + ANSI_RESET,
        path: kindColor + path.relative(rootDir, a.path) + ANSI_RESET,
        kind: kindColor + a.kind + ANSI_RESET,
        size: size,
        hash: ansi("brown") + a.hash! + ANSI_RESET,
    };
}

export function toReadableSize(size: number, metric: boolean = true): string {
    const scale = metric ? 1000 : 1024;
    const suffixes = metric ? ["B", "kB", "MB", "GB"] : ["B", "KiB", "MiB", "GiB"];

    const log = Math.min(Math.floor(Math.log(size) / Math.log(scale)), suffixes.length);
    const div = Math.pow(scale, log);

    const maximumFractionDigits = Math.min(log, 3);
    return `${(size / div).toLocaleString(undefined, { maximumFractionDigits })} ${suffixes[log]}`;
}