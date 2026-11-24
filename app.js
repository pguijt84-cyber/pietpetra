'use strict';

const euro = n => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
const dateFormat = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' });
const niceDate = date => dateFormat.format(new Date(date + 'T12:00:00'));
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

const pages = [...document.querySelectorAll('.page')];
const mobile = matchMedia('(max-width: 760px)');
const more = document.querySelector('#mobile-more');
const mapToggle = document.querySelector('#route-map-toggle');
const mapPanel = document.querySelector('#route-map-panel');
const maps = new Map();
let mapLibrary;
let trip;
let currentPage;
let pendingStop;

function safeLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function loadMapLibrary() {
  if (!mapLibrary) {
    mapLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/leaflet.js';
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Kaart niet beschikbaar'));
      script.onerror = reject;
      document.head.append(script);
    });
  }
  return mapLibrary;
}

function openStop(index) {
  const stop = document.querySelector(`#stop-${index}`);
  if (!stop) {
    if (!trip) pendingStop = index;
    return;
  }
  pendingStop = undefined;
  stop.open = true;
  const summary = stop.querySelector('summary');
  summary.focus({ preventScroll: true });
  summary.scrollIntoView({ block: 'start' });
}

function selectStop(index) {
  if (currentPage !== 'reisroute') navigate('reisroute', false);
  openStop(index);
}

async function renderVisibleMap() {
  if (!trip?.route.length) return;
  const id = currentPage === 'overzicht' && !mobile.matches ? 'overview-map'
    : currentPage === 'reisroute' && !mapPanel.hidden ? 'route-map' : null;
  if (!id) return;
  const target = document.getElementById(id);
  try {
    const leaflet = await loadMapLibrary();
    if (!target.getClientRects().length) return;
    let map = maps.get(id);
    if (!map) {
      map = leaflet.map(target, { scrollWheelZoom: false, dragging: !mobile.matches, tapHold: false });
      const points = trip.route.map(stop => [stop.lat, stop.lng]);
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);
      leaflet.polyline(points, { color: '#167974', weight: 3, dashArray: '5 8' }).addTo(map);
      trip.route.forEach((stop, index) => {
        const marker = leaflet.marker(points[index], {
          title: stop.name,
          alt: stop.name,
          icon: leaflet.divIcon({
            className: 'map-pin',
            html: `<span aria-hidden="true">${index + 1}</span>`,
            iconSize: [32, 32],
          }),
        }).addTo(map);
        marker.getElement()?.setAttribute('aria-label', `Open stop: ${stop.name}`);
        marker.on('click', () => selectStop(index));
      });
      map.fitBounds(points, { padding: [27, 27], maxZoom: 10 });
      maps.set(id, map);
    }
    if (mobile.matches) map.dragging.disable();
    else map.dragging.enable();
    map.invalidateSize();
  } catch {
    if (!target.querySelector('.map-loading')) {
      target.append(node('p', 'De kaart is niet beschikbaar. De stops staan in de reisroute.', 'map-loading'));
    }
  }
}

function syncRouteMap() {
  mapPanel.hidden = mobile.matches && mapToggle.getAttribute('aria-expanded') === 'false';
}

function setPage(name, { focus = false, scroll = true } = {}) {
  const page = pages.find(section => section.id === name) ?? pages[0];
  currentPage = page.id;
  if (currentPage !== 'reisroute') pendingStop = undefined;
  pages.forEach(section => { section.hidden = section !== page; });
  document.querySelectorAll('nav [data-page]').forEach(link => {
    if (link.dataset.page === currentPage) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  more.classList.toggle('current', Boolean(more.querySelector('[aria-current="page"]')));
  more.open = false;
  if (scroll) window.scrollTo(0, 0);
  if (focus) {
    const heading = page.querySelector('h1');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  syncRouteMap();
  requestAnimationFrame(renderVisibleMap);
}

function navigate(page, focus = true) {
  const hash = '#' + page;
  if (location.hash !== hash) history.pushState(null, '', hash);
  setPage(page, { focus });
}

document.addEventListener('click', event => {
  const link = event.target.closest('[data-page]');
  if (link && !event.defaultPrevented && event.button === 0 &&
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    navigate(link.dataset.page, link.dataset.stop === undefined);
    if (link.dataset.stop !== undefined) openStop(link.dataset.stop);
  } else if (more.open && !more.contains(event.target)) {
    more.open = false;
  }
});
window.addEventListener('hashchange', () => setPage(location.hash.slice(1)));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && more.open) {
    more.open = false;
    more.querySelector('summary').focus();
  }
});

