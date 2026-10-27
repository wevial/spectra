// Content for effects that work over something else: an image (or its URL),
// canvas, video or ImageBitmap, uploaded to a texture. Videos re-upload each
// frame via tick().

export type Source = string | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;
type Element = Exclude<Source, string>;

function dims(el: Element) {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
  return { w: el.width, h: el.height };
}

export class SourceTexture {
  readonly texture: WebGLTexture;
  width = 1;
  height = 1;
  /** The content set with set(); null when the effect draws its own. */
  source: Element | null = null;

  /** wrap: what samples past the edge see (lens mirrors, so rays from far off still land on content). */
  constructor(private gl: WebGL2RenderingContext, private wrap: GLenum = gl.CLAMP_TO_EDGE) {
    this.texture = gl.createTexture()!;
  }

  /** Upload any drawable (also used for an effect's own fallback content). */
  upload(el: TexImageSource, w: number, h: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.wrap);
    this.width = w;
    this.height = h;
  }

  /** Swap the content. A string loads as an image URL; null clears it. */
  async set(next: Source | null) {
    if (next == null) {
      this.source = null;
      return;
    }
    let el: Element;
    if (typeof next === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = next;
      await img.decode();
      el = img;
    } else {
      el = next;
      if (el instanceof HTMLImageElement && !el.complete) await el.decode();
    }
    this.source = el;
    if (!(el instanceof HTMLVideoElement)) {
      const d = dims(el);
      this.upload(el, d.w, d.h);
    }
  }

  /** Call once per frame: re-uploads a playing video. */
  tick() {
    const el = this.source;
    if (el instanceof HTMLVideoElement && el.readyState >= 2) this.upload(el, el.videoWidth, el.videoHeight);
  }

  attach(unit: number) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    return unit;
  }

  /**
   * Cover fit into a w×h target: [scaleX, scaleY, offsetX, offsetY] that
   * maps target uv to content uv as uv * scale + offset.
   */
  cover(w: number, h: number): [number, number, number, number] {
    const sa = w / h;
    const ca = this.width / Math.max(this.height, 1);
    return sa > ca
      ? [1, ca / sa, 0, 0.5 - 0.5 * (ca / sa)]
      : [sa / ca, 1, 0.5 - 0.5 * (sa / ca), 0];
  }
}
