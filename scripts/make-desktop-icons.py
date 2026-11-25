"""从 brand/wga-logo.png 生成 Tauri / Windows 窗口与任务栏图标。"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"C:\Users\hyt59\git\wga")
SRC = ROOT / "brand" / "wga-logo.png"
OUT = ROOT / "desktop" / "src-tauri" / "icons"


def prepare_base(size: int) -> Image.Image:
    img = Image.open(SRC).convert("RGBA")
    # 居中裁成正方形
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    # 小尺寸略扩内容，避免绿框变成整块色
    if size <= 32:
        pad = int(side * 0.04)
        img = img.crop((pad, pad, side - pad, side - pad))
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    png_sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "256x256.png": 256,
        "icon.png": 512,
        "henry.png": 128,  # 兼容旧引用
    }
    for name, size in png_sizes.items():
        im = prepare_base(size)
        path = OUT / name
        im.save(path, format="PNG")
        print("wrote", path, size)

    # 多分辨率 ICO（Windows 标题栏 / 任务栏关键）
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [prepare_base(s) for s in ico_sizes]
    ico_path = OUT / "icon.ico"
    images[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=images[1:],
    )
    print("wrote", ico_path, ico_sizes)

    # 同步一份到 brand
    brand_ico = ROOT / "brand" / "wga-app.ico"
    images[0].save(
        brand_ico,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=images[1:],
    )
    print("wrote", brand_ico)


if __name__ == "__main__":
    main()
