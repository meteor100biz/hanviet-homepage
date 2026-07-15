const state = {
  recent: null,
  stories: null,
  vietnamStories: [],
  filteredVietnamStories: [],
  applications: [],
  filtered: [],
  selectedIndex: -1
};

const MAX_RECENT_WEEKS = 4;
const MAX_FEATURED_STORIES = 6;
const MAX_STORY_EXPOSURE_ROWS = 6;

const $ = (selector) => document.querySelector(selector);

function localDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function autoSeoKeywords() {
  const category = $('#vietnamCategory')?.value.trim();
  const base = ['베트남국제결혼', '국제결혼', '베트남결혼', '한베커플'];
  if (category) {
    category.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => base.push(item));
  }
  return [...new Set(base)].join(', ');
}

function autoRelatedLinks() {
  return '국제결혼 절차, 비용 안내, 상담 신청';
}

function toast(message, isError = false) {
  const box = $('#toast');
  box.textContent = message;
  box.style.color = isError ? '#bd172b' : '#126fe3';
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    box.textContent = '';
  }, 3500);
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
  }
  return data;
}

function bindNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('is-active'));
      document.querySelectorAll('.view').forEach((view) => view.classList.remove('is-visible'));
      button.classList.add('is-active');
      $(`#${button.dataset.view}View`).classList.add('is-visible');
    });
  });
}

function weekRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'editor-row';
  row.innerHTML = `
    <label>주차 <input data-field="label" type="text" value="${escapeAttr(item.label || '')}" /></label>
    <label>접수 수 <input data-field="count" type="text" value="${escapeAttr(item.count || '')}" /></label>
    <label>단위 <input data-field="unit" type="text" value="${escapeAttr(item.unit || '명 접수')}" /></label>
    <label>상태 <input data-field="status" type="text" value="${escapeAttr(item.status || '상담 가능')}" /></label>
    <button class="danger" type="button">삭제</button>
  `;
  row.querySelector('[data-field="count"]').addEventListener('input', updateRecentTotalPreview);
  row.querySelector('button').addEventListener('click', () => {
    row.remove();
    updateRecentTotalPreview();
  });
  return row;
}

function nextWeekLabel(currentLabel) {
  const match = String(currentLabel || '').trim().match(/^(\d{1,2})\s*월\s*(\d+)\s*주(?:차)?$/);
  if (!match) return '';

  let month = Number(match[1]);
  let week = Number(match[2]) + 1;
  if (week > 4) {
    month = month === 12 ? 1 : month + 1;
    week = 1;
  }
  return `${month}월 ${week}주`;
}

function parseCount(value) {
  const count = Number.parseInt(String(value || '').replace(/,/g, ''), 10);
  return Number.isNaN(count) ? 0 : count;
}

function updateRecentTotalPreview() {
  const preview = $('#recentTotalPreview');
  if (!preview) return;

  const rows = collectRows('#weeksEditor').slice(0, MAX_RECENT_WEEKS);
  const total = rows.reduce((sum, item) => sum + parseCount(item.count), 0);
  preview.textContent = `최근 한 달 합계: ${total.toLocaleString('ko-KR')}명 접수 (표시된 ${rows.length}주 기준)`;
}

