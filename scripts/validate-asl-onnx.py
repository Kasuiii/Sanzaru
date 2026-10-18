"""Compare the supplied YOLO26 checkpoint and browser ONNX on a fixed test subset.

No camera or network. Writes prepared PNGs under .sites-runtime for browser parity
tests; only the JSON report belongs in the release documentation.
"""
import argparse
import hashlib
import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from asl_preprocessing import prepare_frame

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".sites-runtime/ultralytics"))
os.environ.setdefault("YOLO_AUTOINSTALL", "false")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=ROOT / "ASL.v2-aslv2.yolo26/asl_runs/yolo26n_asl/weights/best.pt")
    parser.add_argument("--dataset", type=Path, default=ROOT / "ASL.v2-aslv2.yolo26/test")
    parser.add_argument("--per-class", type=int, default=2)
    args = parser.parse_args()
    if args.per_class < 1:
        parser.error("per-class must be positive")
    import cv2
    import numpy as np
    import onnxruntime as ort
    import torch
    import ultralytics
    from ultralytics import YOLO
    from ultralytics.nn.modules import Detect

    manifest_path = ROOT / "public/models/asl/manifest.json"
    manifest = json.loads(manifest_path.read_text())
    assert manifest["outputFormat"] == "end2end", "This parity check is for the supplied YOLO26 end-to-end head"
    onnx_path = manifest_path.parent / manifest["model"]
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    assert digest(onnx_path) == manifest["sha256"]
    size = manifest["inputSize"]
    labels = manifest["labels"]
    selected = [[] for _ in labels]
    counts = [0 for _ in labels]
    for path in sorted((args.dataset / "labels").glob("*.txt")):
        rows = [line.split() for line in path.read_text().splitlines() if line.strip()]
        if len(rows) != 1 or len(rows[0]) != 5:
            continue
        class_id = int(rows[0][0])
        counts[class_id] += 1
        if len(selected[class_id]) < args.per_class:
            candidates = sorted((args.dataset / "images").glob(path.stem + ".*"))
            if candidates:
                selected[class_id].append((candidates[0], [float(x) for x in rows[0][1:]]))
    assert all(len(group) == args.per_class for group in selected), "Insufficient single-object test images in a class"

    # Match the exporter's fused FP32, NMS-free head. The identical tensor is
    # passed into both engines; no independent predict() preprocessing involved.
    torch.set_num_threads(4)
    network = YOLO(str(args.model)).model.cpu().float().eval()
    network.end2end = True
    network.fuse(verbose=False)
    for module in network.modules():
        if isinstance(module, Detect):
            module.export = True
            module.format = "onnx"
            module.dynamic = False
            module.max_det = 300
            module.agnostic_nms = False
            module.xyxy = False
            module.shape = None
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(onnx_path), options, providers=["CPUExecutionProvider"])
    fixture_dir = ROOT / ".sites-runtime/asl-validation"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    results, failures, max_box, max_score = [], [], 0.0, 0.0
    for class_id, group in enumerate(selected):
        for index, (path, annotation) in enumerate(group):
            image = cv2.imread(str(path))
            cx, cy, bw, bh = annotation
            # Approximate padded landmarks, not a real MediaPipe observation.
            roi = dict(x1=max(0, cx - bw * .75), y1=max(0, cy - bh * .75), x2=min(1, cx + bw * .75), y2=min(1, cy + bh * .75))
            padded, prepared_roi = prepare_frame(image, roi, manifest)
            tensor = np.ascontiguousarray(padded[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255
            with torch.inference_mode():
                pt = network(torch.from_numpy(tensor)).numpy()
            start = perf_counter()
            output = session.run([manifest["outputName"]], {manifest["inputName"]: tensor})[0]
            elapsed = (perf_counter() - start) * 1000
            a, b = pt[0][pt[0, :, 4] >= manifest["confidence"]], output[0][output[0, :, 4] >= manifest["confidence"]]
            passed = a.shape == b.shape
            if passed and len(a):
                box_error = float(np.max(np.abs(a[:, :4] - b[:, :4])))
                score_error = float(np.max(np.abs(a[:, 4] - b[:, 4])))
                max_box, max_score = max(max_box, box_error), max(max_score, score_error)
                passed = np.array_equal(a[:, 5], b[:, 5]) and box_error <= .02 and score_error <= .0001
            if not passed:
                failures.append(path.name)
            chosen = None
            for detection in b:
                x1, y1, x2, y2 = np.clip(detection[:4] / size, 0, 1)
                intersection = max(0, min(x2, prepared_roi["x2"]) - max(x1, prepared_roi["x1"])) * max(0, min(y2, prepared_roi["y2"]) - max(y1, prepared_roi["y1"]))
                area = min(max(0, x2-x1)*max(0, y2-y1), (prepared_roi["x2"]-prepared_roi["x1"])*(prepared_roi["y2"]-prepared_roi["y1"]))
                if area > 0 and intersection / area >= manifest["associationOverlap"]:
                    chosen = detection
                    break
            letter = labels[int(chosen[5])] if chosen is not None else None
            confidence = float(chosen[4]) if chosen is not None and letter else 0
            filename = f"{class_id:02}-{index}.png"
            cv2.imwrite(str(fixture_dir / filename), padded)
            results.append(dict(file=path.name, imageSha256=digest(path), prepared=filename,
                                expected=labels[class_id], classId=class_id, hand=roi, preparedHand=prepared_roi,
                                letter=letter, confidence=confidence, parity=bool(passed), cpuMs=round(elapsed, 2)))
            print(f"{class_id:02}/{index}: expected={labels[class_id]} predicted={letter} confidence={confidence:.4f} parity={passed}", flush=True)

    report = dict(createdAt=datetime.now(timezone.utc).isoformat(),
                  description=f"First {args.per_class} single-object annotated test images per class in filename order; annotation hand ROI, no MediaPipe/camera. Not mAP or a full-dataset accuracy estimate.",
                  versions=dict(python=platform.python_version(), torch=torch.__version__, ultralytics=ultralytics.__version__, onnxruntime=ort.__version__),
                  sourceCheckpoint=os.path.relpath(args.model.resolve(), ROOT).replace(os.sep, "/"), sourceSha256=digest(args.model),
                  model=manifest["model"], modelSha256=digest(onnx_path), modelBytes=onnx_path.stat().st_size, manifest=manifest,
                  inputShape=session.get_inputs()[0].shape, outputShape=session.get_outputs()[0].shape,
                  eligibleSingleObjectCounts=counts, tested=len(results), parityPassed=len(results)-len(failures),
                  sampleLabelsCorrect=sum(row["letter"] == row["expected"] for row in results),
                  maxRetainedBoxErrorPixels=max_box, maxRetainedConfidenceError=max_score,
                  tolerances=dict(boxPixels=.02, confidence=.0001), failures=failures, samples=results)
    report_path = ROOT / "docs/testing/asl-model-validation.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Report: {report_path}; parity {report['parityPassed']}/{report['tested']}; sample labels {report['sampleLabelsCorrect']}/{report['tested']}")
    if failures:
        raise SystemExit("PyTorch/ONNX parity failed")


if __name__ == "__main__":
    main()
