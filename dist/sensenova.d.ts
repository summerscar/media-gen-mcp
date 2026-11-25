export declare const SENSENOVA_RATIOS: readonly ["1:1", "16:9", "9:16", "2:3", "3:2"];
export type SensovaRatio = (typeof SENSENOVA_RATIOS)[number];
/**
 * Resolve the `size` field the API wants: an exact `WxH` between 512 and 4096,
 * a multiple of 32, ratio no wider than 3:1.
 */
export declare function resolveSize(opts: {
    size?: string;
    resolution?: "2K" | "4K";
    aspectRatio?: SensovaRatio;
}): string;
export type ImageResult = {
    /** Provider CDN URL, valid for 24 hours. */
    url?: string;
    /** Base64 payload when response_format is b64_json. */
    b64?: string;
    size?: string;
    outputFormat?: string;
    usage?: unknown;
};
type CommonOpts = {
    prompt: string;
    size?: string;
    resolution?: "2K" | "4K";
    aspectRatio?: SensovaRatio;
    outputFormat?: "png" | "jpeg" | "webp";
    watermark?: boolean;
    promptExtend?: boolean;
    selfCorrection?: boolean;
};
export declare function generateImage(o: CommonOpts): Promise<ImageResult & {
    requestSize: string;
}>;
/** Editing accepts 1-5 images, each as `{ image_url }` — a bare string array is rejected. */
export declare function editImage(o: CommonOpts & {
    images: string[];
}): Promise<ImageResult & {
    requestSize: string;
}>;
export {};
