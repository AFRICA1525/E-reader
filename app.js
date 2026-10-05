import * as pdfjs from './vendor/pdf.mjs';
import {makeCurl,paintCurl,finishCurl,prepareCurl} from './curl.js';
import {attachPageLinks} from './pdf-links.js';
import {preparePageSound,playPageSound} from './page-sound.js';

pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';
const $ = id => document.getElementById(id);
let pdf, profile, pages = [], index = 0, zoom = 1, busy = false, renderVersion = 0;
let gesture = null, curl = null, suppressClickUntil = 0, resizeTimer, warmTimer;
const cache = new Map(), pending = new Map();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const positionKey = 'java-textbook:2026:position';
function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('show'), 3000);
}
function sound() { if (!reducedMotion()) playPageSound(); }
function savePosition() { try { localStorage.setItem(positionKey, String(index)); } catch {} }
function layout(i = index) {
  const entries = pages.slice(i, i + 2), stage = $('stage');
  const width = Math.max(80, stage.clientWidth - (innerWidth < 600 ? 4 : 60));
  const height = Math.max(80, stage.clientHeight - (innerWidth < 600 ? 16 : 40));
  const scale = Math.min(width / (profile.width * 2), height / profile.height) * zoom;
  return {entries, scale, ratio: Math.min(devicePixelRatio || 1, 2)};
}
async function canvasFor(entry, width) {
  const key = `${entry.source}:${Math.round(width)}`;
  let source = cache.get(key);
  if (!source) {
    if (!pending.has(key)) pending.set(key, (async () => {
      const page = await pdf.getPage(entry.source);
      const viewport = page.getViewport({scale: width / entry.width});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({canvasContext: canvas.getContext('2d'), viewport, background: '#fbf9f3'}).promise;
      cache.set(key, canvas);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      return canvas;
    })());
    try { source = await pending.get(key); } finally { pending.delete(key); }
  }
  const copy = document.createElement('canvas');
  copy.width = source.width; copy.height = source.height; copy.dataset.cacheKey = key;
  copy.getContext('2d').drawImage(source, 0, 0); return copy;
}
function updateNavigation(entries) {
  $('pageInput').value = index + 1; $('pageInput').max = pages.length;
  $('pageTotal').textContent = `${entries.length > 1 ? '– ' + (index + 2) : ''} / ${pages.length}`;
  $('prev').disabled = index === 0; $('next').disabled = index + 2 >= pages.length;
  $('progressFill').style.width = `${(index + entries.length) / pages.length * 100}%`;
  const current = [...profile.contents].reverse().find(item => item.page <= index + entries.length);
  $('chapterLabel').textContent = current?.title || profile.title;
  document.querySelectorAll('.contents-entry').forEach(button => {
    const active = button.dataset.key === current?.key;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
  });
  savePosition();
}
async function render(direction = 0) {
  if (!pdf) return;
  const version = ++renderVersion, book = $('book'), {entries, scale, ratio} = layout();
  const canvases = await Promise.all(entries.map(async entry => {
    const canvas = await canvasFor(entry, Math.min(2600, entry.width * scale * ratio));
    canvas.style.width = `${entry.width * scale}px`; canvas.style.height = `${entry.height * scale}px`;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Кітаптың ${entry.source}-беті`);
    return canvas;
  }));
  if (version !== renderVersion) return;
  let turning = curl;
  if (direction && !reducedMotion() && zoom === 1 && !turning) turning = makeCurl(book, direction);
  book.replaceChildren(...canvases);
  if (canvases.length === 1) {
    const blank = document.createElement('div'); blank.className = 'blank-page';
    blank.style.cssText = `width:${profile.width * scale}px;height:${profile.height * scale}px`; book.append(blank);
  }
  if (turning) {
    book.append(turning.canvas); await finishCurl(turning, 1, sound); curl = null;
  } else if (direction) sound();
  if (version !== renderVersion) return;
  await attachPageLinks(pdf, pages, entries, canvases, book, () => version === renderVersion, target => go(target));
  updateNavigation(entries);
  clearTimeout(warmTimer);
  warmTimer = setTimeout(async () => {
    prepareCurl();
    for (const target of [index + 2, index - 2]) {
      if (version !== renderVersion || target < 0 || target >= pages.length) continue;
      const next = layout(target);
      for (const entry of next.entries) {
        if (version !== renderVersion) return;
        try { await canvasFor(entry, Math.min(2600, entry.width * next.scale * next.ratio)); } catch {}
      }
    }
  }, 100);
}
async function go(target, direction = 0) {
  if (!pdf || busy || !Number.isFinite(target)) return;
  const next = Math.floor(Math.max(0, Math.min(pages.length - 1, target)) / 2) * 2;
  if (next === index) return;
  busy = true;
  const previous = index;
  try {
    index = next; zoom = 1; updateZoom(); $('stage').scrollTo(0, 0);
    await render(direction);
  } catch (error) {
    console.error(error); index = previous;
    try { await render(); } catch {}
    toast('Бетті көрсету мүмкін болмады. Қайта көріңіз.');
  } finally { busy = false; }
}
function setContents(open) {
  $('sidebar').hidden = !open; $('sideToggle').setAttribute('aria-expanded', String(open));
  requestAnimationFrame(() => render().catch(console.error));
  if (open) $('closeSide').focus(); else $('sideToggle').focus();
}
function buildContents() {
  const content = $('sideContent'); content.replaceChildren();
  for (const item of profile.contents) {
    const button = document.createElement('button');
    button.className = `contents-entry depth-${item.depth}`; button.dataset.key = item.key;
    const label = document.createElement('span'), page = document.createElement('span');
    label.className = 'label'; label.textContent = item.title; page.className = 'page'; page.textContent = item.page;
    button.append(label, page); button.onclick = async () => {
      if (busy) return;
      if (innerWidth <= 900) { $('sidebar').hidden = true; $('sideToggle').setAttribute('aria-expanded', 'false'); }
      await go(item.page - 1); await render();
    };
    content.append(button);
  }
}
function updateZoom() {
  document.body.classList.toggle('zoomed', zoom > 1);
  $('zoomToggle').setAttribute('aria-pressed', String(zoom > 1));
  $('zoomToggle').querySelector('span').textContent = zoom > 1 ? 'Қалыпты көрініс' : 'Үлкейту';
}
async function toggleZoom(point) {
  if (!pdf || busy) return;
  const box = $('book').getBoundingClientRect();
  const x = point ? (point.clientX - box.left) / box.width : .5;
  const y = point ? (point.clientY - box.top) / box.height : .3;
  zoom = zoom === 1 ? (innerWidth < 600 ? 2.8 : 1.6) : 1; updateZoom();
  try {
    await render();
    if (zoom > 1) $('stage').scrollTo(Math.max(0, x * $('book').offsetWidth - $('stage').clientWidth / 2), Math.max(0, y * $('book').offsetHeight - $('stage').clientHeight / 2));
    else $('stage').scrollTo(0, 0);
  } catch (error) { console.error(error); toast('Үлкейту мүмкін болмады.'); }
}
async function loadBook() {
  $('error').hidden = true; $('loading').hidden = false;
  try {
    const response = await fetch(new URL('./output/pdf/book.json', import.meta.url));
    if (!response.ok) throw Error('Кітап мазмұны табылмады.');
    profile = await response.json();
    const file = await fetch(new URL(profile.pdf, import.meta.url));
    if (!file.ok) throw Error('Кітаптың PDF файлы табылмады.');
    pdf = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise;
    pages = Array.from({length: pdf.numPages}, (_, i) => ({source: i + 1, half: null, width: profile.width, height: profile.height}));
    let saved = 0; try { saved = Number(localStorage.getItem(positionKey)) || 0; } catch {}
    index = Math.floor(Math.max(0, Math.min(pages.length - 1, saved)) / 2) * 2;
    buildContents(); await render();
  } catch (error) {
    console.error(error); $('errorText').textContent = `${error.message} Сайтты HTTP-сервер арқылы ашыңыз және output/pdf папкасын тексеріңіз.`;
    $('error').hidden = false;
  } finally { $('loading').hidden = true; }
}
$('prev').onclick = () => go(index - 2, -1); $('next').onclick = () => go(index + 2, 1);
$('pageInput').onchange = async e => { const target = Number(e.target.value); if (target >= 1) await go(target - 1); e.target.value = index + 1; };
$('pageInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('pageInput').onchange(e); } };
$('sideToggle').onclick = () => setContents($('sidebar').hidden); $('closeSide').onclick = () => setContents(false);
$('zoomToggle').onclick = () => toggleZoom(); $('retry').onclick = loadBook;
document.querySelector('.brand').onclick = e => { e.preventDefault(); go(0); };
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('Толық экран бұл браузерде қолжетімсіз.'); }
};
document.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 2, 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 2, -1); }
  if (e.key === 'Home') { e.preventDefault(); go(0); }
  if (e.key === 'End') { e.preventDefault(); go(pages.length - 1); }
  if (e.key.toLowerCase() === 'f') $('fullscreen').click();
  if (e.key === 'Escape') { if (!$('sidebar').hidden) setContents(false); if (zoom > 1) toggleZoom(); }
});
document.addEventListener('pointerdown', preparePageSound, {passive: true});
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!busy && !gesture) render().catch(console.error); }, 150); });
$('stage').addEventListener('pointerdown', e => {
  if (!pdf || busy || zoom !== 1 || e.target.closest('.pdf-link') || e.pointerType === 'mouse' && e.button !== 0) return;
  gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now(), direction: 0};
});
$('stage').addEventListener('pointermove', e => {
  if (!gesture || gesture.id !== e.pointerId) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  if (!gesture.direction) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const direction = dx < 0 ? 1 : -1;
    if (direction > 0 && index + 2 >= pages.length || direction < 0 && index === 0) { gesture = null; return; }
    gesture.direction = direction; $('stage').setPointerCapture(e.pointerId);
    if (!reducedMotion()) curl = makeCurl($('book'), direction, gesture.y);
  }
  e.preventDefault(); gesture.distance = Math.max(0, dx * -gesture.direction);
  if (curl) { curl.dragY = Math.max(-.4, Math.min(.4, dy / curl.height)); paintCurl(curl, Math.min(.88, gesture.distance / curl.width)); }
});
async function cancelGesture() {
  gesture = null;
  if (curl) { busy = true; try { await finishCurl(curl, 0); } finally { curl.old.style.visibility = ''; curl = null; busy = false; } }
}
$('stage').addEventListener('pointerup', async e => {
  if (!gesture || gesture.id !== e.pointerId) return;
  const current = gesture; gesture = null; if (!current.direction) return;
  suppressClickUntil = performance.now() + 400;
  const distance = current.distance || 0, elapsed = Math.max(1, performance.now() - current.time);
  if (distance > Math.min(85, $('stage').clientWidth * .18) || distance > 28 && distance / elapsed > .35) await go(index + current.direction * 2, current.direction);
  else await cancelGesture();
});
$('stage').addEventListener('pointercancel', cancelGesture);
$('stage').addEventListener('dblclick', e => { if (!e.target.closest('.pdf-link') && performance.now() > suppressClickUntil) toggleZoom(e); });
loadBook();