mobile.addEventListener('change', () => {
  more.open = false;
  syncRouteMap();
  requestAnimationFrame(renderVisibleMap);
});

mapToggle.addEventListener('click', () => {
  const open = mapToggle.getAttribute('aria-expanded') === 'false';
  mapToggle.setAttribute('aria-expanded', String(open));
  mapToggle.textContent = open ? 'Verberg kaart' : 'Toon kaart';
  syncRouteMap();
  requestAnimationFrame(renderVisibleMap);
});

const themeToggle = document.querySelector('#theme');
let storedTheme;
try { storedTheme = localStorage.getItem('public-travel-theme'); } catch {}
let dark = storedTheme ? storedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme() {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
}
applyTheme();
themeToggle.addEventListener('click', () => {
  dark = !dark;
  applyTheme();
  try { localStorage.setItem('public-travel-theme', dark ? 'dark' : 'light'); } catch {}
});

setPage(location.hash.slice(1), { scroll: false });

function externalLink(label, href, className) {
  const link = node('a', label, className);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  return link;
}

function hotelGallery(photos) {
  const gallery = node('div', undefined, 'hotel-gallery');
  for (const [src, caption] of photos) {
    const figure = node('figure');
    const picture = node('img');
    picture.src = src;
    picture.alt = caption;
    picture.loading = 'lazy';
    picture.decoding = 'async';
    const link = externalLink(undefined, src);
    link.append(picture);
    figure.append(link, node('figcaption', caption));
    gallery.append(figure);
  }
  return gallery;
}

function renderHotel(hotelInfo, isFirstStop) {
  const hotel = node('section', undefined, 'hotel-details');
  hotel.append(node('h3', hotelInfo.name), node('p', 'Viersterrenhotel'), node('p', hotelInfo.address));

  const phone = node('a', 'Bel ' + hotelInfo.phone, 'secondary');
  phone.href = 'tel:' + hotelInfo.phone;
  const links = node('div', undefined, 'hotel-links');
  links.append(phone, externalLink('Bekijk het hotel op de kaart', hotelInfo.mapUrl, 'secondary'));

  if (isFirstStop) {
    hotel.append(node('p', 'Onze eerste uitvalsbasis in Phuket Town, met de historische straatjes, cafés en markten van Old Town in de omgeving. Het hotel heeft een buitenzwembad, gratis wifi, een 24-uursreceptie en parkeergelegenheid. Voor eten zijn er het Blue Pearl Restaurant en het Rooftop Chinese Restaurant.'));
    hotel.append(hotelGallery([
      ['assets/pearl-pool.webp', 'Het buitenzwembad'],
      ['assets/pearl-standard.jpg', 'Standard-kamer · voorbeeldfoto van het hotel'],
    ]));
    hotel.append(links, externalLink('Informatie en foto’s van Pearl Hotel Phuket', 'https://www.pearlhotelphuket.com/'));
  } else {
    hotel.append(node('h4', hotelInfo.room));
    for (const text of hotelInfo.bookingDetails) hotel.append(node('p', text));
    hotel.append(node('p', hotelInfo.description), node('p', hotelInfo.facilities));
    hotel.append(hotelGallery(hotelInfo.photos), links);
    const sources = node('div', undefined, 'hotel-links');
    for (const [url, label] of hotelInfo.sources) sources.append(externalLink(label, url));
    hotel.append(node('small', 'Hotelinformatie gecontroleerd op 23 november 2026. Verblijfsgegevens volgens onze Agoda-bevestiging.'), sources);
  }
  return hotel;
}

