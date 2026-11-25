from PIL import Image
from pathlib import Path

src = Path(r"C:\Users\hyt59\.cursor\projects\c-Users-hyt59-git-wga\assets\wga-minimap-icon.jpg")
img = Image.open(src).convert("RGBA")
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
img = img.crop((left, top, left + side, top + side))

sizes = {
    Path(r"C:\Users\hyt59\git\wga\addon\WGA\Media\minimap.png"): 64,
    Path(r"C:\Users\hyt59\git\wga\addon\WGA\Media\minimap.tga"): 64,
    Path(r"C:\Users\hyt59\git\wga\brand\wga-minimap.png"): 128,
}

for out, size in sizes.items():
    im = img.resize((size, size), Image.Resampling.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() == ".tga":
        im.save(out, format="TGA")
    else:
        im.save(out, format="PNG")
    print("wrote", out, size)
