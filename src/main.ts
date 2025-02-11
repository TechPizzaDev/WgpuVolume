import { Game } from "./Game";
import { quitIfWebGPUNotAvailable } from "./GpuInit";

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
quitIfWebGPUNotAvailable(adapter, device);

const canvas = document.getElementById("main-canvas") as HTMLCanvasElement;
if (!canvas) {
    throw new Error("Failed to find canvas element.");
}

const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;

const context = canvas.getContext("webgpu");
if (!context) {
    throw new Error("Failed to get WebGPU context from canvas.");
}

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device,
    format: presentationFormat,
});

let needsToResize = false;
let nextWidth = canvas.width;
let nextHeight = canvas.height;
const resizeObserver = new ResizeObserver(resizeCallback);
resizeObserver.observe(canvas);

const app = new Game(presentationFormat);
await app.createResources(device);
app.resizeFramebuffer(canvas.width, canvas.height);

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
        
        app.resizeFramebuffer(nextWidth, nextHeight);
    }

    app.update(deltaTime);

    const canvasTexture = context!.getCurrentTexture();
    app.draw(canvasTexture);

    requestAnimationFrame(animate);
}

function resizeCallback(entries: ResizeObserverEntry[], observer: ResizeObserver) {
    const entry = entries[0];
    let width;
    let height;
    if (entry.devicePixelContentBoxSize) {
        width = entry.devicePixelContentBoxSize[0].inlineSize;
        height = entry.devicePixelContentBoxSize[0].blockSize;
    } else {
        // fallback for Safari that will not always be correct
        const pixelRatio = window.devicePixelRatio;
        width = Math.round(entry.contentBoxSize[0].inlineSize * pixelRatio);
        height = Math.round(entry.contentBoxSize[0].blockSize * pixelRatio);
    }

    if (canvas.width != width || canvas.height != height) {
        nextWidth = width;
        nextHeight = height;
        needsToResize = true;
    }
}