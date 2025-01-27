export class App {
    gl!: WebGL2RenderingContext;

    createResources(gl: WebGL2RenderingContext) {
        this.gl = gl;

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

    resizeFramebuffer(width: number, height: number) {

    }

    update(deltaTime: number) {
    }

    draw() {
    }
}