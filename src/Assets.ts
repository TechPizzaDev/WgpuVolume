export class Assets {
    gl: WebGL2RenderingContext;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
    }

    async fetchShader(type: GLenum, url: RequestInfo | URL): Promise<WebGLShader> {
        const gl = this.gl;
        const shader = gl.createShader(type);
        if (!shader) {
            throw new Error("Failed to create shader.");
        }

        const resp = await fetch(url);
        const text = await resp.text();
        gl.shaderSource(shader, text);

        gl.compileShader(shader);
        const compileLog = gl.getShaderInfoLog(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error("Failed to compile shader: " + compileLog);
        }
        if (compileLog) {
            console.warn("Shader compile log: ", compileLog);
        }
        return shader;
    }

    async linkProgram(
        vert: WebGLShader | RequestInfo | URL,
        frag: WebGLShader | RequestInfo | URL): Promise<WebGLProgram> {
        const gl = this.gl;
        const program = gl.createProgram();

        const vertShader = vert instanceof WebGLShader ?
            vert : await this.fetchShader(gl.VERTEX_SHADER, vert);
        gl.attachShader(program, vertShader);

        const fragShader = frag instanceof WebGLShader ?
            frag : await this.fetchShader(gl.FRAGMENT_SHADER, frag);
        gl.attachShader(program, fragShader);

        const linkLog = gl.getProgramInfoLog(program);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error("Failed to link program: " + linkLog);
        }
        if (linkLog) {
            console.warn("Program link log: ", linkLog);
        }
        return program;
    }
}