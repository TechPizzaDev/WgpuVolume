import { Resource } from "./Resource";

export class Texture extends Resource<WebGLTexture> {
    private _target: GLenum;

    private constructor(handle: WebGLTexture, target: GLenum) {
        super(handle);
        this._target = target;
    }

    get target(): GLenum {
        return this._target;
    }

    bind(gl: WebGL2RenderingContext) {
        gl.bindTexture(this._target, this._handle);
    }

    static tex2D(
        gl: WebGL2RenderingContext,
        width: number,
        height: number,
        format: GLenum,
        levels: number = 1): Texture {
        let tex = new Texture(gl.createTexture(), gl.TEXTURE_2D);
        tex.bind(gl);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(tex.target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(tex.target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(tex.target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(tex.target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texStorage2D(tex.target, levels, format, width, height);
        return tex;
    }
}