function storyRow(item = {}, index = 0) {
  const row = document.createElement('div');
  row.className = 'story-row';
  row.innerHTML = `
    <div class="row-number">${index + 1}</div>
    <label>이미지 <input data-field="image" type="text" value="${escapeAttr(item.image || '')}" /></label>
    <label>대체 문구 <input data-field="alt" type="text" value="${escapeAttr(item.alt || '')}" /></label>
    <label>제목 <input data-field="title" type="text" value="${escapeAttr(item.title || '')}" /></label>
    <label>하단 문구 <input data-field="description" type="text" value="${escapeAttr(item.description || '')}" /></label>
    <label>링크 <input data-field="link" type="text" value="${escapeAttr(item.link || '')}" /></label>
  `;
  return row;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderHomeEditors() {
  $('#monthLabel').value = state.recent.monthLabel || '';
  $('#summaryNote').value = state.recent.summaryNote || '';
  $('#notice').value = state.recent.notice || '';

  const weeksEditor = $('#weeksEditor');
  weeksEditor.innerHTML = '';
  (state.recent.weeks || []).slice(0, MAX_RECENT_WEEKS).forEach((item) => weeksEditor.appendChild(weekRow(item)));
  updateRecentTotalPreview();

  renderStoriesExposureEditor();
}

function storyKey(item) {
  return item.link || item.title || item.image || '';
}

function featuredStoryKeys() {
  if (Array.isArray(state.stories.featured)) return state.stories.featured;
  return (state.stories.items || []).slice(0, MAX_FEATURED_STORIES).map(storyKey).filter(Boolean);
}

function renderStoriesExposureEditor() {
  const editor = $('#storiesExposureEditor');
  if (!editor) return;
  const items = (state.stories.items || []).slice(0, MAX_STORY_EXPOSURE_ROWS);
  const selected = new Set(featuredStoryKeys());

  if (items.length === 0) {
    editor.innerHTML = '<p class="help-text">아직 작성된 베트남 이야기가 없습니다.</p>';
    return;
  }

  editor.innerHTML = '';
  items.forEach((item) => {
    const key = storyKey(item);
    const row = document.createElement('div');
    row.className = 'story-exposure-row';
    const hasLink = Boolean(item.link);
    const localMissing = hasLink && item.localExists === false;
    const statusText = localMissing ? '로컬 파일 없음' : hasLink ? '로컬 확인됨' : '링크 없음';
    row.innerHTML = `
      <input type="checkbox" data-story-key="${escapeAttr(key)}" ${selected.has(key) ? 'checked' : ''}>
      <img src="${escapeAttr(item.image || '')}" alt="">
      <span>
        <strong>${escapeHtml(item.title || '제목 없음')}</strong>
        <span>${escapeHtml(item.description || item.link || '')}</span>
        <em class="story-status ${localMissing ? 'is-missing' : hasLink ? 'is-local' : 'is-empty'}">${escapeHtml(statusText)}</em>
      </span>
      <div class="story-exposure-actions">
        <a href="../${escapeAttr(item.link || '#')}" target="_blank">보기</a>
        <button class="danger" type="button" data-remove-story-key="${escapeAttr(key)}">목록에서 제거</button>
      </div>
    `;
    row.querySelector('input').addEventListener('change', enforceFeaturedStoryLimit);
    row.querySelector('[data-remove-story-key]').addEventListener('click', () => {
      removeStoryFromHomeList(key);
    });
    editor.appendChild(row);
  });
  enforceFeaturedStoryLimit(false);
}

function removeStoryFromHomeList(key) {
  if (!window.confirm('홈페이지 관리 목록에서만 제거합니다. 실제 글 폴더는 삭제하지 않습니다. 계속할까요?')) return;
  const target = (state.stories.items || []).find((item) => storyKey(item) === key) || {};
  state.stories.items = (state.stories.items || []).filter((item) => storyKey(item) !== key);
  state.stories.featured = (state.stories.featured || []).filter((itemKey) => itemKey !== key && itemKey !== target.title);
  renderStoriesExposureEditor();
  toast('목록에서 제거했습니다. 최종 반영하려면 홈페이지 데이터 저장을 눌러 주세요.');
}

function enforceFeaturedStoryLimit(showMessage = true) {
  const checks = Array.from(document.querySelectorAll('#storiesExposureEditor [data-story-key]'));
  const checked = checks.filter((input) => input.checked);
  if (checked.length > MAX_FEATURED_STORIES) {
    checked[checked.length - 1].checked = false;
    if (showMessage) toast('메인 노출은 최대 6개까지만 선택할 수 있습니다.', true);
  }
}

function collectRows(containerSelector) {
  return Array.from(document.querySelectorAll(`${containerSelector} > div`)).map((row) => {
    const record = {};
    row.querySelectorAll('[data-field]').forEach((input) => {
      record[input.dataset.field] = input.value.trim();
    });
    return record;
  });
}

async function loadHome() {
  const data = await request('/api/home');
  state.recent = data.recent;
  state.stories = data.stories;
  renderHomeEditors();
}

async function saveHome() {
  const recent = {
    monthLabel: $('#monthLabel').value.trim(),
    summaryNote: $('#summaryNote').value.trim(),
    notice: $('#notice').value.trim(),
    weeks: collectRows('#weeksEditor').slice(0, MAX_RECENT_WEEKS)
  };
  const stories = {
    ...(state.stories || {}),
    featured: Array.from(document.querySelectorAll('#storiesExposureEditor [data-story-key]:checked'))
      .map((input) => input.dataset.storyKey)
      .slice(0, MAX_FEATURED_STORIES)
  };

  await request('/api/home/recent', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recent)
  });
  await request('/api/home/stories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stories)
  });
  state.recent = recent;
  state.stories = stories;
  toast('홈페이지 데이터가 저장되었습니다.');
}