function renderStops(route) {
  const cards = document.querySelector('#route-cards');
  route.forEach((stop, index) => {
    const card = node('details', undefined, 'panel stop-card');
    card.id = 'stop-' + index;
    const summary = node('summary', undefined, 'stop-summary');
    const heading = node('span', undefined, 'stop-summary-heading');
    const nights = stop.nights === 1 ? '1 nacht' : stop.nights + ' nachten';
    heading.append(node('strong', stop.name), node('span', `${niceDate(stop.start)} – ${niceDate(stop.end)} · ${nights}`, 'stop-dates'));
    const number = node('span', index + 1, 'stop-number');
    number.setAttribute('aria-hidden', 'true');
    const status = node('span', stop.status, stop.hotel ? 'badge green' : 'badge sand');
    summary.append(number, heading, status);
    card.append(summary);
    const details = node('div', undefined, 'stop-details');
    const location = stop.hotel?.mapUrl ??
      `https://www.openstreetmap.org/?mlat=${encodeURIComponent(stop.lat)}&mlon=${encodeURIComponent(stop.lng)}#map=13/${encodeURIComponent(stop.lat)}/${encodeURIComponent(stop.lng)}`;
    if (stop.hotel) {
      details.append(node('p', stop.hotel.summary ?? 'Pearl Hotel Phuket · Standard Double · Agoda'));
      details.append(renderHotel(stop.hotel, index === 0));
    } else {
      details.append(externalLink('Bekijk bestemming op de kaart', location));
    }
    card.append(details);
    cards.append(card);
  });
}

function renderTripCountdown(departure) {
  const days = Math.ceil((new Date(departure + 'T09:20:00Z').getTime() - Date.now()) / 86400000);
  if (days <= 0) return;
  const countdown = document.querySelector('#travel-countdown');
  countdown.textContent = days === 1 ? 'Morgen vertrekken we' : `Nog ${days} dagen tot vertrek`;
  countdown.hidden = false;
}

function renderFeaturedStory(post) {
  if (!post) return;
  const label = document.querySelector('#feature-label');
  const date = document.querySelector('#feature-date');
  date.dateTime = post.date;
  date.textContent = niceDate(post.date);
  label.replaceChildren('Nieuw in het dagboek · ', date);
  document.querySelector('#feature-title').textContent = post.title;
  const body = (post.body ?? '').replace(/\s+/g, ' ').trim();
  const intro = document.querySelector('#feature-intro');
  intro.textContent = body.length > 150 ? body.slice(0, 147).replace(/\s+\S*$/, '') + '…' : body;
  intro.hidden = !body;

  const photo = post.media?.find(media => media.kind === 'image' && safeLink(media.url));
  const image = document.querySelector('#feature-image');
  if (photo) {
    image.src = safeLink(photo.url);
    image.alt = photo.caption ?? post.title;
    if (photo.width > 0 && photo.height > 0) {
      image.width = photo.width;
      image.height = photo.height;
      image.classList.toggle('is-portrait', photo.height > photo.width);
    }
  } else {
    image.hidden = true;
  }

  const link = document.querySelector('#feature-link');
  link.href = '#dagboek';
  link.dataset.page = 'dagboek';
  delete link.dataset.stop;
  link.textContent = 'Lees het verhaal';
}

