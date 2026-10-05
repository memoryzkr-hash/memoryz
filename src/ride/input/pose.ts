import { PoseLandmarker } from '@mediapipe/tasks-vision';
// Served from our own build output, so only the model file comes from the network.
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import type { Landmark } from '../core/controls';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Webcam + MediaPipe pose landmarker. Call `poll()` every animation frame. */
export class PoseTracker {
  readonly video: HTMLVideoElement;
  private landmarker: PoseLandmarker | null = null;
  private lastVideoTime = -1;
  private lastDetectAt = 0;
  latest: Landmark[] | null = null;

  private constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  /** Asks for the camera and loads the model. Throws a user-facing Korean message on failure. */
  static async start(video: HTMLVideoElement, onStatus: (msg: string) => void): Promise<PoseTracker> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 카메라를 지원하지 않아요 (https 주소인지 확인하세요).');
    onStatus('카메라 권한을 요청하는 중…');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') throw new Error('카메라 권한이 거부됐어요. 주소창의 카메라 아이콘에서 허용해 주세요.');
      if (name === 'NotFoundError') throw new Error('카메라를 찾지 못했어요.');
      throw new Error('카메라를 켜지 못했어요.');
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    const tracker = new PoseTracker(video);
    onStatus('자세 인식 모델을 불러오는 중…');
    const fileset = { wasmLoaderPath, wasmBinaryPath };
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      tracker.landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      try {
        tracker.landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('자세 인식 모델을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
      }
    }
    return tracker;
  }

  /**
   * Runs detection when the camera has a new frame.
   * Returns the seconds since the previous detection, or 0 when there was no new frame.
   */
  poll(): number {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2 || v.currentTime === this.lastVideoTime) return 0;
    this.lastVideoTime = v.currentTime;
    const now = performance.now();
    try {
      const result = this.landmarker.detectForVideo(v, now);
      this.latest = result.landmarks[0] ?? null;
    } catch {
      this.latest = null;
    }
    const dt = this.lastDetectAt ? Math.min(0.25, (now - this.lastDetectAt) / 1000) : 1 / 30;
    this.lastDetectAt = now;
    return dt;
  }

  stop(): void {
    (this.video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close();
    this.landmarker = null;
  }
}

export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;
