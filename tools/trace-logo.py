# Логотип из фото: светлая фигура на тёмном фоне → сплошной силуэт → SVG (potrace).
# python3 tools/trace-logo.py фото.png public/logo.svg   (нужны: opencv-python, potracer)
import sys, cv2, numpy as np, potrace

src, out = sys.argv[1], sys.argv[2]
img = cv2.resize(cv2.imread(src, cv2.IMREAD_GRAYSCALE), None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
_, th = cv2.threshold(img, 70, 255, cv2.THRESH_BINARY)
th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)), iterations=2)
cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
top = max(cv2.contourArea(c) for c in cnts)
cnts = [c for c in cnts if cv2.contourArea(c) > 0.002 * top]
mask = np.zeros_like(th)
cv2.drawContours(mask, cnts, -1, 255, cv2.FILLED)  # заливка ажура — сплошная фигура
mask = cv2.threshold(cv2.GaussianBlur(mask, (7, 7), 0), 127, 255, cv2.THRESH_BINARY)[1]
x, y, w, h = cv2.boundingRect(np.vstack(cnts))
mask = mask[y - 6:y + h + 6, x - 6:x + w + 6]

f = lambda v: f"{v:.1f}".rstrip('0').rstrip('.')
d = ''
for c in potrace.Bitmap(mask >= 128).trace(turdsize=50, alphamax=1.0, opticurve=True, opttolerance=0.4):
    d += f"M{f(c.start_point.x)} {f(c.start_point.y)}"
    for s in c.segments:
        d += (f"L{f(s.c.x)} {f(s.c.y)}L{f(s.end_point.x)} {f(s.end_point.y)}" if s.is_corner
              else f"C{f(s.c1.x)} {f(s.c1.y)} {f(s.c2.x)} {f(s.c2.y)} {f(s.end_point.x)} {f(s.end_point.y)}")
    d += 'Z'
H, W = mask.shape
open(out, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="TEMPT"><path fill="#111" fill-rule="evenodd" d="{d}"/></svg>')
