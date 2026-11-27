"""Build a playable, offline HTML file and a separate editable source archive."""
import argparse
import base64
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=root / "dist")
    out = parser.parse_args().out.resolve()
    out.mkdir(parents=True, exist_ok=True)

    html = (root / "index.html").read_text(encoding="utf-8")
    license_text = (root / "LICENSE").read_text(encoding="utf-8").strip()
    license_comment = "<!--\n" + license_text + "\n-->"
    doctype = re.match(r"\s*<!doctype html>", html, flags=re.I)
    if doctype:
        html = html[:doctype.end()] + "\n" + license_comment + html[doctype.end():]
    else:
        html = license_comment + "\n" + html
    css = (root / "style.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")
    art_file = "assets/terrain.webp"
    encoded = base64.b64encode((root / art_file).read_bytes()).decode("ascii")
    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    for filename in scripts:
        script = (root / filename).read_text(encoding="utf-8")
        if filename == "terrain.js":
            image_value = "'" + art_file + "'"
            if script.count(image_value) != 1:
                raise ValueError("Expected one reference to the terrain bitmap")
            script = script.replace(image_value, "'data:image/webp;base64," + encoded + "'")
        script = re.sub(r"</script", r"<\\/script", script, flags=re.I)
        html = html.replace(f'<script src="{filename}"></script>', "<script>\n" + script + "\n</script>")
    single = out / "echo-wilds.html"
    single.write_text(html, encoding="utf-8", newline="\n")

    files = ["README.md", "LICENSE", ".gitignore", ".gitattributes", ".nojekyll", "docs/preview.jpg",
             "index.html", "style.css", *scripts, art_file, "tools/pack.py"]
    archive = out / "echo-wilds-source.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=7) as z:
        for filename in files:
            z.write(root / filename, "echo-wilds/" + filename)
    with ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError("Source archive failed integrity check")
    print(f"{single.name} ({single.stat().st_size:,} bytes)")
    print(f"{archive.name} ({archive.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
