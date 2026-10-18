"""Independent CPU reference for the browser adapter v2's crop/mirror/letterbox."""
import math
import cv2
import numpy as np


def prepare_frame(image, hand, manifest):
    height, width = image.shape[:2]
    roi = hand.copy()
    if manifest.get('inputMode') == 'hand-crop':
        side = math.ceil(max(128, (roi['x2']-roi['x1'])*width*1.6, (roi['y2']-roi['y1'])*height*1.6))
        w, h = min(width, side), min(height, side)
        x = max(0, min(width-w, math.floor((roi['x1']+roi['x2'])*width/2-w/2)))
        y = max(0, min(height-h, math.floor((roi['y1']+roi['y2'])*height/2-h/2)))
        image = image[y:y+h, x:x+w]
        roi = dict(x1=(roi['x1']*width-x)/w, x2=(roi['x2']*width-x)/w,
                   y1=(roi['y1']*height-y)/h, y2=(roi['y2']*height-y)/h)
        width, height = w, h
    if manifest.get('mirror', False):
        image = cv2.flip(image, 1)
        roi['x1'], roi['x2'] = 1-roi['x2'], 1-roi['x1']
    size = manifest['inputSize']
    scale = min(size/width, size/height)
    rw, rh = int(width*scale+.5), int(height*scale+.5)
    left, top = (size-rw)//2, (size-rh)//2
    padded = np.full((size, size, 3), 114, np.uint8)
    padded[top:top+rh, left:left+rw] = cv2.resize(image, (rw, rh), interpolation=cv2.INTER_LINEAR)
    prepared_roi = dict(x1=(roi['x1']*width*scale+left)/size, x2=(roi['x2']*width*scale+left)/size,
                        y1=(roi['y1']*height*scale+top)/size, y2=(roi['y2']*height*scale+top)/size)
    return padded, prepared_roi
