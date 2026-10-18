# ASL browser model

This folder contains the team's exported YOLO26n ASL model and manifest.
Input: float32 [1,3,384,384] (default) or [1,3,640,640] (detail profile). Output: end-to-end [1,300,6].
Class IDs 0–25 are A–Z; ID 26 (nothing) maps to null.
To regenerate from the trusted checkpoint, run from the repository root:

```sh
python -m pip install -r ai-server/requirements-export.txt
python scripts/export-asl-onnx.py --model ASL.v2-aslv2.yolo26/asl_runs/yolo26n_asl/weights/best.pt --class-map models/asl-class-map.json --imgsz 384
```

This generates `asl-<hash>.onnx` and `manifest.json` with real class order,
output layout and SHA-256. The two validated ONNX files and their manifests are included in Git and deployment assets.
Other generated models are ignored until explicitly selected for a release.
manifest.json selects 384; manifest-640.json selects 640. Both use crop, mirror and confidence 0.50.
See `ASL-SETUP-TH.md` and `MODEL-REPORT-TH.md` for reproducibility and validation.
