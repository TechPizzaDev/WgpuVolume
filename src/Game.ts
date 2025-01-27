import { vec2 } from "gl-matrix";
import { App } from "./App";
import { Framebuffer } from "./gl/Framebuffer";
import { Texture } from "./gl/Texture";

export class Game extends App {
    totalTime: number = 0;

    drawProgram!: WebGLProgram;

    accumBuffer!: Framebuffer;

    drawUniformData = new ArrayBuffer(4 * 8);
    
    drawUniformBuffer!: WebGLBuffer;
    quadArray!: WebGLVertexArrayObject;

    async createResources(gl: WebGL2RenderingContext) {
        super.createResources(gl);

        this.drawProgram = await this.assets.linkProgram(
            "assets/shaders/draw.vert",
            "assets/shaders/draw.frag");

        let drawUniformsLocation = gl.getUniformBlockIndex(this.drawProgram, "DrawUniforms");
        gl.uniformBlockBinding(this.drawProgram, drawUniformsLocation, 0);

        this.drawUniformBuffer = gl.createBuffer();
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.drawUniformBuffer);

        // Quad for draw pass
        this.quadArray = gl.createVertexArray();
        gl.bindVertexArray(this.quadArray);

        let quadPositionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW
        );
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
    }

    destroyResources() {
    }

    resizeFramebuffer() {
        const gl = this.gl;
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        
        gl.viewport(0, 0, w, h);

        this.accumBuffer = new Framebuffer(gl, [
            Texture.tex2D(gl, w, h, gl.RGBA16F),
            Texture.tex2D(gl, w, h, gl.R16F),
        ], Texture.tex2D(gl, w, h, gl.DEPTH_COMPONENT16));
        
        new Int32Array(this.drawUniformData, 0, 2).set(vec2.fromValues(w, h));
    }

    update(deltaTime: number) {
        this.totalTime += deltaTime;
    }

    draw() {
        const gl = this.gl;

        new Float32Array(this.drawUniformData, 16, 1).set([this.totalTime]);
        gl.bufferData(gl.UNIFORM_BUFFER, this.drawUniformData, gl.DYNAMIC_DRAW);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.drawProgram);
        gl.bindVertexArray(this.quadArray);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}