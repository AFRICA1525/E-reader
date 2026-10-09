export function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('kk').replace(/\s+/g,' ').trim();
}
export function searchPages(pages, query) {
  const terms=normalizeSearch(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return pages.filter(page=>terms.every(term=>normalizeSearch(page.text).includes(term)));
}
export function initReadingTools({go,current,openContents}) {
  const $=id=>document.getElementById(id), key='java-textbook:2026:bookmarks';
  let bookmarks=[], data, request=0;
  try { const saved=JSON.parse(localStorage.getItem(key)||'[]'); if(Array.isArray(saved)) bookmarks=saved.filter(p=>Number.isInteger(p)&&p>0); } catch {}
  function persist() { try {localStorage.setItem(key,JSON.stringify(bookmarks));} catch { $('toolStatus').textContent='Бұл браузерде бетбелгілерді сақтау мүмкін емес.'; } }
  function pageButton(page,text) {
    const button=document.createElement('button'); button.className='tool-result'; button.textContent=text;
    button.onclick=async()=>{openContents(false);await go(page-1);}; return button;
  }
  function update() {
    const page=current()+1, saved=bookmarks.includes(page);
    $('bookmarkPage').textContent=saved?'★ Бетбелгіні алып тастау':'☆ Осы бетті сақтау';
    $('bookmarkPage').setAttribute('aria-pressed',String(saved));
    $('bookmarkList').replaceChildren();
    for(const p of [...bookmarks].sort((a,b)=>a-b)) {
      const row=document.createElement('div');row.className='bookmark-row';
      const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`${p}-беттегі бетбелгіні жою`);
      remove.onclick=()=>{bookmarks=bookmarks.filter(n=>n!==p);persist();update();};
      row.append(pageButton(p,`${p}-бет`),remove);$('bookmarkList').append(row);
    }
    $('bookmarkEmpty').hidden=bookmarks.length>0;
    if(current()>0) $('continueReading').hidden=true;
  }
  $('bookmarkPage').onclick=()=>{const page=current()+1;bookmarks=bookmarks.includes(page)?bookmarks.filter(p=>p!==page):[...bookmarks,page];persist();update();};
  $('searchForm').onsubmit=async e=>{
    e.preventDefault(); const version=++request, query=$('bookSearch').value.trim();
    $('searchResults').replaceChildren();if(!query){$('toolStatus').textContent='Іздеу сөзін енгізіңіз.';return;}
    $('toolStatus').textContent='Іздеу…';
    try {
      if(!data){const response=await fetch(new URL('./output/pdf/search.json?v=20261009-tools',import.meta.url));if(!response.ok)throw Error();data=await response.json();}
      if(version!==request)return;
      const matches=searchPages(data,query);$('toolStatus').textContent=matches.length?`${matches.length} бет табылды`:'Сәйкес мәтін табылмады.';
      for(const match of matches){
        const pos=normalizeSearch(match.text).indexOf(normalizeSearch(query).split(' ')[0]);
        const snippet=match.text.slice(Math.max(0,pos-45),Math.max(0,pos-45)+180);
        $('searchResults').append(pageButton(match.page,`${match.page}-бет · ${snippet}…`));
      }
    } catch {if(version===request)$('toolStatus').textContent='Іздеу жүктелмеді. Қайта көріңіз.';}
  };
  $('toolsToggle').onclick=()=>{openContents(true);$('bookSearch').focus();};
  return {update,resume(saved,maxPage){
    bookmarks=bookmarks.filter(p=>p<=maxPage);update();
    if(Number.isInteger(saved)&&saved>0&&saved<maxPage){
      $('continueReading').textContent=`${saved+1}-беттен жалғастыру`;$('continueReading').hidden=false;
      $('continueReading').onclick=()=>go(saved);
    }
  }};
}
