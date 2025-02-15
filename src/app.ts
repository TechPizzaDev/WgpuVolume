import { CachingProvider, JoinProvider, ValueProvider, type InferredProviders, type Provider, type ProviderArray } from "./Provider";

type RenderModuleProviders = {
    vertex: Provider<Promise<GPUShaderModule>>;
    fragment?: Provider<Promise<GPUShaderModule>>;
};

export type PresentationDescriptor = {
    width: number;
    height: number;
    format: GPUTextureFormat;
};

export abstract class App {
    readonly gpuDevice: Provider<GPUDevice>;
    readonly presentation: Provider<PresentationDescriptor>;

    private providers = new Map<string, CachingProvider<any>>();

    constructor(
        gpuDevice: Provider<GPUDevice>,
        presentation: Provider<PresentationDescriptor>) {
        this.gpuDevice = gpuDevice;
        this.presentation = presentation;
    }

    abstract update(deltaTime: number): Promise<void>;

    /**
     * Draw the scene.
     * @param canvasTexture
     *  The swapchain target texture. 
     *  Must be retrieved after all awaits since returning control to browser destroys it. 
     */
    abstract draw(canvasTexture: Provider<GPUTexture>): Promise<void>;

    reloadAsset(fullPath: string) {
        const asset = this.providers.get(fullPath);
        if (asset) {
            asset.invalidate();
        }
    }

    fetchProvider(url: string | URL | Request): CachingProvider<Promise<Response>> {
        let actualUrl;
        if (url instanceof URL) {
            actualUrl = url;
        } else if (url instanceof Request) {
            actualUrl = new URL(url.url);
        } else {
            actualUrl = new URL(url, window.location.href);
        }
        let fullPath = actualUrl.pathname;
        if (fullPath.startsWith("/")) {
            fullPath = fullPath.substring(1);
        }

        const provider = new ValueProvider(url).map(url => fetch(url));
        this.providers.set(fullPath, provider);
        return provider;
    }

    fetchShader(name: string): CachingProvider<Promise<GPUShaderModule>> {
        const resp = this.fetchProvider("assets/shaders/" + name);
        return this.gpuDevice.join([resp]).map(async ([gpu, resp]) => {
            let code = await (await resp).text();
            return gpu.createShaderModule({ code });
        });
    }

    createRenderPipeline<A extends ProviderArray>(
        modules: Provider<Promise<GPUShaderModule>> | RenderModuleProviders,
        providers: A,
        descFactory: (args: [GPUShaderModule, GPUShaderModule?, ...InferredProviders<A>]) => GPURenderPipelineDescriptor
    ): CachingProvider<Promise<GPURenderPipeline>> {
        let vert;
        let frag;
        if ("vertex" in modules) {
            vert = modules.vertex;
            frag = modules.fragment;
        } else {
            vert = modules;
            frag = modules;
        }

        return new JoinProvider([this.gpuDevice, vert, frag, ...providers])
            .map(async (args) => {
                const gpu = args[0];
                const vert = await args[1];
                const frag = await args[2];

                const desc = descFactory([vert, frag, ...args.slice(3) as InferredProviders<A>]);
                return gpu.createRenderPipelineAsync(desc);
            });
    }
}