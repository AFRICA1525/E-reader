"""Build the competition edition from the supplied book and authored additions.

Text is extracted in PDF content-stream order, not by cutting the landscape
pages in half. This preserves long code lines crossing the original gutter.
Tables are re-typeset; source figures are rendered in full, never half-cropped.
"""
from pathlib import Path
from docx import Document
from xml.sax.saxutils import escape
import json, re, sys, textwrap
from collections import Counter
from pypdf import PdfReader
import pdfplumber, pypdfium2
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, PageBreak, KeepTogether, Flowable, Image, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents
from book_content import TITLES, LECTURE15, OUTCOMES, GLOSSARY

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'output/pdf'; TMP = ROOT/'tmp/pdfs'
OUT.mkdir(parents=True,exist_ok=True); (TMP/'figures').mkdir(parents=True,exist_ok=True)
SOURCE = next(ROOT.glob('*.pdf'))
NEW = ROOT/'NewPages'
REVISION = '20261008-spreads12'

def document_paragraphs(name):
    return [p.text.strip() for p in Document(NEW/name).paragraphs if p.text.strip()]

front = document_paragraphs('Бастапқы беті 1-3.docx')
FOREWORD = front[front.index('АЛҒЫ СӨЗ')+1:front.index('МАЗМҰНЫ')]
CONCLUSION = document_paragraphs('ҚОРЫТЫНДЫ.docx')[1:]
REFERENCES = document_paragraphs('ПАЙДАЛАНЫЛҒАН ӘДЕБИЕТТЕР.docx')[1:]
test_document = Document(NEW/'Тест тапсырмалар.docx')
TEST_GROUPS = []
for p in test_document.paragraphs:
    text=p.text.strip()
    if re.match(r'^\d+[–-]\d+\.',text):
        TEST_GROUPS.append({'title':text,'questions':[]})
    elif re.match(r'^\d+\.\s',text):
        parts=re.split(r'\n(?=[ABCD]\))',text)
        number=int(re.match(r'\d+',parts[0]).group())
        assert len(parts)==5,(number,parts)
        TEST_GROUPS[-1]['questions'].append({'number':number,'question':re.sub(r'^\d+\.\s*','',parts[0]),'options':[s.strip() for s in parts[1:]]})
ANSWER_KEY={}
for row in test_document.tables[0].rows[1:]:
    cells=[c.text.strip() for c in row.cells]
    for j in range(0,len(cells),2): ANSWER_KEY[int(cells[j])]=cells[j+1]
