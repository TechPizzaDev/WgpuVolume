import { Game } from "./Game";

const canvas = <HTMLCanvasElement>document.getElementById("gl-canvas");
if (!canvas) {
    throw new Error("Failed to find canvas element.");
}

let needsToResize = false;
let nextWidth = 0;
let nextHeight = 0;
const resizeObserver = new ResizeObserver(resizeCallback);
resizeObserver.observe(canvas);

const gl = canvas.getContext("webgl2", { antialias: false });
if (!gl) {
    throw new Error("WebGL 2 is unavailable on this system.");
}

const app = new Game();
await app.createResources(gl);

let previousTime = performance.now();
requestAnimationFrame(animate);

function animate(time: DOMHighResTimeStamp) {
    const deltaTime = (time - previousTime) / 1000.0;
    previousTime = time;

    if (needsToResize) {
        needsToResize = false;

        console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${nextWidth}x${nextHeight}.`);
        canvas.width = nextWidth;
        canvas.height = nextHeight;

        app.resizeFramebuffer();
    }

    app.update(deltaTime);
    app.draw();
    requestAnimationFrame(animate);
}

function resizeCallback(entries: ResizeObserverEntry[], observer: ResizeObserver) {
    const entry = entries[0];
    let width;
    let height;
    if (entry.devicePixelContentBoxSize) {
        width = entry.devicePixelContentBoxSize[0].inlineSize;
        height = entry.devicePixelContentBoxSize[0].blockSize;
    } else if (entry.contentBoxSize) {
        // fallback for Safari that will not always be correct
        const pixelRatio = window.devicePixelRatio;
        width = Math.round(entry.contentBoxSize[0].inlineSize * pixelRatio);
        height = Math.round(entry.contentBoxSize[0].blockSize * pixelRatio);
    } else {
        return;
    }

    nextWidth = width;
    nextHeight = height;
    needsToResize = true;
}