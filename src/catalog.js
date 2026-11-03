export const catalog = [
  { id: 'ak47', title: 'AK–47', number: '001', year: '1947', category: '步枪', aliases: ['AK47', 'AK-47', '卡拉什尼科夫'], material: '胡桃木 / 黑色钢材', description: '经典木托、弧形弹匣与修长轮廓。' },
  { id: 'm1913', title: 'M1913', number: '002', year: '1913', category: '手枪', aliases: ['M 1913', 'M-1913', '纵纹握把'], material: '磨损钢材 / 深色握把', description: '参考照片重建，圆背套筒与纵纹握把。' },
];
const normalize = value => String(value).toLowerCase().replace(/[\s\-–—]/g, '');
export function findModels(query = '', category = 'all', order = 'number') {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(normalize);
  const models = catalog.filter(item => {
    const text = normalize([item.id, item.title, item.number, item.year, item.category, item.material, ...item.aliases].join(' '));
    return (category === 'all' || item.category === category) && terms.every(term => text.includes(term));
  });
  return models.sort((a, b) => order === 'name' ? a.title.localeCompare(b.title) : order === 'year' ? Number(a.year) - Number(b.year) : a.number.localeCompare(b.number));
}

export function setupCatalog({ onSelect }) {
  document.querySelectorAll('[data-catalog-total]').forEach(element => { element.textContent = String(catalog.length).padStart(2, '0'); });
  const dialog = document.querySelector('#catalog-dialog');
  const search = document.querySelector('#catalog-search');
  const category = document.querySelector('#catalog-category');
  const order = document.querySelector('#catalog-sort');
  const results = document.querySelector('#catalog-results');
  let activeId = '';
  function render() {
    const models = findModels(search.value, category.value, order.value);
    document.querySelector('#catalog-count').textContent = `找到 ${models.length} / ${catalog.length} 件档案`;
    results.replaceChildren();
    for (const item of models) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'catalog-card';
      button.dataset.catalogId = item.id; button.setAttribute('aria-label', `查看 ${item.title} 档案`);
      button.setAttribute('aria-pressed', String(activeId === item.id));
      button.innerHTML = `<span class="catalog-card-top"><span>NO. ${item.number}</span><span>${item.category} / ${item.year}</span></span><span class="catalog-silhouette ${item.id}" aria-hidden="true"></span><strong>${item.title}</strong><span class="catalog-material">${item.material}</span><span class="catalog-description">${item.description}</span><span class="catalog-open">${activeId === item.id ? '当前展示' : '进入档案'} <b>↗</b></span>`;
      button.addEventListener('click', () => { onSelect(item.id); dialog.close(); }); results.append(button);
    }
    document.querySelector('#catalog-empty').hidden = models.length > 0;
  }
  for (const element of [search, category, order]) element.addEventListener(element === search ? 'input' : 'change', render);
  document.querySelectorAll('[data-open-catalog]').forEach(button => button.addEventListener('click', () => { render(); dialog.showModal(); search.focus(); }));
  document.querySelector('#catalog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  document.querySelector('#catalog-clear').addEventListener('click', () => { search.value = ''; category.value = 'all'; order.value = 'number'; render(); search.focus(); });
  render();
  return { setActive(id) {
    activeId = id; const item = catalog.find(item => item.id === id);
    document.querySelector('#archive-current').textContent = `${item.number} / ${item.title}`;
    render();
  } };
}
