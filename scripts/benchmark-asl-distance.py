"""Deterministic diagnostic, not an accuracy estimate or a camera-distance test."""
import json
from pathlib import Path
import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'public/models/asl/manifest.json').read_text())
size = manifest['inputSize']
reference = json.loads((ROOT / 'docs/testing/asl-model-validation.json').read_text())
options = ort.SessionOptions()
options.intra_op_num_threads = 4
session = ort.InferenceSession(str(ROOT / 'public/models/asl' / manifest['model']), options)
rows = []
for sample in reference['samples']:
    original = cv2.imread(str(ROOT / 'ASL.v2-aslv2.yolo26/test/images' / sample['file']))
    for scene in ['original', 'small-hand-simulation']:
        image = original.copy()
        h, w = image.shape[:2]
        _, cx, cy, bw, bh = map(float, (ROOT / 'ASL.v2-aslv2.yolo26/test/labels' / (Path(sample['file']).stem + '.txt')).read_text().split())
        roi = dict(x1=max(0,cx-bw/2),y1=max(0,cy-bh/2),x2=min(1,cx+bw/2),y2=min(1,cy+bh/2))
        if scene != 'original':
            # Keep the source pixels: simulate a smaller hand by embedding the image
            # into a larger neutral frame. This does not simulate camera blur/noise.
            image = np.full((h * 3, w * 3, 3), 114, np.uint8)
            image[h:2*h, w:2*w] = original
            roi = {key: (value + 1) / 3 for key, value in roi.items()}
            h, w = image.shape[:2]
        for mode in ['full-frame', 'hand-crop']:
            frame = image
            if mode == 'hand-crop':
                # Approximate the camera's padded landmarks with the annotation.
                side = max(128, (roi['x2']-roi['x1'])*w*2.4, (roi['y2']-roi['y1'])*h*2.4)
                cw, ch = min(w, int(np.ceil(side))), min(h, int(np.ceil(side)))
                x = max(0, min(w-cw, int(np.floor((roi['x1']+roi['x2'])*w/2-cw/2))))
                y = max(0, min(h-ch, int(np.floor((roi['y1']+roi['y2'])*h/2-ch/2))))
                frame = image[y:y+ch, x:x+cw]
                box = dict(x1=(roi['x1']*w-x)/cw, x2=(roi['x2']*w-x)/cw,
                           y1=(roi['y1']*h-y)/ch, y2=(roi['y2']*h-y)/ch)
            else:
                box = roi
            fh, fw = frame.shape[:2]
            if manifest.get('mirror', False):
                frame = cv2.flip(frame, 1)
                box = dict(box, x1=1-box['x2'], x2=1-box['x1'])
            scale = min(size/fw, size/fh)
            rw, rh = int(fw*scale+.5), int(fh*scale+.5)
            left, top = (size-rw)//2, (size-rh)//2
            padded = np.full((size, size, 3), 114, np.uint8)
            padded[top:top+rh, left:left+rw] = cv2.resize(frame, (rw, rh))
            tensor = np.ascontiguousarray(padded[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32)/255
            out = session.run(None, {manifest['inputName']: tensor})[0][0]
            chosen = None
            hb = np.array([box['x1']*fw*scale+left, box['y1']*fh*scale+top, box['x2']*fw*scale+left, box['y2']*fh*scale+top])
            for det in sorted(out, key=lambda d: -d[4]):
                inter = max(0, min(det[2],hb[2])-max(det[0],hb[0]))*max(0,min(det[3],hb[3])-max(det[1],hb[1]))
                area = min(max(0,det[2]-det[0])*max(0,det[3]-det[1]),(hb[2]-hb[0])*(hb[3]-hb[1]))
                if area > 0 and inter/area >= .2:
                    chosen = det
                    break
            for threshold in [.75, .5]:
                label = manifest['labels'][int(chosen[5])] if chosen is not None and chosen[4] >= threshold else None
                rows.append(dict(file=sample['file'], expected=sample['expected'], scene=scene, mode=mode, threshold=threshold, letter=label))
summary = []
for scene in ['original', 'small-hand-simulation']:
    for mode in ['full-frame', 'hand-crop']:
        for threshold in [.75, .5]:
            group = [r for r in rows if (r['scene'],r['mode'],r['threshold']) == (scene,mode,threshold)]
            summary.append(dict(scene=scene,mode=mode,threshold=threshold,correct=sum(r['letter']==r['expected'] for r in group),wrong=sum(r['letter'] is not None and r['letter']!=r['expected'] for r in group),rejectedLetters=sum(r['letter'] is None and r['expected'] is not None for r in group),total=len(group)))
report = dict(description=__doc__, modelSha256=manifest['sha256'], inputSize=size, mirror=manifest.get('mirror',False), summary=summary, samples=rows)
(ROOT/f'docs/testing/asl-distance-diagnostic-{size}.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(summary,indent=2))
