export class App {
    presentationFormat: GPUTextureFormat;
    
    device!: GPUDevice;
    
    constructor(presentationFormat: GPUTextureFormat) {
        this.presentationFormat = presentationFormat;
    }

    async createResources(device: GPUDevice) {
        this.device = device;
    }

    destroyResources() {
    }

    resizeFramebuffer(width: number, height: number) {
    }

    update(deltaTime: number) {
    }

    draw(canvasTexture: GPUTexture) {
    }
}