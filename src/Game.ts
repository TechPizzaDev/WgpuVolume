import { mat4 } from "wgpu-matrix";
import { App, type PresentationDescriptor } from "./App";
import { ValueProvider, type Provider } from "./Provider";

export class Game extends App {
    totalTime: number = 0;

    sampleCount = new ValueProvider(4);
    viewTexture: Provider<GPUTexture>;

    sampler: Provider<GPUSampler>;

    drawPipeline: Provider<Promise<GPURenderPipeline>>;
    drawUniformBuffer: Provider<GPUBuffer>;
    drawBindGroup: Provider<Promise<GPUBindGroup>>;

    constructor(
        gpuDevice: Provider<GPUDevice>,
        presentation: Provider<PresentationDescriptor>) {
        super(gpuDevice, presentation);

        this.sampler = gpuDevice.map(gpu => gpu.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            maxAnisotropy: 16,
        }));

        const drawShader = this.fetchShader("draw.wgsl");

        this.drawPipeline = this.createRenderPipeline(
            drawShader, [this.presentation, this.sampleCount],
            ([vertModule, fragModule, pres, sampleCount]) => {
                return {
                    layout: "auto",
                    vertex: {
                        module: vertModule,
                    },
                    fragment: fragModule ? {
                        module: fragModule,
                        targets: [
                            {
                                format: pres.format,
                            },
                        ],
                    } : undefined,
                    primitive: {
                        topology: "triangle-list",
                        cullMode: "back",
                    },
                    multisample: {
                        count: sampleCount
                    }
                };
            });

        this.drawUniformBuffer = this.gpuDevice.map(gpu => gpu.createBuffer({
            size: 4 * 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }));

        const volumeTexture = this.loadVolumeTexture();

        this.drawBindGroup = this.gpuDevice
            .join([this.drawPipeline, this.drawUniformBuffer, this.sampler, volumeTexture])
            .map(async args => {
                const [gpu, pipeline, uniform, sampler, texture] = await Promise.all(args);

                return gpu.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        {
                            binding: 0,
                            resource: {
                                buffer: uniform,
                            },
                        },
                        {
                            binding: 1,
                            resource: sampler,
                        },
                        {
                            binding: 2,
                            resource: texture.createView(),
                        },
                    ],
                });
            });

        this.viewTexture = this.gpuDevice
            .join([this.presentation, this.sampleCount])
            .map(([gpu, presentation, sampleCount]) => {
                const { width, height, format } = presentation;
                return gpu.createTexture({
                    size: [width, height],
                    sampleCount,
                    format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                });
            });
    }

    override async update(deltaTime: number) {
        this.totalTime += deltaTime;
        const gpuDevice = this.gpuDevice.get();

        const invMvpMat = mat4.identity();
        const viewTexture = this.viewTexture.get();
        const aspect = viewTexture.width / viewTexture.height;
        this.getInverseMvpMatrix(this.totalTime, aspect, 2, 7, invMvpMat);

        gpuDevice.queue.writeBuffer(this.drawUniformBuffer.get(), 0, invMvpMat);
    }

    override async draw(canvasTexture: Provider<GPUTexture>) {
        const gpuDevice = this.gpuDevice.get();

        const pipeline = await this.drawPipeline.get();
        const bindgroup = await this.drawBindGroup.get();

        const drawPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.viewTexture.get().createView(),
                    clearValue: [0.5, 0.5, 0.5, 1.0],
                    loadOp: "clear",
                    storeOp: "discard",
                    resolveTarget: canvasTexture.get().createView(),
                },
            ],
        };

        const cmd = gpuDevice.createCommandEncoder();
        const pass = cmd.beginRenderPass(drawPassDesc);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindgroup);
        pass.draw(6);
        pass.end();
        gpuDevice.queue.submit([cmd.finish()]);
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

    loadVolumeTexture(): Provider<Promise<GPUTexture>> {
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

        const data = this.fetchProvider(dataPath).map(async resp => {
            // Fetch the compressed data
            const compressedArrayBuffer = await (await resp).arrayBuffer();

            // Decompress the data using DecompressionStream for gzip format
            const decompressionStream = new DecompressionStream('gzip');
            const decompressedStream = new Response(
                compressedArrayBuffer
            ).body!.pipeThrough(decompressionStream);

            const decompressedArrayBuffer = await new Response(
                decompressedStream
            ).arrayBuffer();

            return decompressedArrayBuffer;
        });

        return this.gpuDevice.join([data]).map(async ([gpu, data]) => {
            const texture = gpu.createTexture({
                dimension: "3d",
                size: [width, height, depth],
                format: format,
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });

            gpu.queue.writeTexture(
                { texture },
                await data,
                { bytesPerRow: bytesPerRow, rowsPerImage: blocksHigh },
                [width, height, depth]
            );
            return texture;
        });
    }
}