assert len(TEST_GROUPS)==10 and sum(len(g['questions']) for g in TEST_GROUPS)==100
assert set(ANSWER_KEY)==set(range(1,101))
W,H = 480,680; M = 48; CW = W-2*M
INK=colors.HexColor('#183e3c'); GOLD=colors.HexColor('#ad8747')
PAPER=colors.HexColor('#fbf9f3'); MUTED=colors.HexColor('#72817b')
LINE=colors.HexColor('#dcded4')
for name,file in [('Body','times.ttf'),('BodyBold','timesbd.ttf'),('Sans','arial.ttf'),('SansBold','arialbd.ttf'),('Code','consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='BodyBold',italic='Body',boldItalic='BodyBold')
pdfmetrics.registerFontFamily('Sans',normal='Sans',bold='SansBold',italic='Sans',boldItalic='SansBold')
styles = {
 'body':ParagraphStyle('body',fontName='Body',fontSize=12,leading=17,alignment=TA_JUSTIFY,textColor=colors.HexColor('#263b36'),spaceAfter=7,allowWidows=0,allowOrphans=0),
 'h':ParagraphStyle('h',fontName='SansBold',fontSize=13,leading=18,textColor=INK,spaceBefore=14,spaceAfter=8,keepWithNext=True),
 'title':ParagraphStyle('title',fontName='SansBold',fontSize=25,leading=31,textColor=INK,spaceAfter=15,keepWithNext=True),
 'eyebrow':ParagraphStyle('eyebrow',fontName='SansBold',fontSize=8,leading=12,textColor=GOLD,spaceAfter=12,keepWithNext=True),
 'small':ParagraphStyle('small',fontName='Sans',fontSize=8,leading=11.5,textColor=MUTED,spaceAfter=6),
 'note':ParagraphStyle('note',fontName='Sans',fontSize=9,leading=13.5,textColor=INK,backColor=colors.HexColor('#edf0e6'),borderPadding=10,spaceBefore=7,spaceAfter=17),
 'question':ParagraphStyle('question',fontName='Sans',fontSize=12,leading=16.5,alignment=TA_JUSTIFY,textColor=INK,spaceAfter=3),
 'caption':ParagraphStyle('caption',fontName='Sans',fontSize=6.6,leading=8.8,textColor=MUTED,spaceAfter=7),
 'code':ParagraphStyle('code',fontName='Code',fontSize=8.1,leading=11.4,textColor=INK,backColor=colors.HexColor('#f0f1e9'),borderPadding=8,spaceBefore=5,spaceAfter=8,splitLongWords=1),
 'cell':ParagraphStyle('cell',fontName='Sans',fontSize=8.1,leading=11.3,textColor=INK,spaceAfter=0),
}

VIDEO_META = json.loads((TMP/'video-metadata.json').read_text(encoding='utf-8-sig'))
VIDEOS={v['id']:v for v in VIDEO_META if 'title' in v}
VIDEOS.update({
 'QnXjS2__woI':{'title':'Java программалау тілі / Сабақ #2. Шартты оператор','author':'Школа Пргограмирования'},
 'BwR8B-xyacI':{'title':'Алгоритмдер қазақша | #2 — Сұрыптау алгоритмдері','author':'CodeeKZ — ашық IT сабақтары'},
 '1uvFj9lNWnk':{'title':'Алгоритмдер қазақша | #5 — ArrayList-ті құру','author':'CodeeKZ — ашық IT сабақтары'},
 'l5Sm2Ps6AOg':{'title':'Пайдаланушы функциялары мен процедуралары. Рекурсия','author':'Қашықтан үйрен / Информатика АКТ'},
})
# Reuse a lesson where it covers the actual text of more than one chapter.
VIDEO_MAP = ['0uzIT-woqPk','Oy8iUj-t0ME','J15ZmrZ0eKY','Oy8iUj-t0ME','QnXjS2__woI',
 'BwR8B-xyacI','1cCErm7m9uI','_0wTQlUfyog','l5Sm2Ps6AOg','ymEk7l1pDXk',
 'e2_9PspS438','-FwgqBZ4pzg','Adfis0xegGY','5P1JN5l7saI','5P1JN5l7saI']
VIDEO_NOTES = {
 2:'Java негіздері, айнымалылар және мәлімет типтері.',
 4:'Арифметикалық операциялар бөлімі осы дәріске сәйкес келеді.',
 6:'Сұрыптау алгоритмдері арқылы циклдердің практикалық қолданылуы көрсетіледі.',
 7:'Бастапқы дәріс String және StringBuffer кластарына арналған; видео жолдармен жұмысты толықтырады.',
 8:'Java тілінде матрица құру және көбейту. Рекурсияға қосымша видео төменде берілген.',
 9:'Қазақша видео функциялар мен рекурсия идеясын түсіндіреді; оның синтаксисін Java әдістеріне бейімдеңіз.',
 10:'Жолдарды өңдеу бастапқы дәрістің негізгі мазмұнына сәйкес келеді.',
 12:'Кластар мен объекттер: дәрістегі класс және конструктор бөлімдеріне сәйкес.',
 13:'Java стандартты кітапханалары мен пакеттері туралы қосымша сабақ. MATLAB ортасына арналған ресми материал пайдаланылған әдебиеттерде берілген.',
 15:'№15 зертханалық жұмыстың try/catch және ерекше жағдайлар тақырыбын толықтырады.'
}

class Cover(Flowable):
    def __init__(self): super().__init__(); self.width=CW; self.height=540
    def draw(self):
        c=self.canv
        c.drawImage(str(NEW/'Обновлённая обложка учебника по Java.png'),-M,-84,width=W,height=H)

class Heading(Paragraph):
    def __init__(self,title,key,depth=0,url=None,kicker=None):
        label=escape(title)
        if url: label=f'<link href="{escape(url)}" color="#183e3c">{label}</link>'
        super().__init__(label,styles['title'])
        self.title,self.key,self.depth=title,key,depth

class BookDoc(BaseDocTemplate):
    def __init__(self,path):
        super().__init__(str(path),pagesize=(W,H),leftMargin=M,rightMargin=M,topMargin=56,bottomMargin=50,
                         title='Java тілінде объектіге бағытталған бағдарламалау — 2026',author='Найзағараева А. А.',pageCompression=1)
        self.contents=[]; self.current='JAVA / 2026'; self.pageLabels={}; self.drawn=[]
        frame=Frame(M,50,CW,H-106,id='body',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='book',frames=[frame],onPage=self.page_art))
    def beforeDocument(self): self.contents=[]; self.current='JAVA / 2026'; self.pageLabels={}; self.drawn=[]
    def page_art(self,c,doc):
        c.saveState(); c.setFillColor(PAPER); c.rect(0,0,W,H,fill=1,stroke=0)
        if doc.page>1:
            c.setStrokeColor(LINE); c.setLineWidth(.5); c.line(M,H-34,W-M,H-34); c.line(M,34,W-M,34)
            c.setFillColor(MUTED); c.setFont('Sans',6.6); c.drawString(M,H-25,'JAVA  /  ЭЛЕКТРОНДЫ ОҚУ ҚҰРАЛЫ')
            c.setFillColor(GOLD); c.setFont('SansBold',7); c.drawRightString(W-M,H-25,'2026')
            c.setFillColor(MUTED); c.setFont('Sans',7); c.drawString(M,21,'Найзағараева А. А.')
            c.setFillColor(INK); c.drawRightString(W-M,21,f'{doc.page:03d}')
        c.restoreState()
    def afterFlowable(self,f):
        if isinstance(f,Heading):
            self.canv.bookmarkPage(f.key)
            self.canv.addOutlineEntry(f.title,f.key,level=f.depth,closed=f.depth==0)
            self.notify('TOCEntry',(f.depth,escape(f.title),self.page,f.key))
            item={'title':f.title,'key':f.key,'depth':f.depth,'page':self.page}
            self.contents.append(item); self.current=f.title
        self.pageLabels[self.page]=self.current
        if not isinstance(f,PageBreak): self.drawn.append({'page':self.page,'kind':type(f).__name__})

story=[]
def para(s,style='body'): return Paragraph(escape(s),styles[style])
def addp(s,style='body'): story.append(para(s,style))
def section(title,key,depth=0,url=None,kicker=None):
    if story: story.append(PageBreak())
    if kicker: addp(kicker,'eyebrow')
    story.append(Heading(title,key,depth,url))
def sub(s): addp(s,'h')
def code(s):
    # Wrap lines by their measured glyph width, retaining indentation. A
    # whole short listing stays on one page; long listings split at lines.
    rendered=[]
    for line in s.splitlines():
        line=line.replace('\t','    ')
        indent=len(line)-len(line.lstrip())
        while pdfmetrics.stringWidth(line,'Code',8.1)>CW-20 and len(line)>1:
            cut=len(line)
            while cut>1 and pdfmetrics.stringWidth(line[:cut],'Code',8.1)>CW-20: cut-=1
            break_at=line.rfind(' ',indent+1,cut)
            if break_at>max(indent+1,cut//2): cut=break_at
            rendered.append(line[:cut]); line=' '*min(indent+4,16)+line[cut:].lstrip()
        rendered.append(line)
    # Chunk huge original listings at 32 lines, with continuation labeling.
    for start in range(0,len(rendered),32):
        lines=rendered[start:start+32]
        html='<br/>'.join(escape(l).replace(' ','&#160;') or '&#160;' for l in lines)
        story.append(KeepTogether([Paragraph(html,styles['code'])]))

def video(n):
    vid=VIDEO_MAP[n-1]; v=VIDEOS[vid]; url='https://www.youtube.com/watch?v='+vid
    link=f'<link href="{url}" color="#183e3c"><b>Видеосабақ: {escape(v["title"])}</b></link>'
    note=VIDEO_NOTES.get(n,'Қазақша видеосабақ дәрістің негізгі ұғымдарын толықтырады.')
    story.append(Paragraph(link+'<br/>'+escape(note),styles['note']))
    if n==8:
        story.append(Paragraph('<link href="https://www.youtube.com/watch?v=l5Sm2Ps6AOg" color="#183e3c">Қосымша: функциялар және рекурсия</link>',styles['small']))

HEADER_RE=re.compile(r'JAVA\s+ТІЛІНДЕ\s+О[БЬЪбьъ]*ЕКТІГЕ\s*-\s*БАҒЫТТАЛҒАН\s+БАҒДАРЛАМАЛАУ',re.I)
START_RE=re.compile(r'(?m)^\s*(ДӘРІС\s+(\d+)\.[^\n]*(?:\n(?!\s*(?:Жоспар|\d|[A-Za-z]|Java|Мақсаты))[^\n]+)?|ЗЕРТХАНАЛЫҚ\s+(?:ЖҰМЫС|САБАҚ)\s*№?\s*(\d+(?:\s*-\s*\d+)?)\.?\s*)',re.I)
SOURCE_STATS={'pages':106,'images':0,'tables':0,'lectureChars':Counter(),'labChars':Counter()}
EDITORIAL_NOTES={
 7:'Дәрістің бастапқы «Тізімдер» атауы сақталған. Негізгі мәтін String және StringBuffer арқылы сөз тіркестерімен жұмыс істеуге арналған; білімді бақылау осы мазмұн бойынша құрастырылған.',
 9:'Мәтінде JavaScript функциялары салыстырмалы мысал ретінде кездеседі. Java мен JavaScript — бөлек тілдер. Java әдістерінің дұрыс баламалары мен факториалдың тоқтау шарты қосымшада берілген. «Жиым» — массив; ол Set жиынымен бір ұғым емес.',
 10:'Бұл дәрістің негізгі мазмұны — сөз тіркестерін өңдеу. <string>, assign(), c_str(), string және cout жазылымдары C++ мысалдарына жатады. Java-да String, substring(), indexOf(), equals() және StringBuffer пайдаланылады. Қосымшада Java баламалары берілген.',
 12:'Бастапқы дәріс класс, объект және конструктор ұғымдарын қамтиды. Пакеттер мен компиляция модулі туралы материал №13 зертханалық жұмыста берілген.',
 13:'MATLAB — матрицалық және ғылыми есептеулерге арналған бөлек орта; Simulink — модельдеу пакеті. Java Math класы MATLAB ортасымен бірдей емес. Практикалық салыстыру тапсырмалары осы айырманы ескереді.'
}

def is_code(line):
    return bool(re.search(r'^(?:\d+\s+)?(?:public\b|private\b|protected\b|static\b|class\b|import\b|package\b|#include|int\b|double\b|float\b|boolean\b|char\b|String\b|Scanner\b|System\.|for\s*\(|while\s*\(|if\s*\(|else\b|try\b|catch\b|finally\b|return\b|void\b|function\b|document\.|var\b|printf\b|scanf\b|main\s*\(|cout\b|cin\b|[{}]\s*;?$|//|/\*)',line)) or bool(re.search(r';\s*$|^\w+\s*=|^\w+\[.*?\]\s*=|^</?script',line))

def body_text(text):
    text=HEADER_RE.sub('',text).replace('2023','2026').replace('➢','•').replace('∛','cbrt').replace('✓','•')
    lines=text.splitlines(); paragraph=[]; listing=[]
    def flush_p():
        if paragraph:
            addp(re.sub(r'\s+',' ',' '.join(paragraph)).strip()); paragraph.clear()
    def flush_c():
        if listing: code('\n'.join(listing)); listing.clear()
    for raw in lines:
        line=raw.strip()
        if not line or re.fullmatch(r'\d{1,3}',line):
            if not line: flush_p(); flush_c()
            continue
        if re.fullmatch(r'\[FIGURE:(\d+):(\d+)\]',line):
            flush_p();flush_c(); insert_figure(*map(int,re.findall(r'\d+',line)));continue
        if re.fullmatch(r'\[TABLE:(\d+):(\d+)\]',line):
            flush_p();flush_c(); insert_table(*map(int,re.findall(r'\d+',line)));continue
        if is_code(line):
            flush_p(); listing.append(line);continue
        if listing and (line in ('}',');') or not re.search(r'[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]',line)):
            listing.append(line);continue
        flush_c()
        heading=(line=='Жоспар' or len(line)<85 and (line.endswith('сұрақтар:') or line in ['Түсініктеме','Мысал:','Мысалы:','Тақырып бойынша сұрақтар:','Орындауға арналған тапсырмалар','Жұмысты қорғау сұрақтары','Жұмысты қорғау нәтижесі:'] or re.match(r'^\d+\.\d+\s',line)))
        if heading:
            flush_p(); sub(line);continue
        if re.match(r'^\d+[.)]\s|^[✓•➢–]\s',line): flush_p()
        paragraph.append(line)
        if line.endswith(('.',':','?','!',';')): flush_p()
    flush_p();flush_c()

reader=PdfReader(SOURCE); plumber=pdfplumber.open(SOURCE); rendered=pypdfium2.PdfDocument(str(SOURCE))
FIGURES={}; TABLES={}
def prepare_assets():
    pages=[]
    for i,page in enumerate(plumber.pages):
        figures=[]; tables=[]
        # Preserve ruled data tables with real rows and columns.
        if i+1 in [54,63,69,78,97,98,99]:
            for t in page.find_tables():
                if len(t.rows)>=3 and t.bbox[2]-t.bbox[0]>250:
                    tables.append(t)
        TABLES[i+1]=tables
        for j,im in enumerate(page.images):
            if im['width']<12 or im['height']<12:continue
            # Full bitmap screenshot from the source PDF, avoiding decoding
            # ambiguities in inline masks and preserving diagram labels.
            box=(max(0,im['x0']),max(0,im['top']),min(page.width,im['x1']),min(page.height,im['bottom']))
            scale=2
            image=rendered[i].render(scale=scale).to_pil().crop(tuple(round(v*scale) for v in box))
            path=TMP/'figures'/f'{i+1}-{j}.png';image.save(path)
            figures.append((j,box,path));SOURCE_STATS['images']+=1
        FIGURES[i+1]=figures
        # Keep original content-stream ordering, replacing table body strings
        # with one table token at their first occurrence.
        inserted=set(); pieces=[]
        def visitor(text,cm,tm,font,size):
            if not text:return
            x=tm[4]*cm[0]+tm[5]*cm[2]+cm[4]
            y=tm[4]*cm[1]+tm[5]*cm[3]+cm[5]
            top=page.height-y
            for j,t in enumerate(tables):
                x0,y0,x1,y1=t.bbox
                if x0-2<=x<=x1+2 and y0-3<=top<=y1+3:
                    if j not in inserted:pieces.append(f'\n[TABLE:{i+1}:{j}]\n');inserted.add(j)
                    return
            pieces.append(text)
        reader.pages[i].extract_text(visitor_text=visitor)
        text=''.join(pieces)
        for j in range(len(tables)):
            if j not in inserted:text+=f'\n[TABLE:{i+1}:{j}]\n'
        for j,box,path in figures: text+=f'\n[FIGURE:{i+1}:{j}]\n'
        if i+1==69:
            # Legacy equation glyphs have no Unicode mapping. Preserve the
            # two complete formula tables as sharp portrait-width figures.
            figures=[]
            for j,box in enumerate([(27,174,437,478),(406,49,843,435)]):
                path=TMP/'figures'/f'formula-table-69-{j}.png'
                rendered[i].render(scale=3).to_pil().crop(tuple(round(v*3) for v in box)).save(path)
                figures.append((j,box,path))
            FIGURES[69]=figures
            text='''3. 2-кестеден вариант бойынша тапсырманы алып, шартты операторды қолданып бағдарлама жазу.
4. 3-кестеден вариант бойынша тапсырманы алып, таңдау операторын қолданып бағдарлама жазу. 4-бұтақты таңдау үшін default бөлігі бар нұсқаны қолдану керек.
2-кесте
[FIGURE:69:0]
3-кесте
[FIGURE:69:1]
5. Switch немесе if операторларын қолданып бағдарлама құрыңыз:
1. Айдың реттік нөмірі берілген. Экранға жыл соңына дейін қалған ай санын шығарыңыз.
2. Реттік нөмірмен айдағы күн берілген. Экранға ай соңына дейін қалған күн санын шығарыңыз.
'''
        text=HEADER_RE.sub('',text)
        # All section parsing happens on complete lines, with a stable
        # source record retained for preservation audits.
        pages.append({'source':i+1,'text':text})
    (TMP/'extracted-source.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf-8')
    return pages

def insert_figure(page,n):
    match=next((f for f in FIGURES[page] if f[0]==n),None)
    if not match:return
    _,box,path=match; width=box[2]-box[0];height=box[3]-box[1]
    scale=min(CW/width,420/height,1.1)
    image=Image(str(path),width=width*scale,height=height*scale);image.hAlign='CENTER'
    story.append(KeepTogether([Spacer(1,8),image,Spacer(1,8)]))

def insert_table(page,n):
    t=TABLES[page][n]; rows=t.extract()
    if not rows:return
    if page in [97,98,99]:
        box=t.bbox
        im=rendered[page-1].render(scale=3).to_pil().crop(tuple(round(v*3) for v in box))
        path=TMP/'figures'/f'table-{page}-{n}.png'; im.save(path)
        factor=min(CW/(box[2]-box[0]),480/(box[3]-box[1]))
        image=Image(str(path),width=(box[2]-box[0])*factor,height=(box[3]-box[1])*factor)
        story.extend([Spacer(1,8),image,Spacer(1,10)])
        SOURCE_STATS['tables']+=1
        return
    count=max(len(r) for r in rows)
    # Some source rows include fake narrow fragments at the original gutter.
    # Retain the table's actual column geometry and wrap all cell text.
    source_widths=[]
    for cell in t.rows[0].cells:
        source_widths.append(cell[2]-cell[0] if cell else (t.bbox[2]-t.bbox[0])/count)
    while len(source_widths)<count:source_widths.append(1)
    total=sum(source_widths)
    widths=[CW*w/total for w in source_widths]
    rows=[[Paragraph(escape(re.sub(r'\s+',' ',c or '').replace('2023','2026')),styles['cell']) for c in r]+['']*(count-len(r)) for r in rows]
    table=Table(rows,colWidths=widths,repeatRows=1,splitByRow=1,splitInRow=1,hAlign='LEFT')
    table.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.4,LINE),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7ece3')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    story.extend([Spacer(1,8),table,Spacer(1,10)]);SOURCE_STATS['tables']+=1

def source_sections(source_pages):
    lectures={n:[] for n in range(1,15)}; labs={}; preamble=[]; bibliography=[]
    mode=None; current=None
    for p in source_pages:
        if p['source']<4:continue
        text=p['text']
        # Headings sometimes span two lines; consume uppercase continuation
        # lines only, never a paragraph following the heading.
        tokens=re.split(r'(?m)(^\s*ДӘРІС\s+\d+\.[^\n]*\n|^\s*ЗЕРТХАНАЛЫҚ\s+(?:ЖҰМЫС|САБАҚ)\s*№?\s*\d+(?:\s*-\s*\d+)?\.?\s*\n|^\s*ЗЕРТХАНАЛЫҚ\s+САБАҒЫН\s+ҰЙЫМДАСТЫРУДЫҢ[^\n]*\n|^\s*ҰСЫНЫЛҒАН\s+ӘДЕБИЕТТЕР[^\n]*\n)',text)
        for token in tokens:
            token=token.strip()
            if not token:continue
            if re.match(r'^ДӘРІС\s+\d+\.',token):
                current=int(re.search(r'\d+',token).group());mode='lecture';continue
            if re.match(r'^ЗЕРТХАНАЛЫҚ\s+(?:ЖҰМЫС|САБАҚ)\s*№?\s*\d+',token):
                current=re.search(r'\d+(?:\s*-\s*\d+)?',token).group().replace(' ','');mode='lab';labs.setdefault(current,[]);continue
            if token.startswith('ЗЕРТХАНАЛЫҚ САБАҒЫН ҰЙЫМДАСТЫРУДЫҢ'):mode='preamble';current=None;continue
            if token.startswith('ҰСЫНЫЛҒАН ӘДЕБИЕТТЕР'):mode='references';continue
            if mode=='lecture':lectures[current].append(token)
            elif mode=='lab':labs[current].append(token)
            elif mode=='preamble':preamble.append(token)
            elif mode=='references':bibliography.append(token)
    return lectures,labs,preamble,bibliography

print('Extracting full source text, figures and tables...',flush=True)
source_pages=prepare_assets(); lectures,labs,preamble,bibliography=source_sections(source_pages)
assert len(lectures)==14 and all(lectures.values()),'Missing source lecture'
assert '15' in labs, 'Missing laboratory 15'
for n in lectures:SOURCE_STATS['lectureChars'][n]=sum(map(len,lectures[n]))
for n in labs:SOURCE_STATS['labChars'][n]=sum(map(len,labs[n]))

story.append(Cover())
section('Алғы сөз','foreword',kicker='01 / АЛҒЫ СӨЗ')
for text in FOREWORD:
    addp(text,'small' if text.startswith('Құрастырушы:') else 'body')
section('Оқу нәтижелері','outcomes',kicker='04 / БІЛІМ МЕН ДАҒДЫ')
addp('Пәнді меңгерген студент:')
for i,s in enumerate(OUTCOMES,1):addp(f'{i:02d}. {s}')
section('Мазмұны','contents',kicker='05 / КІТАП КАРТАСЫ')
addp('Бөлім немесе тақырып атауын басып, қажетті бетке өтіңіз.','small')
toc=TableOfContents();toc.levelStyles=[
 ParagraphStyle('toc0',fontName='SansBold',fontSize=9.8,leading=14,textColor=INK,spaceBefore=10,leftIndent=0,rightIndent=26),
 ParagraphStyle('toc1',fontName='Sans',fontSize=9.1,leading=13,textColor=INK,spaceBefore=5,leftIndent=13,rightIndent=26)]
toc.dotsMinLevel=0;story.append(toc)
section('Теориялық бөлім','theory',kicker='06 / ДӘРІСТЕР')
addp('Негізгі бағдарламалау ұғымдарынан объекттер мен ерекше жағдайларды өңдеуге дейінгі 15 тақырып.')
addp('Тақырып атауы мен видеосабақ карточкасы сыртқы видеоға апарады. Кітаптың мазмұны дәрістің бастапқы бетіне апарады.','note')
for n in range(1,15):
    section(f'Дәріс {n}. {TITLES[n-1]}',f'lecture-{n}',1,'https://www.youtube.com/watch?v='+VIDEO_MAP[n-1],f'ДӘРІС {n:02d} / ТЕОРИЯ')
    video(n)
    if n in EDITORIAL_NOTES:addp(EDITORIAL_NOTES[n],'small')
    text='\n'.join(lectures[n])
    # Remove only the continuation of the original all-uppercase title.
    text=re.sub(r'\A(?:[А-ЯӘҒҚҢӨҰҮҺІA-Z ()/.,-]+\n){1,3}(?=Жоспар)', '',text)
    body_text(text)
section(f'Дәріс 15. {TITLES[14]}','lecture-15',1,'https://www.youtube.com/watch?v='+VIDEO_MAP[14],'ДӘРІС 15 / ТЕОРИЯ')
video(15)
for kind,s in LECTURE15:
    if kind=='h':sub(s)
    elif kind=='code':code(s)
    else:addp(s)
section('Практикалық бөлім','practice',kicker='07 / ЗЕРТХАНАЛЫҚ ЖҰМЫСТАР')
addp('Әр жұмыс үшін теориялық дайындық, алгоритм, бағдарлама және орындалу нәтижесі ұсынылады. Бастапқы жұмыс нөмірлері сақталған; №5–6 біріккен жұмыс ретінде беріледі.')
addp('Бастапқы практикалық бөлімде C/C++ және JavaScript тілдерінің салыстырмалы мысалдары бар. Java тіліндегі өзіндік тапсырмалар «Білімді бақылау» бөлімінде, орындалатын үлгілер қосымшада берілген.','small')
body_text('\n'.join(preamble))
for number,text in labs.items():
    section(f'Зертханалық жұмыс №{number}',f'lab-{number}',1,kicker=f'ПРАКТИКА / №{number}')
    body_text('\n'.join(text))
section('Білімді тексеру материалдары','assessment',kicker='08 / БІЛІМДІ ТЕКСЕРУ')
addp('100 тест тапсырмасы · 10 тақырыптық блок · жауап кілті','note')
addp('Әр тапсырмада бір дұрыс жауапты таңдаңыз. Алдымен өз бетіңізше орындаңыз, содан кейін бөлім соңындағы жауап кілтімен салыстырыңыз.')
for group_index,group in enumerate(TEST_GROUPS,1):
    section(group['title'],f'test-group-{group_index}',1,kicker='ТЕСТ ТАПСЫРМАЛАРЫ')
    for q in group['questions']:
        items=[para(f"{q['number']}. {q['question']}",'question')]
        items.extend(para(option,'question') for option in q['options'])
        items.append(Spacer(1,9))
        story.append(KeepTogether(items))
section('Тест тапсырмаларының жауап кілті','answer-key',1,kicker='ЖАУАП КІЛТІ')
rows=[['№','Жауап']*5]
for i in range(1,21):
    row=[]
    for offset in [0,20,40,60,80]:row.extend([str(i+offset),ANSWER_KEY[i+offset]])
    rows.append(row)
table=Table([[para(c,'cell') for c in row] for row in rows],colWidths=[CW/10]*10,repeatRows=1)
table.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.4,LINE),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7ece3')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('ALIGN',(0,0),(-1,-1),'CENTER'),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
story.append(table)
section('Глоссарий','glossary',kicker='09 / ТЕРМИНДЕР')
for term,definition in GLOSSARY.items():
    story.append(KeepTogether([para(term,'h'),para(definition)]))
