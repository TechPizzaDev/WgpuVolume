import { Resource } from "./Resource";
import { Texture } from "./Texture";

export type FramebufferAttachment = Texture | {
    texture: Texture;
}

export class Framebuffer extends Resource<WebGLFramebuffer> {
    constructor(
        gl: WebGL2RenderingContext,
        colorAttachments: FramebufferAttachment[],
        depthAttachment?: FramebufferAttachment) {
        super(gl.createFramebuffer());

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._handle);
        gl.activeTexture(gl.TEXTURE0);
        
        const buffers = [];
        for (const ca of colorAttachments) {
            const attachment: number = gl.COLOR_ATTACHMENT0 + buffers.length;
            this.attach(gl, attachment, ca);
            buffers.push(attachment);
        }
        gl.drawBuffers(buffers);

        if (depthAttachment) {
            this.attach(gl, gl.DEPTH_ATTACHMENT, depthAttachment);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private attach(gl: WebGLRenderingContext, attachment: GLenum, fba: FramebufferAttachment) {
        const tex = fba instanceof Texture ? fba : fba.texture;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, tex.target, tex.handle, 0);
    }
}