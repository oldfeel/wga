"""从主 logo 导出桌面/网页各尺寸图标。用法: python scripts/make-icons.py [logo路径]"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATES = [
    Path(r"C:\Users\hyt59\.cursor\projects\c-Users-hyt59-git-wga\assets\wga-logo-master.png"),
    Path(r"C:\Users\hyt59\.cursor\projects\c-Users-hyt59-git-wga\assets\wga-logo-master.jpg"),
    ROOT / "brand" / "wga-logo.png",
    ROOT / "desktop" / "public" / "wga-logo.png",
]


def load_logo(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def main() -> None:
    if len(sys.argv) > 1:
        src = Path(sys.argv[1])
    else:
        src = next((p for p in DEFAULT_CANDIDATES if p.exists()), None)
    if not src or not src.exists():
        raise SystemExit("logo not found; pass path or place brand/wga-logo.png")

    img = load_logo(src)
    print("logo source:", src)

    brand_dir = ROOT / "brand"
    brand_dir.mkdir(parents=True, exist_ok=True)
    icons_dir = ROOT / "desktop" / "src-tauri" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    desktop_public = ROOT / "desktop" / "public"
    desktop_public.mkdir(parents=True, exist_ok=True)
    web_public = ROOT / "web" / "public"
    web_public.mkdir(parents=True, exist_ok=True)

    # 1) 主 logo（品牌资产）
    master = img.resize((1024, 1024), Image.Resampling.LANCZOS)
    master.save(brand_dir / "wga-logo.png", optimize=True)
    master512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    master512.save(desktop_public / "wga-logo.png", optimize=True)
    master512.save(web_public / "wga-logo.png", optimize=True)
    master512.save(web_public / "favicon.png", optimize=True)
    master512.save(icons_dir / "icon.png", optimize=True)

    # 2) 应用图标尺寸
    for size, name in [
        (32, "32x32.png"),
        (128, "128x128.png"),
        (256, "256x256.png"),
    ]:
        img.resize((size, size), Image.Resampling.LANCZOS).save(
            icons_dir / name, optimize=True
        )
    img.resize((128, 128), Image.Resampling.LANCZOS).save(
        icons_dir / "henry.png", optimize=True
    )

    # 3) ICO
    img.resize((256, 256), Image.Resampling.LANCZOS).save(
        icons_dir / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in (16, 32, 48, 64, 128, 256)],
    )
    img.resize((64, 64), Image.Resampling.LANCZOS).save(
        web_public / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in (16, 32, 48, 64)],
    )

    print("wrote brand/wga-logo.png + desktop/web icons")
    for p in sorted(icons_dir.glob("*")):
        if p.suffix.lower() in {".png", ".ico"}:
            print(f"  {p.name}\t{p.stat().st_size}")


if __name__ == "__main__":
    main()
