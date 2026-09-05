declare module "jpeg-js" {
  export interface JpegDecoded {
    width: number;
    height: number;
    data: Buffer;
  }
  export function decode(
    data: Buffer | Uint8Array,
    opts?: { useTArray?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number },
  ): JpegDecoded;
}

declare module "pngjs" {
  export interface PngDecoded {
    width: number;
    height: number;
    data: Buffer;
  }
  export class PNG {
    constructor(options: { width: number; height: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer | Uint8Array): PngDecoded;
      write(png: PNG): Buffer;
    };
  }
}