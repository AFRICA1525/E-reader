from pathlib import Path
import json, re, sys
from collections import Counter
import pdfplumber, pypdfium2
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1];out=root/'output/pdf';tmp=root/'tmp/pdfs'
profile=json.loads((out/'book.json').read_text(encoding='utf-8'))
reader=PdfReader(out/'java-reader.pdf');doc=pdfplumber.open(out/'java-reader.pdf')
assessment=json.loads((out/'assessment.json').read_text(encoding='utf-8'))
issues=[];by_key={e['key']:e for e in profile['contents']}
assert len(reader.pages)==profile['pageCount']
assert assessment['type']=='multiple-choice'
assert len(assessment['groups'])==10
questions=[q for group in assessment['groups'] for q in group['questions']]
assert [q['number'] for q in questions]==list(range(1,101))
assert all(len(q['options'])==4 for q in questions)
assert all([option[:2] for option in q['options']]==['A)','B)','C)','D)'] for q in questions)
assert set(assessment['answerKey'])==set(map(str,range(1,101)))
assert all(value in 'ABCD' for value in assessment['answerKey'].values())
assert all(float(p.mediabox.width)==480 and float(p.mediabox.height)==680 for p in reader.pages)
assert all(not int(p.get('/Rotate',0)) for p in reader.pages)
links=0;video_links=0;boundaries=[]
for i,p in enumerate(doc.pages):
    if i==0:continue
    chars=[c for c in p.chars if c['top']>36 and c['bottom']<645 and c['text'].strip()]
    bad=[c for c in chars if c['x0']<43 or c['x1']>437 or c['top']<48 or c['bottom']>635]
    if bad:issues.append({'page':i+1,'kind':'bounds','sample':''.join(c['text'] for c in bad)[:160]})
    text=p.extract_text() or ''
    # Publication dates in the supplied bibliography remain historically correct.
    if '2023' in text and not (by_key['references']['page']<=i+1<by_key['appendices']['page']):issues.append({'page':i+1,'kind':'old-year'})
    if '\ufffd' in text or '\x00' in text:issues.append({'page':i+1,'kind':'missing-glyph'})
    for a in reader.pages[i].get('/Annots',[]):
        a=a.get_object()
        if a.get('/Subtype')=='/Link':
            links+=1
            if 'youtube' in str(a.get('/A',{}).get('/URI','')):video_links+=1
for item in profile['contents']:
    if item['depth']==1 and (item['key'].startswith('lecture-') or item['key'].startswith('lab-') or item['key'].startswith('test-group-')):
        p=doc.pages[item['page']-1]
        chars=[c for c in p.chars if c['top']>35 and c['bottom']<645]
        if not chars:issues.append({'page':item['page'],'kind':'empty-heading'})
        # Kicker + heading must begin inside the top portion of a new page.
        if chars and min(c['top'] for c in chars)>85:issues.append({'page':item['page'],'kind':'heading-not-at-top'})
        boundaries.append(item['page'])
assert video_links>=30,video_links
assert not issues,issues
pdfium=pypdfium2.PdfDocument(str(out/'java-reader.pdf'))
# Every page receives a rendered thumbnail for complete visual review.
cols=6;per_sheet=36;cell_w,cell_h=220,334
for start in range(0,len(pdfium),per_sheet):
    count=min(per_sheet,len(pdfium)-start);rows=(count+cols-1)//cols
    sheet=Image.new('RGB',(cols*cell_w,rows*cell_h),'#deded5');draw=ImageDraw.Draw(sheet)
    for j in range(count):
        im=pdfium[start+j].render(scale=.44).to_pil().convert('RGB');im.thumbnail((cell_w-12,cell_h-28))
        x=j%cols*cell_w+(cell_w-im.width)//2;y=j//cols*cell_h+8
        sheet.paste(im,(x,y));draw.text((x,y+im.height+4),str(start+j+1),fill='#183e3c')
    sheet.save(tmp/f'contact-{start//per_sheet+1}.png')
selected=[1,2,by_key['contents']['page'],by_key['lecture-1']['page'],by_key['lecture-7']['page'],by_key['lecture-15']['page'],by_key['lab-15']['page'],by_key['test-group-1']['page'],by_key['test-group-10']['page'],by_key['answer-key']['page'],by_key['conclusion']['page'],by_key['references']['page'],by_key['glossary']['page'],by_key['appendix-b']['page']]
for page in selected:pdfium[page-1].render(scale=1.5).to_pil().save(tmp/f'page-{page}.png')
result={'pages':len(pdfium),'portraitPages':len(pdfium),'testQuestions':100,'testGroups':10,'answerKeyEntries':100,'linkAnnotations':links,'videoLinks':video_links,'newPageTopics':len(boundaries),'issues':issues}
(out/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2));print('Rendered sample pages:',selected)