section('Қорытынды','conclusion',kicker='10 / НЕГІЗГІ ТҰЖЫРЫМДАР')
for text in CONCLUSION:addp(text)
section('Пайдаланылған әдебиеттер тізімі','references',kicker='11 / ДЕРЕККӨЗДЕР')
for i,text in enumerate(REFERENCES,1):
    # Drop only a pasted, truncated filename after an otherwise complete entry.
    text=re.sub(r'\s+JAVA тілінде.*$','',text)
    label=escape(f'{i}. {text}')
    urls=re.findall(r'https?://[^\s]+|www\.[^\s]+',text)
    if urls:
        url=urls[0].rstrip('.,;')
        if url.startswith('www.'):url='https://'+url
        label=f'<link href="{escape(url)}" color="#183e3c">{label}</link>'
    story.append(Paragraph(label,styles['body']))
sub('Қосымша оқу және ресми анықтамалар')
for label,url in [
 ('Oracle / Dev.java. Learn Java: тіл, объекттер, коллекциялар және модульдер','https://dev.java/learn/'),
 ('Oracle. The Java Tutorials: Catching and Handling Exceptions','https://docs.oracle.com/javase/tutorial/essential/exceptions/handling.html'),
 ('Oracle. The Java Tutorials: Collections','https://docs.oracle.com/javase/tutorial/collections/'),
 ('MathWorks. MATLAB documentation','https://www.mathworks.com/help/matlab/'),
 ('КарТУ. Объектіге бағытталған Java бағдарламалау. Қазақша ашық видеокурс','https://edu.kstu.kz/course/view.php?id=3204')
]:
    story.append(Paragraph(f'<link href="{escape(url)}" color="#183e3c">{escape(label)}</link><br/><font size="8" color="#72817b">{escape(url)}</font>',styles['body']))
