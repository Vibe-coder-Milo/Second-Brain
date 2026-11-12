#!/usr/bin/env python3
"""Build a PDF from a Markdown spec, for printing or sharing.

What it does: turns a .md file into an A4 PDF with page numbers and the
document title in the page header. Local .svg and .png/.jpg images are
put inside the PDF, and Mermaid diagrams are shown as their source text
(no rendering, no network).

How to run (from the repository root):

    python3 docs/spec/build_pdf.py "docs/spec/Second Brain - Spec v27.md"
    python3 docs/spec/build_pdf.py input.md output.pdf

Without a second argument the PDF is written next to the Markdown file,
with the same name and a .pdf extension. Needs the `markdown` package
(installed automatically if missing) and Playwright's Chromium, found in
/opt/pw-browsers. It never runs `playwright install`.
"""

import base64
import html
import mimetypes
import os
import re
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

MARKDOWN_EXTENSIONS = ["tables", "fenced_code", "toc", "sane_lists"]
IMAGE_TYPES = {".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"}

CSS = """
@page { size: A4; margin: 18mm; }
:root { color-scheme: light; }
html, body { background: #fff; color: #1d1d1f; }
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.5;
  margin: 0;
}
h1, h2, h3, h4, h5, h6 {
  font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #111;
  line-height: 1.25;
  break-after: avoid;
  page-break-after: avoid;
}
h1 { font-size: 22pt; margin: 0 0 10pt; border-bottom: 2px solid #222; padding-bottom: 4pt; }
h2 { font-size: 16pt; margin: 18pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
h3 { font-size: 13pt; margin: 14pt 0 4pt; }
h4, h5, h6 { font-size: 11pt; margin: 12pt 0 4pt; }
p { margin: 0 0 8pt; orphans: 3; widows: 3; }
a { color: #1a4f9c; text-decoration: none; }
ul, ol { margin: 0 0 8pt 18pt; padding: 0; }
li { margin: 2pt 0; }
blockquote {
  margin: 8pt 0; padding: 4pt 10pt; border-left: 3px solid #bbb; color: #444;
}
hr { border: 0; border-top: 1px solid #ccc; margin: 14pt 0; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 8pt 0 12pt;
  font-size: 10pt;
  font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}
th, td {
  border: 1px solid #999;
  padding: 4pt 6pt;
  text-align: left;
  vertical-align: top;
}
th { background: #e4e8ee; font-weight: 700; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }

code, pre { font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; }
code { font-size: 9.5pt; background: #f1f1f1; padding: 0 2pt; border-radius: 2pt; }
pre {
  background: #f2f2f2;
  border: 1px solid #ddd;
  border-radius: 3pt;
  padding: 7pt 9pt;
  font-size: 8.5pt;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  break-inside: avoid;
  page-break-inside: avoid;
  margin: 8pt 0 12pt;
}
pre code { background: none; padding: 0; font-size: inherit; }

figure { margin: 10pt 0 14pt; break-inside: avoid; page-break-inside: avoid; text-align: center; }
figure img, figure svg, img, svg { max-width: 100%; height: auto; }
figcaption { font-size: 9pt; color: #555; margin-top: 4pt; font-style: italic; }
figure.mermaid-src { text-align: left; }
figure.mermaid-src figcaption { font-style: normal; font-weight: 700; color: #333; margin: 0 0 3pt; }
"""


