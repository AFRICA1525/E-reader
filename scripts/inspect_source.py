from pathlib import Path
import json, re, urllib.request, sys
import pdfplumber
sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
doc = pdfplumber.open(next(root.glob('*.pdf')))
result = []
for n,p in enumerate(doc.pages):
    # The original running title overlaps the first body line: remove only
    # its characters, never the body at the same vertical coordinate.
    chars = p.chars
    header = [c for c in chars if 140 < c['x0'] < 651 and 40 < c['top'] < 50 and ('Bold' in c['fontname'] or c['size'] < 12)]
    ids = set(id(c) for c in header)
    clean = p.filter(lambda o: o.get('object_type') != 'char' or id(o) not in ids)
    for h in range(2):
        x0,x1 = (0,421.26) if h == 0 else (421.26,842.52)
        region = clean.crop((x0,30,x1,540))
        result.append({'source':n+1,'half':h,'text':region.extract_text(x_tolerance=2,y_tolerance=3) or '',
                       'images':[{'x0':im['x0'],'x1':im['x1'],'top':im['top'],'bottom':im['bottom']} for im in region.images]})
(root/'tmp/pdfs/halves.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'tmp/pdfs/halves.txt').write_text('\n\n'.join(f"=== {p['source']}.{p['half']} ===\n{p['text']}" for p in result),encoding='utf-8')
for p in result:
    for line in p['text'].splitlines():
        if re.search(r'Д[Әә]Р[Іі]С|Дәріс|[Зз]ертханалық жұмыс|ҰСЫНЫЛҒАН',line):
            if len(line) < 115: print(p['source'],p['half'],line)
try:
    html = urllib.request.urlopen('https://edu.kstu.kz/course/view.php?id=3204',timeout=25).read().decode()
    (root/'tmp/pdfs/course.html').write_text(html,encoding='utf-8')
    print('VIDEO EMBEDS:',re.findall(r'(?:https?:)?//(?:www\.)?(?:youtube\.com|youtu\.be)[^\s<>"\x27]+',html))
except Exception as e:
    print('COURSE FETCH:',e)