sub('Қолданылған қазақша видеосабақтар')
for vid in dict.fromkeys(VIDEO_MAP+['l5Sm2Ps6AOg']):
    v=VIDEOS[vid];used=[str(i+1) for i,key in enumerate(VIDEO_MAP) if key==vid]
    url='https://www.youtube.com/watch?v='+vid
    story.append(KeepTogether([Paragraph(f'<link href="{url}" color="#183e3c"><b>{escape(v["title"])}</b></link>',styles['body']),para(v['author']+' · Дәрістер: '+(', '.join(used) or '8, қосымша'),'small'),para(url,'small')]))
addp('Электрондық дереккөздер мен видеолекцияларға жүгіну күні: 05.10.2026. Жаңа сұрақтар мен тапсырмалар бастапқы оқу құралының нақты тақырыптары және осы бөлімдегі ресми анықтамалар негізінде құрастырылды.','small')
section('Қосымшалар','appendices',kicker='12 / КОДТАР МЕН АЛГОРИТМДЕР')
addp('Бұл бөлімдегі Java үлгілері негізгі ұғымдарды қайталау және бастапқы мәтіндегі салыстырмалы тіл мысалдарын Java-ға бейімдеу үшін берілген.')
section('A. Консольдік енгізу және есептеу','appendix-a',1,kicker='ҚОСЫМША A / JAVA')
code('import java.util.Scanner;\n\npublic class Average {\n    public static void main(String[] args) {\n        try (Scanner sc = new Scanner(System.in)) {\n            int a = sc.nextInt();\n            int b = sc.nextInt();\n            int c = sc.nextInt();\n            double result = ((double) a + b + c) / 3;\n            System.out.printf("%.2f%n", result);\n        }\n    }\n}')
addp('Алгоритм: үш санды оқу → қосындыны нақты типке ауыстыру → 3-ке бөлу → нәтижені шығару. 1, 2, 2 енгізуінде 1.67 шығады.')
section('B. Рекурсия және матрица','appendix-b',1,kicker='ҚОСЫМША B / JAVA')
code('public class Algorithms {\n    static long factorial(int n) {\n        if (n < 0 || n > 20) {\n            throw new IllegalArgumentException("n: 0–20");\n        }\n        return n <= 1 ? 1 : n * factorial(n - 1);\n    }\n\n    static int diagonalSum(int[][] matrix) {\n        int sum = 0;\n        for (int i = 0; i < matrix.length; i++) {\n            if (matrix[i].length != matrix.length) {\n                throw new IllegalArgumentException(\n                    "Квадрат матрица қажет");\n            }\n            sum += matrix[i][i];\n        }\n        return sum;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(factorial(5));\n        int[][] m = {{1,2,3},{4,5,6},{7,8,9}};\n        System.out.println(diagonalSum(m));\n    }\n}')
addp('Күтілетін нәтиже: 120 және 15. Факториалға n≤1 базалық жағдайы берілген; long типінің шегіне сай n≤20 шарты қойылған.')
section('C. Жолдар және коллекциялар','appendix-c',1,kicker='ҚОСЫМША C / JAVA')
code('import java.util.*;\n\npublic class TextTools {\n    public static void main(String[] args) {\n        String text = "Айна Java тілін үйренеді";\n        System.out.println(text.replace("Айна", "Асыл"));\n        System.out.println(text.substring(0, 4));\n        System.out.println(text.indexOf("Java"));\n        StringBuffer buffer = new StringBuffer("Java");\n        buffer.append(" 2026");\n        System.out.println(buffer);\n\n        List<Integer> list = new ArrayList<>(\n            Arrays.asList(3, 1, 3, 2, 1));\n        Set<Integer> unique = new LinkedHashSet<>(list);\n        System.out.println(unique);\n\n        Map<String, Integer> counts = new LinkedHashMap<>();\n        for (String word : "java code java".split(" ")) {\n            counts.merge(word, 1, Integer::sum);\n        }\n        System.out.println(counts);\n    }\n}')
addp('Нәтиже: Асыл Java тілін үйренеді; Айна; 5; Java 2026; [3, 1, 2]; {java=2, code=1}. C++ assign() идеясына Java-да айнымалыға меншіктеу, find() идеясына indexOf(), салыстыруға equals() сәйкес келеді.')
section('D. Объект және конструктор','appendix-d',1,kicker='ҚОСЫМША D / JAVA')
code('public class Student {\n    private final String name;\n    private int grade;\n\n    public Student(String name, int grade) {\n        this.name = name;\n        setGrade(grade);\n    }\n\n    public void setGrade(int grade) {\n        if (grade < 0 || grade > 100) {\n            throw new IllegalArgumentException("Баға: 0–100");\n        }\n        this.grade = grade;\n    }\n\n    public String describe() {\n        return name + ": " + grade;\n    }\n\n    public static void main(String[] args) {\n        Student student = new Student("Азат", 85);\n        System.out.println(student.describe());\n    }\n}')
addp('Күтілетін нәтиже: Азат: 85. private өрістер инкапсуляцияны, конструктор объектіні бастапқы күйге келтіруді көрсетеді.')
section('E. №15 жұмысқа тексеру хаттамасы','appendix-e',1,kicker='ҚОСЫМША E / БАҚЫЛАУ')
rows=[['Енгізу','Күтілетін нәтиже'],['1','m[1] = 4'],['2','m[2] = 2'],['0','ArithmeticException өңделеді'],['3','ArrayIndexOutOfBoundsException өңделеді'],['abc','InputMismatchException өңделеді']]
table=Table([[para(c,'cell') for c in r] for r in rows],colWidths=[70,CW-70],repeatRows=1)
table.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,LINE),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7ece3')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));story.append(table)
addp('Әр іске қосуда finally блогының «Өңдеу аяқталды» хабарламасын да тексеріңіз. Хаттаманы нақты нәтижемен, сәйкестік белгісімен және түзету түсіндірмесімен толықтырыңыз.')
sub('Практикалық жұмысты рәсімдеу үлгісі')
for s in ['1. Тақырып және мақсат.','2. Кіріс деректер, шектеулер және күтілетін нәтиже.','3. Алгоритм немесе блок-схема.','4. Бастапқы Java коды.','5. Қалыпты және шекаралық тексерулер кестесі.','6. Қорытынды және кездескен қателердің түсіндірмесі.']:addp(s)