def ensure_markdown():
    try:
        import markdown  # noqa: F401
    except ImportError:
        print("The 'markdown' package is missing; installing it with pip ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "markdown"])


def image_snippet(path):
    """HTML for a local image: SVG as inline markup, others as a data: URI."""
    if path.suffix.lower() == ".svg":
        text = path.read_text(encoding="utf-8")
        start = text.find("<svg")
        if start == -1:
            return None
        return text[start:]
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f'<img src="data:{mime};base64,{data}" alt="">'


IMG_RE = re.compile(r"<img\b([^>]*?)\bsrc=\"([^\"]+)\"([^>]*)>", re.IGNORECASE)
ALT_RE = re.compile(r"\balt=\"([^\"]*)\"")


def inline_images(body_html, base_dir):
    def replace(match):
        before, src, after = match.group(1), match.group(2), match.group(3)
        target = html.unescape(src)
        if re.match(r"^(https?:|data:|//)", target, re.IGNORECASE):
            return match.group(0)  # remote or already inline: left alone (no network)
        path = (base_dir / target).resolve()
        if path.suffix.lower() not in IMAGE_TYPES or not path.is_file():
            print(f"  warning: image not found, left as link: {target}")
            return match.group(0)
        snippet = image_snippet(path)
        if snippet is None:
            print(f"  warning: could not read SVG, left as link: {target}")
            return match.group(0)
        alt_match = ALT_RE.search(before + after)
        alt = alt_match.group(1) if alt_match else ""
        caption = f"<figcaption>{alt}</figcaption>" if alt.strip() else ""
        return f"<figure>{snippet}{caption}</figure>"

    return IMG_RE.sub(replace, body_html)


MERMAID_RE = re.compile(
    r'<pre><code class="language-mermaid">(.*?)</code></pre>', re.DOTALL
)


def mermaid_as_source(body_html):
    def replace(match):
        return (
            '<figure class="mermaid-src">'
            "<figcaption>Diagram source (Mermaid)</figcaption>"
            f"<pre><code>{match.group(1)}</code></pre>"
            "</figure>"
        )

    return MERMAID_RE.sub(replace, body_html)


def first_title(md_text, fallback):
    for line in md_text.splitlines():
        if line.startswith("# "):
            return line[2:].strip() or fallback
    return fallback


def build_html(md_text, base_dir, title):
    import markdown

    body = markdown.markdown(md_text, extensions=MARKDOWN_EXTENSIONS)
    body = mermaid_as_source(body)
    body = inline_images(body, base_dir)
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
        f"<body>{body}</body></html>"
    )


def header_template(title):
    return (
        '<div style="font-family:system-ui,Helvetica,Arial,sans-serif;font-size:8pt;'
        'color:#666;width:100%;padding:0 18mm;box-sizing:border-box;'
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
        f"{html.escape(title)}</div>"
    )


def footer_template():
    return (
        '<div style="font-family:system-ui,Helvetica,Arial,sans-serif;font-size:8pt;'
        'color:#666;width:100%;padding:0 18mm;box-sizing:border-box;text-align:center;">'
        'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
        "</div>"
    )


def render_pdf(html_text, out_path, title):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.set_content(html_text, wait_until="load")
            page.pdf(
                path=str(out_path),
                format="A4",
                print_background=True,
                display_header_footer=True,
                header_template=header_template(title),
                footer_template=footer_template(),
                margin={"top": "18mm", "right": "18mm", "bottom": "18mm", "left": "18mm"},
            )
        finally:
            browser.close()


def count_pages(pdf_path):
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    return len(PdfReader(str(pdf_path)).pages)


def main(argv):
    if len(argv) < 2 or len(argv) > 3:
        print(__doc__)
        return 2
    src = Path(argv[1]).resolve()
    if not src.is_file():
        print(f"Not a file: {src}")
        return 1
    out = Path(argv[2]).resolve() if len(argv) == 3 else src.with_suffix(".pdf")

    ensure_markdown()
    md_text = src.read_text(encoding="utf-8")
    title = first_title(md_text, src.stem)
    html_text = build_html(md_text, src.parent, title)

    out.parent.mkdir(parents=True, exist_ok=True)
    render_pdf(html_text, out, title)

    pages = count_pages(out)
    size_kb = out.stat().st_size / 1024
    print(f"PDF written: {out}")
    if pages is not None:
        print(f"Pages: {pages} ({size_kb:.0f} KB)")
    else:
        print(f"Size: {size_kb:.0f} KB (install pypdf to count pages)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
