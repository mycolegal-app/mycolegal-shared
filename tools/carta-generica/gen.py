import sys
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
d = Document()
for s in d.sections:
    s.page_width, s.page_height = Mm(210), Mm(297)
    s.top_margin = s.bottom_margin = Mm(25)
    s.left_margin = s.right_margin = Mm(20)
    s.header_distance = s.footer_distance = Mm(12)
st = d.styles
n = st['Normal']; n.font.name = 'Calibri'; n.font.size = Pt(11)
n.paragraph_format.space_after = Pt(6); n.paragraph_format.line_spacing = 1.15
n.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
for i, sz in ((1, 14), (2, 12), (3, 11)):
    h = st[f'Heading {i}']; h.font.name = 'Calibri'; h.font.size = Pt(sz); h.font.bold = True
    h.font.color.rgb = RGBColor(0x11, 0x11, 0x11)
    h.paragraph_format.space_before = Pt(12); h.paragraph_format.space_after = Pt(6)
    h.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
st['List Paragraph']
tl = st.add_style('Texto legal', WD_STYLE_TYPE.PARAGRAPH)
tl.base_style = n; tl.font.size = Pt(7.5); tl.font.italic = True
tl.font.color.rgb = RGBColor(0x44, 0x44, 0x44)
tl.paragraph_format.space_after = Pt(3); tl.paragraph_format.line_spacing = 1.0
for nombre, al in (('Datos de la notaría', WD_ALIGN_PARAGRAPH.RIGHT), ('Firma', WD_ALIGN_PARAGRAPH.LEFT)):
    x = st.add_style(nombre, WD_STYLE_TYPE.PARAGRAPH); x.base_style = n
    x.paragraph_format.alignment = al
    if nombre == 'Datos de la notaría':
        x.font.size = Pt(9); x.paragraph_format.space_after = Pt(0)
    else:
        x.paragraph_format.space_before = Pt(18)
import datetime
d.core_properties.created = d.core_properties.modified = datetime.datetime(2026,11,27)
d.core_properties.last_modified_by = ''
d.core_properties.author = ''; d.core_properties.title = 'Carta'; d.core_properties.comments = ''
d.add_paragraph('')
d.save(sys.argv[1])