fetch('public-data.json')
  .then(response => {
    if (!response.ok) throw new Error('Geen reisgegevens');
    return response.json();
  })
  .then(data => {
    trip = data;
    renderTripCountdown(data.departure);
    renderStops(data.route);
    if (pendingStop !== undefined) openStop(pendingStop);
    const orderedPosts = [...data.posts].sort((a, b) => b.date.localeCompare(a.date));
    renderFeaturedStory(orderedPosts[0]);
    const cost=e=>Math.round(e.amount*e.rate*100)/100;
    const total=data.expenses.reduce((sum,e)=>sum+cost(e),0),paid=data.expenses.filter(e=>e.status==='Betaald').reduce((sum,e)=>sum+cost(e),0);
    document.querySelectorAll('[data-total]').forEach(el=>el.textContent=euro(total));document.querySelectorAll('[data-paid]').forEach(el=>el.textContent=euro(paid));document.querySelectorAll('[data-due]').forEach(el=>el.textContent=euro(total-paid));
    function expenses(filter=''){const target=document.querySelector('#expenses');target.replaceChildren();for(const e of data.expenses.filter(e=>!filter||e.category===filter)){const row=node('article',undefined,'expense'),description=node('div');description.append(node('span',e.name),node('p',e.category+(e.currency==='EUR'?'':` · ${e.currency} ${Number(e.amount).toFixed(2).replace('.',',')}`)));if(e.note)description.append(node('p',e.note));row.append(description,node('span',e.status,e.status==='Betaald'?'badge green':'badge sand'),node('b',euro(cost(e))));target.append(row);}}
    expenses();document.querySelector('#category').addEventListener('change',e=>expenses(e.target.value));
    const categories=[...new Set(data.expenses.map(e=>e.category))];for(const name of categories){const amount=data.expenses.filter(e=>e.category===name).reduce((s,e)=>s+cost(e),0),btn=node('button',undefined,'chart-row'),progress=node('div',undefined,'progress'),bar=node('i');bar.style.width=amount/Math.max(total,1)*100+'%';progress.append(bar);btn.append(node('span',name),progress,node('b',euro(amount)));btn.addEventListener('click',()=>{const filter=document.querySelector('#category');filter.value=filter.value===name?'':name;expenses(filter.value);});document.querySelector('#categories').append(btn);}
    const socials=document.querySelector('#socials');for(const name of ['Instagram','Facebook','Snapchat','TikTok']){const profile=data.socials.find(s=>s.platform===name);if(profile&&safeLink(profile.url)){const a=node('a',name);a.href=safeLink(profile.url);a.target='_blank';a.rel='me noreferrer';a.append(node('small',profile.handle));socials.append(a);}else{const text=node('span',name);text.append(node('small','Profiellink volgt'));socials.append(text);}}
    const posts=document.querySelector('#journal-posts');if(orderedPosts.length)document.querySelector('#journal-empty').hidden=true;
    function mediaElement(m,p){const src=safeLink(m.url);if(!src)return null;const media=node(m.kind==='video'?'video':'img');media.src=src;if(m.kind==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}else{media.alt=m.caption??p.title;media.loading='lazy';}return media;}
    for(const p of orderedPosts){const article=node('article',undefined,'panel padded journal-post'),time=node('time',niceDate(p.date)+' '+p.date.slice(0,4));time.dateTime=p.date;article.append(time,node('h3',p.title),node('p',p.body));for(const m of p.media??[]){const media=mediaElement(m,p);if(!media)continue;article.append(media);const gallery=node('figure',undefined,'panel'),copy=mediaElement(m,p);gallery.append(copy,node('figcaption',m.caption??p.title));document.querySelector('#personal-media').append(gallery);}posts.append(article);}

    requestAnimationFrame(renderVisibleMap);
  })
  .catch(() => { document.querySelector('#data-error').hidden = false; });
document.querySelector('#share').addEventListener('click',async()=>{const url='https://pietpetra.nl',status=document.querySelector('#share-status');try{if(navigator.share)await navigator.share({title:'Piet & Petra op reis',text:'Volg onze eerste grote reis naar Thailand!',url});else if(navigator.clipboard){await navigator.clipboard.writeText(url);status.textContent='De link is gekopieerd. Stuur hem door!';}else status.textContent=url;}catch(e){if(e.name!=='AbortError')status.textContent='Deel deze link: '+url;}});