doc=BookDoc(OUT/'java-reader.pdf')
print('Typesetting the book...',flush=True)
doc.multiBuild(story,maxPasses=6)
final=PdfReader(OUT/'java-reader.pdf')
profile={'version':3,'revision':REVISION,'edition':2026,'title':'Java тілінде объектіге бағытталған бағдарламалау','pdf':'./output/pdf/java-reader.pdf','width':W,'height':H,'pageCount':len(final.pages),'contents':doc.contents,'videos':[{'lecture':n,'id':vid,'url':'https://www.youtube.com/watch?v='+vid,**VIDEOS[vid]} for n,vid in enumerate(VIDEO_MAP,1)],'pages':[{'page':i+1,'kind':'page','width':W,'height':H} for i in range(len(final.pages))]}
(OUT/'book.json').write_text(json.dumps(profile,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'assessment.json').write_text(json.dumps({'version':3,'type':'multiple-choice','source':'NewPages/Тест тапсырмалар.docx','groups':TEST_GROUPS,'answerKey':ANSWER_KEY},ensure_ascii=False,indent=2),encoding='utf-8')
(TMP/'source-audit.json').write_text(json.dumps(SOURCE_STATS,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'pages':len(final.pages),'contents':len(doc.contents),'sourceFigures':SOURCE_STATS['images'],'sourceTables':SOURCE_STATS['tables'],'lectures':len(lectures)+1,'labs':list(labs)},ensure_ascii=False),flush=True)
