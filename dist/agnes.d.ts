export declare const AGNES_RATIOS: readonly ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"];
export type AgnesRatio = (typeof AGNES_RATIOS)[number];
export declare const VIDEO_SIZES: readonly ["720P", "1080P", "1K", "2K"];
/** Defaults only; accepted model ids come from the live /models catalog (see models.ts). */
export declare const AGNES_IMAGE_DEFAULT = "agnes-image-2.5-flash";
export declare const AGNES_VIDEO_DEFAULT = "agnes-video-2.5";
export type AgnesImageOpts = {
    /** Any id from the provider's live /models list; defaults to AGNES_IMAGE_DEFAULT. */
    model?: string;
    prompt: string;
    /** Tier (1K/2K/3K/4K) on 2.1/2.5; exact pixels such as 1024x768 on 2.0. */
    size?: string;
    ratio?: AgnesRatio;
    /** Input images turn the call into an edit; accepted top-level and inside extra_body. */
    images?: string[];
    returnBase64?: boolean;
};
export type AgnesImageResult = {
    url?: string;
    b64?: string;
    taskId?: string;
    requestSize: string;
};
export declare function generateImage(o: AgnesImageOpts): Promise<AgnesImageResult>;
export type AgnesAudioRef = {
    url: string;
};
export type AgnesVideoRef = {
    url: string;
    startSeconds?: number;
    requireAudio?: boolean;
};
export type AgnesVideoOpts = {
    model?: string;
    prompt: string;
    mode: "text" | "keyframe" | "reference";
    /** String, 4-12. Defaults to "5". */
    seconds?: string;
    size?: string;
    aspectRatio?: AgnesRatio;
    seed?: number;
    firstFrame?: string;
    lastFrame?: string;
    images?: string[];
    audios?: string[];
    videos?: AgnesVideoRef[];
};
export declare const VIDEO_LIMITS: {
    referenceImages: number;
    flashReferenceImages: number;
    audios: number;
    videos: number;
    totalFiles: number;
};
export type AgnesVideoTask = {
    videoId: string;
    model: string;
    status?: string;
    seconds?: string;
    size?: string;
};
export declare function createVideo(o: AgnesVideoOpts): Promise<AgnesVideoTask>;
export type AgnesVideoStatus = {
    videoId: string;
    model: string;
    status?: string;
    progress?: number;
    url?: string;
    seconds?: string;
    size?: string;
    error?: unknown;
};
export declare function getVideo(videoId: string, model?: string): Promise<AgnesVideoStatus>;