function renderApplicationList() {
  const list = $('#applicationList');
  list.innerHTML = '';

  if (state.filtered.length === 0) {
    list.innerHTML = '<p class="help-text">표시할 신청서가 없습니다.</p>';
    $('#applicationDetail').textContent = '신청자를 선택하세요.';
    $('#applicationDetail').className = 'application-detail empty';
    return;
  }

  state.filtered.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `application-item${index === state.selectedIndex ? ' is-active' : ''}`;
    const sourceLabel = item.source === 'both' ? '로컬+Supabase' : item.source === 'remote' ? 'Supabase만 있음' : '로컬 저장됨';
    button.innerHTML = `
      <strong>${escapeHtml(item.summary.name || '이름 없음')} · ${escapeHtml(item.summary.status || '')}</strong>
      <em class="source-badge ${escapeHtml(item.source)}">${escapeHtml(sourceLabel)}</em>
      <span>${escapeHtml(item.summary.phone || '')}</span>
      <span>${escapeHtml(item.summary.city || '')} / ${escapeHtml(item.summary.birth_year || '')}</span>
      <span>${escapeHtml(item.summary.created_at || '')}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedIndex = index;
      renderApplicationList();
      renderApplicationDetail(item);
    });
    list.appendChild(button);
  });

  if (state.selectedIndex === -1) {
    state.selectedIndex = 0;
    renderApplicationDetail(state.filtered[0]);
    renderApplicationList();
  }
}

function renderApplicationDetail(item) {
  const detail = $('#applicationDetail');
  detail.className = 'application-detail';
  const photos = [
    item.photoUrls && item.photoUrls.face ? `<figure><img src="${item.photoUrls.face}" alt="얼굴 사진"><figcaption>얼굴 사진</figcaption></figure>` : '',
    item.photoUrls && item.photoUrls.body ? `<figure><img src="${item.photoUrls.body}" alt="전신 사진"><figcaption>전신 사진</figcaption></figure>` : ''
  ].filter(Boolean).join('');
  const actions = renderApplicationActions(item);
  const rows = item.fields.map((field) => `
    <dt>${escapeHtml(field.label)}</dt>
    <dd>${escapeHtml(field.value || '-')}</dd>
  `).join('');
  detail.innerHTML = `
    <div class="detail-actions">${actions}</div>
    ${photos ? `<div class="photo-grid">${photos}</div>` : '<p class="help-text">표시할 사진이 없습니다.</p>'}
    <dl class="detail-grid">${rows}</dl>
  `;
  bindApplicationActionButtons(item);
}

function renderApplicationActions(item) {
  if (item.source === 'remote') {
    return `<button class="primary-button" type="button" data-save-local="${escapeAttr(item.summary.id)}">로컬 저장</button>`;
  }
  if (item.source === 'both') {
    return `<button class="danger solid-danger" type="button" data-delete-supabase="${escapeAttr(item.summary.id)}">Supabase 삭제</button>`;
  }
  return '<span class="local-only-note">로컬 저장본만 있습니다.</span>';
}

function bindApplicationActionButtons(item) {
  const saveButton = document.querySelector('[data-save-local]');
  if (saveButton) {
    saveButton.addEventListener('click', () => saveApplicationLocal(item.summary.id).catch((error) => toast(error.message, true)));
  }

  const deleteButton = document.querySelector('[data-delete-supabase]');
  if (deleteButton) {
    deleteButton.addEventListener('click', () => deleteApplicationSupabase(item).catch((error) => toast(error.message, true)));
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[^a-z0-9가-힣_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function fileToDataUrl(file) {
  if (!file) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function clearVietnamStoryForm() {
  $('#vietnamOriginalSlug').value = '';
  $('#vietnamTitle').value = '';
  $('#vietnamSlug').value = '';
  delete $('#vietnamSlug').dataset.touched;
  $('#vietnamCategory').value = '';
  $('#vietnamDate').value = localDateString();
  $('#vietnamImage').value = '';
  delete $('#vietnamImage').dataset.existingImage;
  delete $('#vietnamImage').dataset.existingImageExists;
  renderCurrentHeroImageBox();
  $('#vietnamImageAlt').value = '';
  $('#vietnamSummary').value = '';
  $('#vietnamSeoTitle').value = '';
  $('#vietnamSeoDescription').value = '';
  $('#vietnamSeoKeywords').value = autoSeoKeywords();
  $('#vietnamRelatedLinks').value = autoRelatedLinks();
  $('#storyBlocksEditor').innerHTML = '';
  addDefaultStoryBlocks();
  $('#vietnamPublishMain').checked = true;
  $('#deleteVietnamStoryButton').disabled = true;
  $('#vietnamCreateResult').textContent = '';
}

function storyBlock(type, data = {}) {
  const block = document.createElement('div');
  block.className = `story-block story-block-${type}`;
  block.dataset.type = type;
  block.dataset.labelBase = type === 'heading' ? '소제목' : type === 'image' ? '사진' : '문단';
  const label = type === 'heading' ? '소제목' : type === 'image' ? '사진' : '문단';
  const imageMissing = type === 'image' && data.existingImage && data.existingImageExists === false;
  const currentImageNote = data.existingImage
    ? `<p class="help-text current-file-note ${imageMissing ? 'is-missing' : ''}">현재 사진: ${escapeHtml(data.existingImage)}${imageMissing ? ' (로컬 파일 없음 - 새 사진을 선택해 교체하세요)' : ''}</p>`
    : '';
  const body = type === 'image'
    ? `<div class="compact-image-fields">${currentImageNote}<label>사진 파일<input data-field="file" type="file" accept="image/*"></label><label>사진 설명<input data-field="caption" type="text" value="${escapeAttr(data.caption || '')}" placeholder="사진 아래에 표시할 설명"></label></div>`
    : type === 'heading'
      ? `<input class="block-text-input" data-field="text" type="text" value="${escapeAttr(data.text || '')}" placeholder="소제목을 입력하세요.">`
      : `<textarea class="block-paragraph-input" data-field="text" placeholder="문단 내용을 입력하세요.">${escapeHtml(data.text || '')}</textarea>`;
  block.innerHTML = `
    <div class="story-block-header">
      <strong>${label}</strong>
      <div class="story-block-actions">
        <button type="button" data-action="up">위로</button>
        <button type="button" data-action="down">아래로</button>
        <button class="danger" type="button" data-action="remove">삭제</button>
      </div>
    </div>
    ${body}
  `;
  if (data.existingImage) block.dataset.existingImage = data.existingImage;
  block.querySelector('[data-action="up"]').addEventListener('click', () => {
    if (block.previousElementSibling) block.parentElement.insertBefore(block, block.previousElementSibling);
    updateStoryBlockNumbers();
  });
  block.querySelector('[data-action="down"]').addEventListener('click', () => {
    if (block.nextElementSibling) block.parentElement.insertBefore(block.nextElementSibling, block);
    updateStoryBlockNumbers();
  });
  block.querySelector('[data-action="remove"]').addEventListener('click', () => {
    block.remove();
    updateStoryBlockNumbers();
  });
  return block;
}

function addStoryBlock(type) {
  $('#storyBlocksEditor').appendChild(storyBlock(type));
  updateStoryBlockNumbers();
}

function addDefaultStoryBlocks() {
  const editor = $('#storyBlocksEditor');
  editor.appendChild(storyBlock('heading'));
  editor.appendChild(storyBlock('paragraph'));
  updateStoryBlockNumbers();
}

function updateStoryBlockNumbers() {
  const counts = {};
  document.querySelectorAll('#storyBlocksEditor .story-block').forEach((block) => {
    const base = block.dataset.labelBase || '블록';
    counts[base] = (counts[base] || 0) + 1;
    const title = block.querySelector('.story-block-header strong');
    if (title) title.textContent = `${base} -${counts[base]}`;
  });
}

async function collectStoryBlocks() {
  const blocks = [];
  const nodes = Array.from(document.querySelectorAll('#storyBlocksEditor .story-block'));
  for (const node of nodes) {
    const type = node.dataset.type;
    if (type === 'image') {
      const file = node.querySelector('[data-field="file"]').files[0];
      const caption = node.querySelector('[data-field="caption"]').value.trim();
      const existingImage = node.dataset.existingImage || '';
      if (!file && !caption && !existingImage) continue;
      blocks.push({ type, caption, existingImage, imageData: await fileToDataUrl(file) });
    } else {
      const textValue = node.querySelector('[data-field="text"]').value.trim();
      if (!textValue) continue;
      blocks.push({ type, text: textValue });
    }
  }
  return blocks;
}

function previewImageSrc(existingImage) {
  const slug = $('#vietnamSlug').value.trim() || $('#vietnamOriginalSlug').value.trim();
  if (!existingImage || !slug) return '';
  return `../vietnam-stories/${slug}/${existingImage}`;
}

function renderCurrentHeroImageBox(src = '', label = '', pathText = '') {
  const box = $('#currentHeroImageBox');
  if (!box) return;
  if (!src) {
    box.innerHTML = '<p class="help-text">기존 글을 불러오면 현재 대표 사진이 여기에 표시됩니다. 새 사진을 선택하지 않으면 기존 대표 사진이 유지됩니다.</p>';
    return;
  }
  box.innerHTML = `
    <img src="${escapeAttr(src)}" alt="대표 사진 미리보기">
    <div>
      <strong>${escapeHtml(label || '현재 대표 사진')}</strong>
      <code>${escapeHtml(pathText || src)}</code>
      <p class="help-text">새 사진을 선택하면 저장 시 이 대표 사진이 교체됩니다.</p>
    </div>
  `;
}

function updateHeroImagePreviewFromState() {
  const file = $('#vietnamImage').files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => renderCurrentHeroImageBox(String(reader.result || ''), '새로 선택한 대표 사진', file.name);
    reader.readAsDataURL(file);
    return;
  }
  const existingImage = $('#vietnamImage').dataset.existingImage || '';
  const existingImageExists = $('#vietnamImage').dataset.existingImageExists !== '0';
  if (existingImage && !existingImageExists) {
    const box = $('#currentHeroImageBox');
    if (box) {
      box.innerHTML = `
        <div>
          <strong>현재 대표 사진 기록</strong>
          <code>${escapeHtml(existingImage)}</code>
          <p class="help-text is-missing">로컬에 이 사진 파일이 없습니다. 새 사진을 선택하면 저장 시 교체됩니다.</p>
        </div>
      `;
    }
    return;
  }
  renderCurrentHeroImageBox(previewImageSrc(existingImage), existingImage ? '현재 대표 사진' : '', existingImage);
}

async function buildStoryPreviewHtml() {
  const title = $('#vietnamTitle').value.trim() || '베트남 이야기 미리보기';
  const seoTitle = $('#vietnamSeoTitle').value.trim() || title;
  const seoDescription = $('#vietnamSeoDescription').value.trim() || $('#vietnamSummary').value.trim();
  const seoKeywords = autoSeoKeywords();
  const category = $('#vietnamCategory').value.trim();
  const date = $('#vietnamDate').value;
  const summary = $('#vietnamSummary').value.trim();
  const imageAlt = $('#vietnamImageAlt').value.trim() || title;
  const heroFile = $('#vietnamImage').files[0];
  const heroExisting = $('#vietnamImage').dataset.existingImage || '';
  const heroSrc = heroFile ? await fileToDataUrl(heroFile) : previewImageSrc(heroExisting);
  const blocks = await collectStoryBlocks();

  const blockHtml = blocks.map((block) => {
    if (block.type === 'heading') {
      return `<h2>${escapeHtml(block.text)}</h2>`;
    }
    if (block.type === 'image') {
      const src = block.imageData || previewImageSrc(block.existingImage);
      if (!src) return '';
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
      return `<figure class="story-body-image"><img src="${src}" alt="${escapeHtml(block.caption || '본문 사진')}">${caption}</figure>`;
    }
    return `<p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(seoTitle)} 미리보기</title>
  <meta name="description" content="${escapeAttr(seoDescription)}">
  <meta name="keywords" content="${escapeAttr(seoKeywords)}">
  <style>
    body{margin:0;background:#fffaf2;color:#14213d;font-family:"Pretendard","Noto Sans KR","Apple SD Gothic Neo",Arial,sans-serif}
    .story-page{max-width:960px;margin:0 auto;padding:72px 24px 96px;background:#fff}
    .eyebrow{color:#c99746;font-size:13px;font-weight:900;letter-spacing:2.5px;margin:0 0 10px}
    h1{margin:8px 0 14px;color:#041a42;font-size:42px;letter-spacing:-1.5px}
    .story-meta{display:flex;gap:12px;flex-wrap:wrap;color:#8b7966;font-weight:800;margin-bottom:28px}
    .story-summary{font-size:19px;color:#34445d;margin-bottom:28px;line-height:1.8}
    .story-hero-image{margin:0 0 34px;border-radius:10px;overflow:hidden;box-shadow:0 18px 52px rgba(72,48,18,.1)}
    .story-hero-image img{width:100%;max-height:520px;object-fit:cover;display:block}
    .story-body{font-size:18px;line-height:2;color:#24344d}
    .story-body h2{margin:38px 0 14px;color:#041a42;font-size:28px}
    .story-body p{margin:0 0 20px}
    .story-body-image{margin:34px 0;text-align:center}
    .story-body-image img{width:100%;max-height:620px;object-fit:cover;border-radius:6px;box-shadow:0 14px 36px rgba(72,48,18,.1)}
    .story-body-image figcaption{margin-top:10px;color:#6e6670;font-size:15px}
  </style>
</head>
<body>
  <main class="story-page">
    <p class="eyebrow">VIETNAM STORY PREVIEW</p>
    <h1>${escapeHtml(title)}</h1>
    <div class="story-meta">${category ? `<span>${escapeHtml(category)}</span>` : ''}${date ? `<time>${escapeHtml(date)}</time>` : ''}</div>
    ${summary ? `<p class="story-summary">${escapeHtml(summary)}</p>` : ''}
    ${heroSrc ? `<figure class="story-hero-image"><img src="${heroSrc}" alt="${escapeHtml(imageAlt)}"></figure>` : ''}
    <div class="story-body">${blockHtml || '<p>본문을 입력해 주세요.</p>'}</div>
  </main>
</body>
</html>`;
}

async function previewVietnamStory() {
  const html = await buildStoryPreviewHtml();
  const preview = window.open('', '_blank');
  if (!preview) {
    toast('팝업이 차단되어 미리보기를 열지 못했습니다.', true);
    return;
  }
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
}

async function createVietnamStory() {
  const imageInput = $('#vietnamImage');
  const payload = {
    title: $('#vietnamTitle').value.trim(),
    originalSlug: $('#vietnamOriginalSlug').value.trim(),
    slug: $('#vietnamSlug').value.trim(),
    category: $('#vietnamCategory').value.trim(),
    date: $('#vietnamDate').value,
    imageAlt: $('#vietnamImageAlt').value.trim(),
    summary: $('#vietnamSummary').value.trim(),
    seoTitle: $('#vietnamSeoTitle').value.trim(),
    seoDescription: $('#vietnamSeoDescription').value.trim(),
    seoKeywords: autoSeoKeywords(),
    relatedLinks: autoRelatedLinks(),
    blocks: await collectStoryBlocks(),
    publishMain: $('#vietnamPublishMain').checked,
    existingImage: $('#vietnamImage').dataset.existingImage || '',
    imageData: await fileToDataUrl(imageInput.files[0])
  };

  const result = await request('/api/vietnam-stories/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  $('#vietnamCreateResult').innerHTML = `생성 완료: <strong>${escapeHtml(result.link)}</strong>`;
  toast('베트남 이야기 HTML 문서를 생성했습니다.');
  clearVietnamStoryForm();
  await Promise.all([loadHome(), loadVietnamStories()]);
}

function renderVietnamStoryList() {
  const list = $('#vietnamStoryList');
  if (!list) return;
  list.innerHTML = '';

  if (state.filteredVietnamStories.length === 0) {
    list.innerHTML = '<p class="help-text">표시할 글이 없습니다.</p>';
    return;
  }

  state.filteredVietnamStories.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `application-item${item.slug === $('#vietnamOriginalSlug').value ? ' is-active' : ''}`;
    button.innerHTML = `
      <strong>${escapeHtml(item.title || item.slug)}</strong>
      <span>${escapeHtml(item.category || '분류 없음')} / ${escapeHtml(item.date || item.updatedAt || '')}</span>
      <span>${escapeHtml(item.summary || '')}</span>
      <small>${item.featured ? '메인 노출 중' : '메인 미노출'} · ${escapeHtml(item.slug)}</small>
    `;
    button.addEventListener('click', () => loadVietnamStoryItem(item.slug).catch((error) => toast(error.message, true)));
    list.appendChild(button);
  });
}

async function loadVietnamStories() {
  const data = await request('/api/vietnam-stories');
  state.vietnamStories = data.items || [];
  state.filteredVietnamStories = state.vietnamStories;
  renderVietnamStoryList();
}

function filterVietnamStories() {
  const keyword = $('#vietnamStorySearch').value.trim().toLowerCase();
  state.filteredVietnamStories = state.vietnamStories.filter((item) => {
    return [item.title, item.category, item.summary, item.slug].join(' ').toLowerCase().includes(keyword);
  });
  renderVietnamStoryList();
}

function populateVietnamStoryForm(item) {
  $('#vietnamOriginalSlug').value = item.slug || '';
  $('#vietnamTitle').value = item.title || '';
  $('#vietnamSlug').value = item.slug || '';
  $('#vietnamSlug').dataset.touched = '1';
  $('#vietnamCategory').value = item.category || '';
  $('#vietnamDate').value = item.date || localDateString();
  $('#vietnamImage').value = '';
  $('#vietnamImage').dataset.existingImage = item.existingImage || '';
  $('#vietnamImage').dataset.existingImageExists = item.existingImageExists === false ? '0' : '1';
  updateHeroImagePreviewFromState();
  $('#vietnamImageAlt').value = item.imageAlt || '';
  $('#vietnamSummary').value = item.summary || '';
  $('#vietnamSeoTitle').value = item.seoTitle || '';
  $('#vietnamSeoDescription').value = item.seoDescription || '';
  $('#vietnamSeoKeywords').value = item.seoKeywords || autoSeoKeywords();
  $('#vietnamRelatedLinks').value = item.relatedLinks || autoRelatedLinks();
  $('#vietnamPublishMain').checked = true;
  $('#deleteVietnamStoryButton').disabled = !item.slug;
  $('#storyBlocksEditor').innerHTML = '';
  (item.blocks && item.blocks.length ? item.blocks : [{ type: 'paragraph', text: '' }]).forEach((block) => {
    $('#storyBlocksEditor').appendChild(storyBlock(block.type || 'paragraph', block));
  });
  updateStoryBlockNumbers();
  $('#vietnamCreateResult').innerHTML = `불러온 글: <strong>${escapeHtml(item.slug || '')}</strong>`;
  renderVietnamStoryList();
}

async function loadVietnamStoryItem(slug) {
  const item = await request(`/api/vietnam-stories/item?slug=${encodeURIComponent(slug)}`);
  const listItem = state.vietnamStories.find((story) => story.slug === slug);
  if (listItem) item.featured = listItem.featured;
  populateVietnamStoryForm(item);
  toast('베트남 이야기를 불러왔습니다.');
}

async function deleteVietnamStory() {
  const slug = $('#vietnamOriginalSlug').value.trim();
  if (!slug) {
    toast('삭제할 글을 먼저 선택해 주세요.', true);
    return;
  }
  if (!window.confirm(`선택한 글 "${slug}"의 로컬 폴더와 홈페이지 목록 기록을 삭제합니다. 계속할까요?`)) return;
  await request('/api/vietnam-stories/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug })
  });
  clearVietnamStoryForm();
  await Promise.all([loadVietnamStories(), loadHome()]);
  toast('선택한 베트남 이야기를 삭제했습니다.');
}

async function loadApplications() {
  const data = await request('/api/applications');
  state.applications = data.applications || [];
  state.filtered = state.applications;
  state.selectedIndex = -1;
  renderApplicationList();
  const remoteNote = data.remoteError ? ` / Supabase: ${data.remoteError}` : ` / Supabase ${data.remoteCount || 0}건`;
  toast(`${data.count || 0}건의 신청서를 불러왔습니다.${remoteNote}`);
}

function filterApplications() {
  const keyword = $('#applicationSearch').value.trim().toLowerCase();
  state.filtered = state.applications.filter((item) => {
    const haystack = [
      item.summary.name,
      item.summary.phone,
      item.summary.city,
      item.summary.status,
      item.summary.birth_year
    ].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });
  state.selectedIndex = -1;
  renderApplicationList();
}

async function importCsv(file) {
  if (!file) return;
  const text = await file.text();
  const result = await request('/api/applications/import-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    body: text
  });
  toast(`${result.count || 0}건의 CSV를 저장했습니다.`);
  await loadApplications();
}

async function downloadSupabase() {
  const result = await request('/api/applications/download', { method: 'POST' });
  toast(`Supabase에서 ${result.count || 0}건을 다운로드했습니다.`);
  await loadApplications();
}

async function saveApplicationLocal(id) {
  const result = await request('/api/applications/save-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  toast(`로컬 폴더에 저장했습니다: ${result.folder}`);
  await loadApplications();
}

async function deleteApplicationSupabase(item) {
  const id = item.summary.id;
  const name = item.summary.name || '이름 없음';
  const ok = window.confirm(`${name} 신청서를 Supabase에서 삭제합니다.\n\n로컬 저장본이 있으므로 삭제 버튼이 활성화되었습니다.\n삭제 후 되돌릴 수 없습니다.`);
  if (!ok) return;

  await request('/api/applications/delete-supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  toast('Supabase에서 삭제했습니다.');
  await loadApplications();
}

async function loadConfigStatus() {
  const config = await request('/api/config');
  const status = [
    `Supabase URL: ${config.hasSupabaseUrl ? '설정됨' : '미설정'}`,
    `Secret key: ${config.hasSecretKey ? '설정됨' : '미설정'}`,
    `Table: ${config.table}`
  ].join(' / ');
  $('#configStatus').textContent = status;
}

function bindActions() {
  $('#addWeekButton').addEventListener('click', () => {
    const editor = $('#weeksEditor');
    const firstLabel = editor.querySelector('[data-field="label"]');
    const label = nextWeekLabel(firstLabel ? firstLabel.value : '');
    const removedOldest = editor.children.length >= MAX_RECENT_WEEKS;

    if (removedOldest) editor.lastElementChild.remove();

    const row = weekRow({ label, unit: '명 접수', status: '상담 가능' });
    editor.prepend(row);
    updateRecentTotalPreview();
    row.querySelector('[data-field="count"]').focus();

    toast(removedOldest
      ? '새 주차를 맨 위에 추가하고 가장 오래된 주차를 제외했습니다.'
      : '새 주차를 맨 위에 추가했습니다.');
  });
  $('#saveHomeButton').addEventListener('click', () => saveHome().catch((error) => toast(error.message, true)));
  $('#reloadApplicationsButton').addEventListener('click', () => loadApplications().catch((error) => toast(error.message, true)));
  $('#downloadSupabaseButton').addEventListener('click', () => downloadSupabase().catch((error) => toast(error.message, true)));
  $('#applicationSearch').addEventListener('input', filterApplications);
  $('#csvFileInput').addEventListener('change', (event) => importCsv(event.target.files[0]).catch((error) => toast(error.message, true)));
  $('#vietnamTitle').addEventListener('input', () => {
    const slugInput = $('#vietnamSlug');
    if (!slugInput.dataset.touched) slugInput.value = makeSlug($('#vietnamTitle').value);
  });
  $('#vietnamSlug').addEventListener('input', () => {
    $('#vietnamSlug').dataset.touched = '1';
  });
  $('#addStoryHeadingButton').addEventListener('click', () => addStoryBlock('heading'));
  $('#addStoryParagraphButton').addEventListener('click', () => addStoryBlock('paragraph'));
  $('#addStoryImageButton').addEventListener('click', () => addStoryBlock('image'));
  $('#previewVietnamStoryButton').addEventListener('click', () => previewVietnamStory().catch((error) => toast(error.message, true)));
  $('#deleteVietnamStoryButton').addEventListener('click', () => deleteVietnamStory().catch((error) => toast(error.message, true)));
  $('#newVietnamStoryButton').addEventListener('click', () => {
    clearVietnamStoryForm();
    toast('새 글 작성 화면으로 전환했습니다.');
    renderVietnamStoryList();
  });
  $('#vietnamStorySearch').addEventListener('input', filterVietnamStories);
  $('#vietnamImage').addEventListener('change', updateHeroImagePreviewFromState);
  $('#createVietnamStoryButton').addEventListener('click', () => createVietnamStory().catch((error) => toast(error.message, true)));
}

async function init() {
  bindNavigation();
  bindActions();
  if ($('#vietnamDate')) $('#vietnamDate').value = localDateString();
  if ($('#storyBlocksEditor')) addDefaultStoryBlocks();
  await Promise.all([loadHome(), loadApplications(), loadConfigStatus(), loadVietnamStories()]);
}

init().catch((error) => toast(error.message, true));
