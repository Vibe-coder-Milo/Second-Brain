"""Makes the small test files used to check Word and PowerPoint import.

Writes sample.docx, sample-plain.docx and sample.pptx into the folder this
script lives in. Everything is fixed (text, picture, dates), so running it
again gives the same content. Run from the repo root:

    python3 tests/fixtures/make_fixtures.py

Needs python-docx, python-pptx and pillow (pip install python-docx python-pptx pillow).
"""

import io
import os
from datetime import datetime

from docx import Document
from docx.shared import Inches as DocxInches
from lxml import etree
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Inches

HERE = os.path.dirname(os.path.abspath(__file__))

# Fixed timestamp so the document properties never change between runs.
FIXED_TIME = datetime(2026, 11, 1, 9, 0, 0)

P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main"
SECTION_EXT_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"

TABLE_ROWS = [
    ["Item", "Quote A", "Quote B"],
    ["Cabinets", "4200", "3900"],
    ["Lighting", "800", "950"],
]


def make_picture_png():
    """A 400x240 PNG: solid #3A7CA5 with a white rectangle in the middle."""
    img = Image.new("RGB", (400, 240), (0x3A, 0x7C, 0xA5))
    draw = ImageDraw.Draw(img)
    draw.rectangle([120, 70, 280, 170], fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def build_sample_docx(path, png):
    doc = Document()
    cp = doc.core_properties
    cp.title = "Kitchen renovation plan"
    cp.author = "Test fixtures"
    cp.last_modified_by = "Test fixtures"
    cp.created = FIXED_TIME
    cp.modified = FIXED_TIME
    cp.revision = 1

    doc.add_paragraph("Kitchen renovation plan", style="Title")

    doc.add_heading("Introduction", level=1)
    p = doc.add_paragraph("The plan keeps the ")
    p.add_run("budget").bold = True
    p.add_run(" in check and the ")
    p.add_run("timeline").italic = True
    p.add_run(" realistic.")
    doc.add_paragraph("The work covers the cabinets, the tap and the lights.")

    doc.add_heading("Background", level=2)
    for item in ["Old cabinets", "Leaking tap", "Poor lighting"]:
        doc.add_paragraph(item, style="List Bullet")

    for item in ["Measure", "Get quotes", "Choose a contractor"]:
        doc.add_paragraph(item, style="List Number")

    doc.add_heading("Quotes", level=1)
    table = doc.add_table(rows=3, cols=3)
    table.style = doc.styles["Table Grid"]
    for r, row in enumerate(TABLE_ROWS):
        for c, value in enumerate(row):
            table.cell(r, c).text = value

    doc.add_picture(io.BytesIO(png), width=DocxInches(3))
    doc.add_paragraph("Floor plan sketch", style="Caption")

    doc.add_page_break()

    doc.add_heading("Next steps", level=1)
    doc.add_paragraph("Book the contractor and confirm the final quote before the end of the month.")

    doc.save(path)


def build_plain_docx(path):
    doc = Document()
    cp = doc.core_properties
    cp.title = "Plain note"
    cp.author = "Test fixtures"
    cp.last_modified_by = "Test fixtures"
    cp.created = FIXED_TIME
    cp.modified = FIXED_TIME
    cp.revision = 1

    doc.add_paragraph("The first paragraph has no heading above it.")
    doc.add_paragraph("The second paragraph is ordinary body text.")
    doc.add_paragraph("The third paragraph ends the note.")
    doc.save(path)


def add_section_list(prs):
    """Adds PowerPoint sections (Opening: slides 1-2, Details: slides 3-4)."""
    slide_ids = [sld_id.id for sld_id in prs.slides._sldIdLst]
    assert len(slide_ids) == 4, slide_ids

    pres = prs.part._element
    ext_lst = pres.find(qn("p:extLst"))
    if ext_lst is None:
        # Appended as the last child of p:presentation.
        ext_lst = etree.SubElement(pres, qn("p:extLst"))

    ext = etree.Element(qn("p:ext"), uri=SECTION_EXT_URI)
    sec_lst = etree.SubElement(ext, "{%s}sectionLst" % P14_NS, nsmap={"p14": P14_NS})

    sections = [
        ("Opening", "{11111111-1111-1111-1111-111111111111}", slide_ids[0:2]),
        ("Details", "{22222222-2222-2222-2222-222222222222}", slide_ids[2:4]),
    ]
    for name, guid, ids in sections:
        sec = etree.SubElement(sec_lst, "{%s}section" % P14_NS, name=name, id=guid)
        ids_lst = etree.SubElement(sec, "{%s}sldIdLst" % P14_NS)
        for sid in ids:
            etree.SubElement(ids_lst, "{%s}sldId" % P14_NS, id=str(sid))

    # The section list goes first so it is found before any other extension.
    ext_lst.insert(0, ext)


def build_sample_pptx(path, png):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    cp = prs.core_properties
    cp.title = "Quarterly review"
    cp.author = "Test fixtures"
    cp.last_modified_by = "Test fixtures"
    cp.created = FIXED_TIME
    cp.modified = FIXED_TIME
    cp.revision = 1

    # Slide 1: title slide.
    s1 = prs.slides.add_slide(prs.slide_layouts[0])
    s1.shapes.title.text = "Quarterly review"
    s1.placeholders[1].text = "November 2026"

    # Slide 2: title and content.
    s2 = prs.slides.add_slide(prs.slide_layouts[1])
    s2.shapes.title.text = "Highlights"
    body = s2.placeholders[1].text_frame
    bullets = ["Revenue up", "Two new clients", "Team grew to 8"]
    body.text = bullets[0]
    for text in bullets[1:]:
        body.add_paragraph().text = text

    # Slide 3: title only, picture and a text box.
    s3 = prs.slides.add_slide(prs.slide_layouts[5])
    s3.shapes.title.text = "Floor plan"
    s3.shapes.add_picture(io.BytesIO(png), Inches(1), Inches(2), width=Inches(5))
    box = s3.shapes.add_textbox(Inches(7), Inches(2), Inches(5), Inches(2))
    box.text_frame.word_wrap = True
    box.text_frame.text = "Kitchen on the left, dining on the right"

    # Slide 4: title only, table.
    s4 = prs.slides.add_slide(prs.slide_layouts[5])
    s4.shapes.title.text = "Numbers"
    gf = s4.shapes.add_table(3, 3, Inches(1), Inches(2), Inches(8), Inches(2))
    table = gf.table
    for r, row in enumerate(TABLE_ROWS):
        for c, value in enumerate(row):
            table.cell(r, c).text = value

    add_section_list(prs)
    prs.save(path)


def main():
    png = make_picture_png()
    build_sample_docx(os.path.join(HERE, "sample.docx"), png)
    build_plain_docx(os.path.join(HERE, "sample-plain.docx"))
    build_sample_pptx(os.path.join(HERE, "sample.pptx"), png)
    for name in ["sample.docx", "sample-plain.docx", "sample.pptx"]:
        print("wrote", os.path.join(HERE, name), os.path.getsize(os.path.join(HERE, name)), "bytes")


if __name__ == "__main__":
    main()
