import { Game } from "./Game";
import { quitIfWebGPUNotAvailable } from "./GpuInit";
import * as hotReload from "./HotReload";
import { ConstantProvider, ValueProvider } from "./Provider";

hotReload.connect();

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
const contextProvider = new ConstantProvider(context);
const currentTextureProvider = contextProvider.map(ctx => ctx.getCurrentTexture());

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

const presentationProvider = new ValueProvider({
    width: nextWidth,
    height: nextHeight,
    format: presentationFormat
});

const app = new Game(
    new ValueProvider(device),
    presentationProvider);

hotReload.observeAssetChange((path) => app.reloadAsset(path));

let previousTime = performance.now();
let time = previousTime;

while (true) {
    const deltaTime = (time - previousTime) / 1000.0;
    previousTime = time;
    await run(deltaTime);
    time = await new Promise(requestAnimationFrame);
}

async function run(deltaTime: number) {
    if (needsToResize) {
        needsToResize = false;

        console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${nextWidth}x${nextHeight}.`);
        canvas.width = nextWidth;
        canvas.height = nextHeight;

        presentationProvider.set({
            width: nextWidth,
            height: nextHeight,
            format: presentationFormat
        });
    }

    await app.update(deltaTime);

    currentTextureProvider.invalidate();
    await app.draw(currentTextureProvider);
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