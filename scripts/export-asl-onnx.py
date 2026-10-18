"""Export trusted Ultralytics ASL detection weights and a verified browser manifest.

Python is used only for preparation. The deployed game runs ONNX in the browser.
"""
import argparse
import ast
import hashlib
import json
import math
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def mapped_labels(names, mapping=None):
    if isinstance(names, dict):
        by_id = {int(k): v for k, v in names.items()}
        if sorted(by_id) != list(range(len(by_id))):
            raise ValueError("Class IDs must be contiguous, beginning with 0")
        names = [by_id[i] for i in range(len(by_id))]
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        raise ValueError("Model must include class names in ID order")
    labels = []
    for name in names:
        if mapping is not None:
            if name not in mapping:
                raise ValueError(f"Missing exact class name in mapping: {name!r}. Map unused classes to null.")
            label = mapping[name]
        else:
            label = name.upper()
        if label is not None and (not isinstance(label, str) or label not in ALPHABET or len(label) != 1):
            raise ValueError(f"Class {name!r} is not A-Z. Supply --class-map with exact names mapped to A-Z or null.")
        labels.append(label)
    if not 5 <= len(labels) <= 256 or len(set(labels) - {None}) < 5:
        raise ValueError("At least five different A-Z letters are required (max 256 classes)")
    return labels


def output_format(shape, classes):
    if len(shape) != 3 or shape[0] != 1 or any(type(n) is not int or n <= 0 for n in shape):
        raise ValueError(f"Expected fixed [1,N,6], [1,4+C,N] or [1,N,4+C], got {shape}")
    formats = []
    if shape[2] == 6:
        formats.append("end2end")
    if shape[1] == classes + 4:
        formats.append("raw-bcn")
    if shape[2] == classes + 4:
        formats.append("raw-bnc")
    if len(formats) != 1:
        raise ValueError(f"Unsupported/ambiguous detection output {shape} for {classes} classes")
    return formats[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--model", type=Path, help="Trusted YOLO detect .pt")
    source.add_argument("--from-onnx", type=Path, help="Existing Ultralytics float32 detect ONNX with names/task metadata")
    parser.add_argument("--output", type=Path, default=ROOT / "public/models/asl")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--raw", action="store_true", help="Request raw head (nms=None); layout is checked after export")
    parser.add_argument("--class-map", type=Path, help='JSON exact class name -> "A".."Z" or null')
    parser.add_argument("--confidence", type=float, default=.5)
    parser.add_argument("--input-mode", choices=["full-frame", "hand-crop"], default="hand-crop")
    parser.add_argument("--no-mirror", action="store_true", help="Disable webcam-style horizontal mirroring")
    parser.add_argument("--iou", type=float, default=.45)
    parser.add_argument("--association-overlap", type=float, default=.2)
    args = parser.parse_args()
    for value, minimum in [(args.confidence, .5), (args.iou, .01), (args.association_overlap, .01)]:
        if not math.isfinite(value) or not minimum <= value <= 1:
            parser.error("Invalid confidence/IoU/association threshold")
    if not 128 <= args.imgsz <= 1280 or args.imgsz % 32:
        parser.error("imgsz must be a multiple of 32 between 128 and 1280")
    path = args.model or args.from_onnx
    if not path.is_file():
        parser.error(f"Model file not found: {path}")
    import onnx

    mapping = json.loads(args.class_map.read_text(encoding="utf-8-sig")) if args.class_map else None
    if mapping is not None and not isinstance(mapping, dict):
        parser.error("class-map must be a JSON object")
    if args.model:
        from ultralytics import YOLO
        model = YOLO(str(args.model))
        if model.task != "detect":
            parser.error("This browser adapter supports detect only, not classify/pose/segment/OBB")
        labels = mapped_labels(model.names, mapping)
        path = Path(model.export(format="onnx", imgsz=args.imgsz, batch=1, dynamic=False,
                                 half=False, simplify=False, opset=17, nms=None if args.raw else False))
    graph = onnx.load(str(path), load_external_data=False)
    onnx.checker.check_model(graph)
    if any(t.data_location == onnx.TensorProto.EXTERNAL for t in graph.graph.initializer):
        raise ValueError("External tensor data is not supported; export a single-file ONNX model")
    metadata = {p.key: p.value for p in graph.metadata_props}
    if args.from_onnx:
        if metadata.get("task") != "detect":
            raise ValueError("Existing ONNX must declare Ultralytics task=detect metadata")
        labels = mapped_labels(ast.literal_eval(metadata.get("names", "None")), mapping)
    if len(graph.graph.input) != 1 or len(graph.graph.output) != 1:
        raise ValueError("Expected exactly one input and one output")
    inp, out = graph.graph.input[0], graph.graph.output[0]
    if any(v.type.tensor_type.elem_type != onnx.TensorProto.FLOAT for v in (inp, out)):
        raise ValueError("Input and output must be float32")
    shape = lambda v: [int(d.dim_value) if d.HasField("dim_value") else None for d in v.type.tensor_type.shape.dim]
    input_shape = shape(inp)
    if len(input_shape) != 4 or input_shape[:2] != [1, 3] or input_shape[2] != input_shape[3] or input_shape[2] is None:
        raise ValueError(f"Expected fixed square float32 NCHW input, got {input_shape}")
    size = input_shape[2]
    if not 128 <= size <= 1280 or size % 32:
        raise ValueError("Model input size must be a multiple of 32 between 128 and 1280")
    layout = output_format(shape(out), len(labels))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    args.output.mkdir(parents=True, exist_ok=True)
    filename = f"asl-{digest[:16]}.onnx"
    destination = args.output / filename
    if path.resolve() != destination.resolve():
        shutil.copyfile(path, destination)
    manifest = dict(schema=1, model=filename, sha256=digest, task="detect", inputSize=size,
                    inputName=inp.name, outputName=out.name, outputFormat=layout, labels=labels,
                    confidence=args.confidence, iou=args.iou, associationOverlap=args.association_overlap,
                    inputMode=args.input_mode, mirror=not args.no_mirror)
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Model: {destination}\nInput: {input_shape}\nOutput: {shape(out)} ({layout})")
    print(f"Letters: {', '.join(l for l in ALPHABET if l in labels)}\nManifest: {args.output / 'manifest.json'}")
    print("J/Z are image classes only; this adapter does not validate their motion.")
    if destination.stat().st_size > 25 * 1024 * 1024:
        print("Model exceeds 25 MiB: host it on R2/CDN with CORS and set manifest.model to its HTTPS URL. Remove the large copy from public before deploying Worker assets.")


if __name__ == "__main__":
    main()
