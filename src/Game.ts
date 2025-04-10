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
            size: (4 * 16) + 16,
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

        const viewTexture = this.viewTexture.get();
        const aspect = viewTexture.width / viewTexture.height;
        
        const viewMat = this.getModelViewMatrix(this.totalTime);
        const projMat = this.getProjMatrix(aspect, 2, 7);

        const mvpMat = mat4.multiply(projMat, viewMat);
        const invMvpMat = mat4.invert(mvpMat);

        gpuDevice.queue.writeBuffer(this.drawUniformBuffer.get(), 0, invMvpMat);
        gpuDevice.queue.writeBuffer(this.drawUniformBuffer.get(), 16 * 4, new Float32Array([this.totalTime]));
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

    getModelViewMatrix(rotation: number) {
        const viewMat = mat4.identity();
        mat4.translate(viewMat, [0, 0, -56], viewMat);

        mat4.rotate(
            viewMat,
            [-1, 0, 0],
            Math.PI * 0.33,
            viewMat
        );
        
        mat4.rotate(
            viewMat,
            [0, 0, 1],
            rotation * 0.25,
            viewMat
        );

        return viewMat;
    }

    getProjMatrix(
        aspect: number,
        near: number,
        far: number) {
        const projMat = mat4.perspective(
            (2 * Math.PI) / 7,
            aspect,
            near,
            far
        );

        const s = aspect * 25.05;
        const projMat2 = mat4.ortho(-s, s, -s, s, near, far);

        return projMat2;
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
            'assets/img/volume/generated.bin.gz';

        const data = this.fetchProvider(dataPath).map(async resp => {
            const response = await resp;
            const dataStream = response.body!.pipeThrough(new DecompressionStream('gzip'));
            return await new Response(dataStream).arrayBuffer();
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
