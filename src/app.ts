import { Assets } from "./Assets";

export class App {
    gl!: WebGL2RenderingContext;
    assets!: Assets;

    async createResources(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.assets = new Assets(gl);

        if (!gl.getExtension("EXT_color_buffer_float")) {
            throw new Error("EXT_color_buffer_float is unavailable on this system.");
        }

        let clearColor = 0.33;
        gl.clearColor(clearColor, clearColor, clearColor, 1.0);

        gl.enable(gl.BLEND);
        gl.depthMask(false);
    }

    destroyResources() {
    }

    resizeFramebuffer() {
    }

    update(deltaTime: number) {
    }

    draw() {
    }
}