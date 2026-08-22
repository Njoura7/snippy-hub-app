import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @techstark/opencv-js's TS types are incomplete (FaceDetectorYN isn't typed
// at all — confirmed empirically, not in its declaration files) even though
// it's present and working at runtime, hence the untyped access below.
import cvModule from "@techstark/opencv-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.resolve(__dirname, "../../assets/face_detection_yunet.onnx");

let cvPromise: Promise<any> | null = null;
let detectorPromise: Promise<any> | null = null;

async function getCv(): Promise<any> {
  cvPromise ??= (async () => {
    const cv = cvModule instanceof Promise ? await cvModule : cvModule;
    if (!cv.Mat) {
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve();
      });
    }
    return cv;
  })();
  return cvPromise;
}

async function getDetector(cv: any, width: number, height: number): Promise<any> {
  detectorPromise ??= (async () => {
    const modelBytes = readFileSync(MODEL_PATH);
    cv.FS.writeFile("yunet.onnx", modelBytes);
    const detector = new cv.FaceDetectorYN("yunet.onnx", "", new cv.Size(width, height));
    // Default is 0.9 — too strict for smaller/angled faces in wide shots
    // (verified empirically: a real two-person wide shot at 640x360 scored
    // 0.90/0.902 at native res, which downscaling had been pushing under 0.9).
    detector.setScoreThreshold(0.6);
    return detector;
  })();
  const detector = await detectorPromise;
  detector.setInputSize(new cv.Size(width, height));
  return detector;
}

/**
 * Runs YuNet (OpenCV's DNN face detector) on one raw RGB24 frame and returns
 * the horizontal center of the largest detected face as a 0-1 fraction of
 * frame width — or null if no face was found. The model and detector
 * instance are cached module-wide (loading the ONNX model per call would be
 * wasteful — this runs once per worker process, not once per frame).
 */
export async function detectFaceCenterFraction(rgbBuffer: Buffer, width: number, height: number): Promise<number | null> {
  const cv = await getCv();
  const detector = await getDetector(cv, width, height);

  const rgbMat = cv.matFromArray(height, width, cv.CV_8UC3, rgbBuffer);
  const bgrMat = new cv.Mat();
  const facesMat = new cv.Mat();

  try {
    cv.cvtColor(rgbMat, bgrMat, cv.COLOR_RGB2BGR); // YuNet expects BGR, like the rest of OpenCV
    detector.detect(bgrMat, facesMat);
    if (facesMat.rows === 0) return null;

    // Largest face wins — the primary on-camera speaker, not a smaller face
    // in the background (e.g. a co-host further from camera).
    let bestRow = 0;
    let bestArea = -1;
    for (let i = 0; i < facesMat.rows; i++) {
      const area = facesMat.floatAt(i, 2) * facesMat.floatAt(i, 3);
      if (area > bestArea) {
        bestArea = area;
        bestRow = i;
      }
    }

    const x = facesMat.floatAt(bestRow, 0);
    const w = facesMat.floatAt(bestRow, 2);
    return (x + w / 2) / width;
  } finally {
    rgbMat.delete();
    bgrMat.delete();
    facesMat.delete();
  }
}
