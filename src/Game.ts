import { mat4, type Vec3 } from "wgpu-matrix";
import { App, type PresentationDescriptor } from "./App";
import { ValueProvider, type Provider } from "./Provider";

export class Game extends App {
    totalTime: number = 0;
    viewPosition: Vec3 = new Float32Array([0, 0, -2, 0]);

    sampleCount = new ValueProvider(4);
    viewTexture: Provider<GPUTexture>;

    sampler: Provider<GPUSampler>;

    drawPipeline: Provider<Promise<GPURenderPipeline>>;
    drawUniformBuffer: Provider<GPUBuffer>;
    sunInfoBuffer: Provider<GPUBuffer>;
    drawBindGroup: Provider<Promise<GPUBindGroup>>;

    constructor(
        gpuDevice: Provider<GPUDevice>,
        presentation: Provider<PresentationDescriptor>) {
        super(gpuDevice, presentation);

        this.sampler = gpuDevice.map(gpu => gpu.createSampler({
            magFilter: "nearest",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1,
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
                                blend: {
                                    color: {
                                        srcFactor: 'one',
                                        dstFactor: 'one-minus-src-alpha'
                                    },
                                    alpha: {
                                        srcFactor: 'one',
                                        dstFactor: 'one-minus-src-alpha'
                                    },
                                }
                            },
                        ],
                    } : undefined,
                    primitive: {
                        topology: "triangle-list",
                        cullMode: "front",
                    },
                    multisample: {
                        count: sampleCount
                    }
                };
            });

        this.drawUniformBuffer = this.gpuDevice.map(gpu => gpu.createBuffer({
            size: (4 * 16) * 6 + (4 * 4) * 3,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }));

        this.sunInfoBuffer = this.gpuDevice.map(gpu => gpu.createBuffer({
            size: (4 * 4) * 3,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }))

        const volumeTexture = this.loadVolumeTexture();

        this.drawBindGroup = this.gpuDevice
            .join([this.drawPipeline, this.drawUniformBuffer, this.sunInfoBuffer, this.sampler, volumeTexture])
            .map(async args => {
                const [gpu, pipeline, uniform, sunInfo, sampler, texture] = await Promise.all(args);

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
                            resource: {
                                buffer: sunInfo,
                            },
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

        const modelMat = this.getModelMatrix(this.totalTime);
        const invModelMat = mat4.invert(modelMat);

        const viewMat = this.getViewMatrix();
        const invViewMat = mat4.invert(viewMat);

        const projMat = this.getProjMatrix(aspect, 1, 16);
        const invProjMat = mat4.invert(projMat);

        const uniform = this.drawUniformBuffer.get();
        let i = 0;
        gpuDevice.queue.writeBuffer(uniform, i, modelMat);
        i += 16 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, invModelMat);
        i += 16 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, viewMat);
        i += 16 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, invViewMat);
        i += 16 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, projMat);
        i += 16 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, invProjMat);
        i += 16 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, this.viewPosition);
        i += 4 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, new Float32Array([0, 0, viewTexture.width, viewTexture.height]));
        i += 4 * 4;
        gpuDevice.queue.writeBuffer(uniform, i, new Float32Array([this.totalTime]));
        i += 4 * 4;

        gpuDevice.queue.writeBuffer(this.sunInfoBuffer.get(), 0, new Float32Array([
            0, 0, 1, 0,
            1, 1, 1, 0,
            0.1, 0.1, 0.1, 0,
        ]));
    }

    override async draw(canvasTexture: Provider<GPUTexture>) {
        const gpuDevice = this.gpuDevice.get();

        const pipeline = await this.drawPipeline.get();
        const bindgroup = await this.drawBindGroup.get();

        const drawPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.viewTexture.get().createView(),
                    clearValue: [100 / 255.0, 149 / 255.0, 237 / 255.0, 1.0],
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
        pass.draw(6 * 6);
        pass.end();
        gpuDevice.queue.submit([cmd.finish()]);
    }

    getModelMatrix(rotation: number) {
        const modelMat = mat4.identity();

        mat4.rotate(
            modelMat,
            [1, 0, 0],
            //Math.PI * Math.cos(rotation * 0.25),
            Math.PI * 0.25,
            modelMat
        );

        mat4.rotate(
            modelMat,
            [0, 1, 0],
            //Math.PI * Math.sin(rotation * 0.25),
            Math.PI * 0.25,
            modelMat
        );

        let scale = 1 / 2;
        mat4.scale(modelMat, [scale, scale, scale], modelMat);

        let tr = 0;
        mat4.translate(modelMat, [tr, tr, tr], modelMat);

        return modelMat;
    }

    getViewMatrix() {
        const viewMat = mat4.identity();

        mat4.translate(viewMat, this.viewPosition, viewMat);

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

        const s = aspect * 0.85;
        const projMat2 = mat4.ortho(-s, s, -s, s, near, far);

        return projMat;
    }

    loadVolumeTexture(): Provider<Promise<GPUTexture>> {
        const width = 256;
        const height = 256;
        const depth = 256;
        const mipLevelCount = 4;
        const format: GPUTextureFormat = 'r8uint';
        const blockLength = 1;
        const bytesPerBlock = 1;
        const dataPath =
            'assets/img/volume/generated.bin.gz';

        const data = this.fetchProvider(dataPath).map(async resp => {
            const response = await resp;
            const dataStream = response.body!.pipeThrough(new DecompressionStream('gzip'));
            return await new Response(dataStream).arrayBuffer();
        });

        return this.gpuDevice.join([data]).map(async ([gpu, dataPromise]) => {
            const data = await dataPromise;

            const texture = gpu.createTexture({
                dimension: "3d",
                size: [width, height, depth],
                format: format,
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
                mipLevelCount
            });

            let offset = 0;
            for (let mipLevel = 0; mipLevel < mipLevelCount; mipLevel++) {
                const mipWidth = width >> mipLevel;
                const mipHeight = height >> mipLevel;
                const mipDepth = depth >> mipLevel;

                const blocksWide = Math.ceil(mipWidth / blockLength);
                const rowsPerImage = Math.ceil(mipHeight / blockLength);
                const bytesPerRow = blocksWide * bytesPerBlock;

                gpu.queue.writeTexture(
                    { texture, mipLevel },
                    data,
                    { offset, bytesPerRow, rowsPerImage },
                    [mipWidth, mipHeight, mipDepth]
                );
                offset += bytesPerRow * rowsPerImage * mipDepth;
            }
            return texture;
        });
    }
}
