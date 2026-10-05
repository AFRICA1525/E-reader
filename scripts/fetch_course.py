from pathlib import Path
import re, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')
html = urllib.request.urlopen('https://edu.kstu.kz/course/view.php?id=3204',timeout=30).read().decode()
Path('tmp/pdfs/course.html').write_text(html,encoding='utf-8')
print('\n'.join(re.findall(r'(?:https?:)?//(?:www\.)?(?:youtube\.com|youtu\.be)[^\s<>"\x27]+',html)))
