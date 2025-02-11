import { mat4 } from "wgpu-matrix";
import { App } from "./App";

export class Game extends App {
    totalTime: number = 0;

    sampleCount: number = 4;
    viewTexture!: GPUTexture;

    sampler!: GPUSampler;

    drawPipeline!: GPURenderPipeline;
    drawUniformBuffer!: GPUBuffer;
    drawBindGroup!: GPUBindGroup;

    constructor(presentationFormat: GPUTextureFormat) {
        super(presentationFormat);
    }

    async createResources(device: GPUDevice) {
        super.createResources(device);

        this.sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            maxAnisotropy: 16,
        });

        const drawWgsl = await (await fetch("assets/shaders/draw.wgsl")).text();
        const drawShader = device.createShaderModule({
            code: drawWgsl,
        });
        this.drawPipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: drawShader,
            },
            fragment: {
                module: drawShader,
                targets: [
                    {
                        format: this.presentationFormat,
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "back",
            },
            multisample: {
                count: this.sampleCount
            }
        });

        this.drawUniformBuffer = device.createBuffer({
            size: 4 * 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const volumeTexture = await loadVolumeTexture(device);

        this.drawBindGroup = device.createBindGroup({
            layout: this.drawPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.drawUniformBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: this.sampler,
                },
                {
                    binding: 2,
                    resource: volumeTexture.createView(),
                },
            ],
        });
    }

    destroyResources() {
    }

    resizeFramebuffer(width: number, height: number) {
        this.viewTexture = this.device.createTexture({
            size: [width, height],
            sampleCount: this.sampleCount,
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    update(deltaTime: number) {
        this.totalTime += deltaTime;

        const invMvpMat = mat4.identity();
        const aspect = this.viewTexture.width / this.viewTexture.height;
        this.getInverseMvpMatrix(this.totalTime, aspect, 2, 7, invMvpMat);

        this.device.queue.writeBuffer(this.drawUniformBuffer, 0, invMvpMat);
    }

    draw(canvasTexture: GPUTexture) {
        const device = this.device;

        const drawPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.viewTexture.createView(),
                    clearValue: [0.5, 0.5, 0.5, 1.0],
                    loadOp: "clear",
                    storeOp: "discard",
                    resolveTarget: canvasTexture.createView(),
                },
            ],
        };

        const cmd = device.createCommandEncoder();
        const pass = cmd.beginRenderPass(drawPassDesc);
        pass.setPipeline(this.drawPipeline);
        pass.setBindGroup(0, this.drawBindGroup);
        pass.draw(6);
        pass.end();
        device.queue.submit([cmd.finish()]);
    }

    getInverseMvpMatrix(
        rotation: number,
        aspect: number,
        near: number,
        far: number,
        dst: Float32Array) {
        const viewMat = mat4.identity();
        mat4.translate(viewMat, [0, 0, -4], viewMat);
        mat4.rotate(
            viewMat,
            [Math.sin(rotation), Math.cos(rotation), 0],
            1,
            viewMat
        );

        const projMat = mat4.perspective(
            (2 * Math.PI) / 5,
            aspect,
            near,
            far
        );
        const mvpMat = mat4.multiply(projMat, viewMat);

        mat4.invert(mvpMat, dst);
    }
}

async function loadVolumeTexture(device: GPUDevice): Promise<GPUTexture> {
    const width = 180;
    const height = 216;
    const depth = 180;
    const format: GPUTextureFormat = 'r8unorm';
    const blockLength = 1;
    const bytesPerBlock = 1;
    const blocksWide = Math.ceil(width / blockLength);
    const blocksHigh = Math.ceil(height / blockLength);
    const bytesPerRow = blocksWide * bytesPerBlock;
    const dataPath =
        'assets/img/volume/t1_icbm_normal_1mm_pn0_rf0_180x216x180_uint8_1x1.bin-gz';

    // Fetch the compressed data
    const response = await fetch(dataPath);
    const compressedArrayBuffer = await response.arrayBuffer();

    // Decompress the data using DecompressionStream for gzip format
    const decompressionStream = new DecompressionStream('gzip');
    const decompressedStream = new Response(
        compressedArrayBuffer
    ).body!.pipeThrough(decompressionStream);

    const decompressedArrayBuffer = await new Response(
        decompressedStream
    ).arrayBuffer();

    const texture = device.createTexture({
        dimension: "3d",
        size: [width, height, depth],
        format: format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
        { texture: texture, },
        decompressedArrayBuffer,
        { bytesPerRow: bytesPerRow, rowsPerImage: blocksHigh },
        [width, height, depth]
    );
    return texture;
}
  