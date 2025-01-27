import { App } from "./app"

const canvas = <HTMLCanvasElement>document.getElementById("gl-canvas");
if (!canvas) {
    throw new Error("Failed to find canvas element.");
}

const gl = canvas.getContext("webgl2", { antialias: false });
if (!gl) {
    throw new Error("WebGL 2 is unavailable on this system.");
}

const app = new App();
app.createResources(gl);

const resizeObserver = new ResizeObserver(resizeCallback);
resizeObserver.observe(canvas);

let previousTime = performance.now();
requestAnimationFrame(animate);

function animate(time: DOMHighResTimeStamp) {
    const deltaTime = time - previousTime;
    previousTime = time;

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
    console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${width}x${height}.`);

    canvas.width = width;
    canvas.height = height;

    app.resizeFramebuffer(width, height);
}