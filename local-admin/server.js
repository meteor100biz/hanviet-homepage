const http = require('http');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { URL } = require('url');

const adminRoot = __dirname;
const siteRoot = path.resolve(adminRoot, '..');
const publicRoot = path.join(adminRoot, 'public');
const dataRoot = path.join(adminRoot, 'data');
const backupRoot = path.join(dataRoot, 'backups');
const applicantsRoot = path.join(adminRoot, 'applicants');
const vietnamStoriesRoot = path.join(siteRoot, 'vietnam-stories');
const port = Number(process.env.PORT || readEnvFile().PORT || 5177);
const env = { ...readEnvFile(), ...process.env };

const paths = {
  recent: path.join(siteRoot, 'data', 'recent-status.json'),
  stories: path.join(siteRoot, 'data', 'vietnam-stories.json'),
  applicationsCsv: path.join(dataRoot, 'applications_rows.csv')
};

const fieldLabels = {
  id: '접수번호',
  created_at: '신청일시',
  name: '성명',
  phone: '연락처',
  birth_year: '출생연도',
  city: '거주지역',
  marriage: '결혼이력',
  job: '직업',
  height: '키(cm)',
  weight: '몸무게(kg)',
  drink: '음주',
  smoke: '흡연',
  hope: '희망 조건',
  introduce: '자기소개',
  photo_face: '얼굴 사진',
  photo_body: '전신 사진',
  agree_privacy: '개인정보 동의',
  agree_third_party: '제3자 제공 동의',
  agree_at: '동의일시',
  status: '처리상태',
  memo: '메모'
};

const orderedFields = Object.keys(fieldLabels);

fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(backupRoot, { recursive: true });
fs.mkdirSync(applicantsRoot, { recursive: true });
fs.mkdirSync(vietnamStoriesRoot, { recursive: true });

function readEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const index = trimmed.indexOf('=');
    if (index === -1) return acc;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    acc[key] = value;
    return acc;
  }, {});
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body) {
  send(res, status, body, { 'Content-Type': 'application/json; charset=utf-8' });
}

function notFound(res) {
  sendJson(res, 404, { error: '요청한 항목을 찾지 못했습니다.' });
}

function safeJsonRead(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => headers.reduce((record, header, index) => {
    record[header] = cells[index] || '';
    return record;
  }, {}));
}

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(records) {
  const header = orderedFields.join(',');
  const rows = records.map((record) => orderedFields.map((field) => csvEscape(record[field])).join(','));
  return `${header}\n${rows.join('\n')}\n`;
}

function normalizeApplications(records) {
  return records.map((record) => ({
    raw: record,
    summary: {
      id: record.id || '',
      created_at: record.created_at || '',
      name: record.name || '',
      phone: record.phone || '',
      birth_year: record.birth_year || '',
      city: record.city || '',
      status: record.status || '신청'
    },
    fields: orderedFields.map((key) => ({
      key,
      label: fieldLabels[key],
      value: record[key] || ''
    }))
  }));
}

function normalizeApplication(record, source = 'local', localExists = false, remoteExists = false) {
  const normalized = normalizeApplications([record])[0];
  normalized.source = source;
  normalized.localExists = localExists;
  normalized.remoteExists = remoteExists;
  normalized.photoUrls = {
    face: record.photo_face ? `/api/photo?path=${encodeURIComponent(record.photo_face)}` : '',
    body: record.photo_body ? `/api/photo?path=${encodeURIComponent(record.photo_body)}` : ''
  };
  return normalized;
}

function timestamp() {
  const date = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function localDateString(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function saveApplicationsCsv(csvText) {
  if (fs.existsSync(paths.applicationsCsv)) {
    fs.copyFileSync(paths.applicationsCsv, path.join(backupRoot, `applications_rows_${timestamp()}.csv`));
  }
  fs.writeFileSync(paths.applicationsCsv, csvText, 'utf8');
}

function getSupabaseConfig() {
  const supabaseUrl = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const table = env.SUPABASE_TABLE || 'applications';
  if (!supabaseUrl || !secretKey) {
    throw new Error('local-admin/.env에 SUPABASE_URL과 SUPABASE_SECRET_KEY를 입력해 주세요.');
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), secretKey, table };
}

async function fetchSupabaseRecords() {
  const { supabaseUrl, secretKey, table } = getSupabaseConfig();
  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&order=created_at.desc`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase 조회 실패 (${response.status}): ${detail}`);
  }

  return response.json();
}

function readLocalCsvRecords() {
  const csv = fs.existsSync(paths.applicationsCsv) ? fs.readFileSync(paths.applicationsCsv, 'utf8') : '';
  return csv ? parseCsv(csv) : [];
}

function readApplicantFolders() {
  if (!fs.existsSync(applicantsRoot)) return [];
  return fs.readdirSync(applicantsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = path.join(applicantsRoot, entry.name);
      const filePath = path.join(folder, 'data.json');
      if (!fs.existsSync(filePath)) return null;
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      record.__localFolder = entry.name;
      return record;
    })
    .filter(Boolean);
}

function localRecords() {
  const byId = new Map();
  readLocalCsvRecords().forEach((record) => {
    if (record.id) byId.set(String(record.id), record);
  });
  readApplicantFolders().forEach((record) => {
    if (record.id) byId.set(String(record.id), record);
  });
  return [...byId.values()];
}

async function combinedApplications() {
  const local = localRecords();
  let remote = [];
  let remoteError = '';
  try {
    remote = await fetchSupabaseRecords();
  } catch (error) {
    remoteError = error.message || 'Supabase 목록을 불러오지 못했습니다.';
  }

  const localById = new Map(local.map((record) => [String(record.id), record]));
  const remoteById = new Map(remote.map((record) => [String(record.id), record]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  const applications = [...ids].map((id) => {
    const localRecord = localById.get(id);
    const remoteRecord = remoteById.get(id);
    if (localRecord && remoteRecord) {
      return withLocalPhotoUrls(normalizeApplication({ ...remoteRecord, ...localRecord }, 'both', true, true), localRecord);
    }
    if (remoteRecord) {
      return normalizeApplication(remoteRecord, 'remote', false, true);
    }
    return withLocalPhotoUrls(normalizeApplication(localRecord, 'local', true, false), localRecord);
  });

  applications.sort((a, b) => String(b.summary.created_at).localeCompare(String(a.summary.created_at)));
  return { applications, remoteCount: remote.length, localCount: local.length, remoteError };
}

function withLocalPhotoUrls(application, record) {
  if (!record || !record.__localFolder) return application;
  application.photoUrls = {
    face: findLocalPhotoUrl(record.__localFolder, 'face') || application.photoUrls.face,
    body: findLocalPhotoUrl(record.__localFolder, 'body') || application.photoUrls.body
  };
  return application;
}

function findLocalPhotoUrl(folderName, baseName) {
  const folder = path.join(applicantsRoot, folderName);
  if (!fs.existsSync(folder)) return '';
  const file = fs.readdirSync(folder).find((name) => {
    const lower = name.toLowerCase();
    return lower === `${baseName}.jpg` || lower === `${baseName}.png` || lower === `${baseName}.webp`;
  });
  return file ? `/api/local-photo?folder=${encodeURIComponent(folderName)}&file=${encodeURIComponent(file)}` : '';
}

function safeFolderName(record) {
  const id = String(record.id || 'no-id').replace(/[^\w.-]/g, '_');
  const name = String(record.name || 'unknown').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  return `${id}_${name}`;
}

function applicationHtml(record, photoFiles) {
  const rows = orderedFields.map((key) => {
    const value = record[key] === undefined || record[key] === null || record[key] === '' ? '-' : String(record[key]);
    return `<tr><th>${fieldLabels[key]}</th><td>${escapeHtml(value)}</td></tr>`;
  }).join('\n');
  const photos = photoFiles.map((file) => `<figure><img src="${file}" alt="신청자 사진"><figcaption>${file}</figcaption></figure>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(record.name || '신청서')}</title>
  <style>
    body{font-family:Arial,"Noto Sans KR",sans-serif;margin:32px;color:#14213d}
    h1{color:#06265c} table{border-collapse:collapse;width:100%;max-width:980px}
    th,td{border:1px solid #dbe4ef;padding:12px;text-align:left;vertical-align:top}
    th{width:180px;background:#f8fbff;color:#06265c}
    .photos{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}
    figure{margin:0} img{max-width:320px;max-height:420px;border:1px solid #dbe4ef}
  </style>
</head>
<body>
  <h1>베트남 국제결혼 매칭 신청서</h1>
  <div class="photos">${photos}</div>
  <table>${rows}</table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function storySlug(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[^a-z0-9가-힣_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `story-${timestamp()}`;
}

function safeStoryFolder(slug) {
  const folder = path.normalize(path.join(vietnamStoriesRoot, storySlug(slug)));
  if (!folder.startsWith(vietnamStoriesRoot)) {
    throw new Error('올바르지 않은 폴더명입니다.');
  }
  return folder;
}

function dataUrlToFile(dataUrl, fallbackName) {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('이미지 형식이 올바르지 않습니다.');
  const mime = match[1].toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
  return {
    filename: `${fallbackName}.${ext}`,
    mime,
    buffer: Buffer.from(match[2], 'base64')
  };
}

function paragraphsToHtml(body) {
  return String(body || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n        ');
}

function blocksToHtml(blocks, blockImages) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '<p>본문을 입력해 주세요.</p>';
  }
  let imageIndex = 0;
  return blocks.map((block) => {
    if (block.type === 'heading') {
      return `<h2>${escapeHtml(block.text || '')}</h2>`;
    }
    if (block.type === 'image') {
      const file = blockImages[imageIndex++];
      if (!file) return '';
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
      return `<figure class="story-body-image"><img src="images/${file}" alt="${escapeHtml(block.caption || '베트남 이야기 사진')}">${caption}</figure>`;
    }
    return `<p>${escapeHtml(block.text || '').replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n      ');
}

function seoText(value, fallback = '') {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim();
}

function relatedLinksHtml(value) {
  const presets = {
    '국제결혼 절차': '../../process.html',
    '비용 안내': '../../fee.html',
    '매칭 신청': '../../application.html',
    '상담 신청': '../../application.html',
    '베트남 이야기': '../',
    '공지사항': '../../notice/',
    'FAQ': '../../faq/'
  };
  const labels = String(value || '국제결혼 절차, 비용 안내, 상담 신청')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!labels.length) return '';
  return `<aside class="related-links"><h2>함께 보면 좋은 안내</h2><div>${labels.map((label) => `<a href="${presets[label] || '../../application.html'}">${escapeHtml(label)}</a>`).join('')}</div></aside>`;
}

function siteHeader(prefix = '') {
  return `<header class="site-header">
  <a class="brand" href="${prefix}index.html" aria-label="한베커플 홈">
    <img src="${prefix}assets/images/logo.png" alt="한베커플 로고" />
    <div><strong>한베커플</strong><span>HAN-VIET COUPLE</span></div>
  </a>
  <nav class="main-nav" aria-label="주요 메뉴">
    <a href="${prefix}index.html#about">한베커플 소개</a>
    <a href="${prefix}process.html">국제결혼 절차</a>
    <a href="${prefix}fee.html">비용 안내</a>
    <a href="${prefix}vietnam-stories/">베트남 이야기</a>
    <a href="${prefix}notice/">공지사항</a>
    <a href="${prefix}faq/">FAQ</a>
  </nav>
  <a class="header-cta" href="${prefix}application.html">상담 신청하기</a>
  <details class="mobile-menu">
    <summary aria-label="모바일 메뉴 열기"><span></span><span></span><span></span></summary>
    <nav aria-label="모바일 주요 메뉴">
      <a href="${prefix}index.html#about">한베커플 소개</a>
      <a href="${prefix}process.html">국제결혼 절차</a>
      <a href="${prefix}fee.html">비용 안내</a>
      <a href="${prefix}vietnam-stories/">베트남 이야기</a>
      <a href="${prefix}notice/">공지사항</a>
      <a href="${prefix}faq/">FAQ</a>
      <a href="${prefix}application.html">상담 신청하기</a>
    </nav>
  </details>
</header>`;
}

function siteFooter(prefix = '') {
  return `<footer class="site-footer">
  <div class="footer-brand"><img src="${prefix}assets/images/logo.png" alt="한베커플 로고"><div><strong>한베커플</strong><span>HAN-VIET COUPLE</span></div></div>
  <div><h4>고객센터</h4><p>070-8064-6621</p><p>경남 창원시 의창구 금강로 367</p></div>
  <div><h4>정식 허가 업체</h4><p>허가번호: 경남-창원-국제-25-0003호</p><p>대표: 백태선</p><p>사업자등록번호: 205-40-277121</p></div>
  <div><h4>이용안내</h4><p><a href="${prefix}terms.html">이용약관</a></p><p><a href="${prefix}privacy.html">개인정보처리방침</a></p><p><a href="${prefix}compensation.html">손해배상 청구절차</a></p></div>
</footer>`;
}

function prefixForHtmlFile(filePath) {
  const relativeDir = path.relative(siteRoot, path.dirname(filePath));
  if (!relativeDir) return '';
  return relativeDir.split(path.sep).filter(Boolean).map(() => '../').join('');
}

function htmlFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'local-admin' || entry.name === '.git' || entry.name === 'node_modules') return [];
      return htmlFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function applySharedHeaderFooter() {
  for (const filePath of htmlFiles(siteRoot)) {
    let html = fs.readFileSync(filePath, 'utf8');
    const prefix = prefixForHtmlFile(filePath);
    const next = html
      .replace(/<header class="site-header"[\s\S]*?<\/header>/, siteHeader(prefix))
      .replace(/<footer class="site-footer"[\s\S]*?<\/footer>/, siteFooter(prefix));
    if (next !== html) fs.writeFileSync(filePath, next, 'utf8');
  }
}

function vietnamStoryHtml(story, imageFile, blockImages = []) {
  const title = escapeHtml(story.title || '베트남 이야기');
  const summary = escapeHtml(story.summary || '');
  const category = escapeHtml(story.category || '베트남 이야기');
  const date = escapeHtml(story.date || '');
  const imageAlt = escapeHtml(story.imageAlt || story.title || '베트남 이야기 사진');
  const image = imageFile ? `<figure class="story-hero-image"><img src="images/${imageFile}" alt="${imageAlt}"></figure>` : '';
  const body = blocksToHtml(story.blocks, blockImages);
  const seoTitleRaw = seoText(story.seoTitle, `${story.title || '베트남 이야기'} | 베트남 국제결혼 한베커플`);
  const seoDescriptionRaw = seoText(story.seoDescription, story.summary || `${story.title || '베트남 이야기'} - 베트남 국제결혼을 준비하는 분들을 위한 한베커플의 베트남 문화 이야기입니다.`);
  const seoKeywordsRaw = seoText(story.seoKeywords, '베트남국제결혼, 국제결혼, 베트남결혼, 베트남문화, 한베커플');
  const seoTitle = escapeHtml(seoTitleRaw);
  const seoDescription = escapeHtml(seoDescriptionRaw);
  const seoKeywords = escapeHtml(seoKeywordsRaw);
  const imageUrl = imageFile ? `images/${imageFile}` : '../../assets/images/logo.png';
  const relatedLinks = relatedLinksHtml(story.relatedLinks);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: seoText(story.title, '베트남 이야기'),
    description: seoDescriptionRaw,
    image: imageFile ? `https://hanviet.co.kr/vietnam-stories/${storySlug(story.slug || story.title)}/images/${imageFile}` : 'https://hanviet.co.kr/assets/images/logo.png',
    datePublished: story.date || undefined,
    dateModified: localDateString(),
    author: {
      '@type': 'Organization',
      name: '한베커플'
    },
    publisher: {
      '@type': 'Organization',
      name: '한베커플',
      logo: {
        '@type': 'ImageObject',
        url: 'https://hanviet.co.kr/assets/images/logo.png'
      }
    },
    about: seoKeywordsRaw.split(',').map((item) => item.trim()).filter(Boolean)
  }, null, 2).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seoTitle}</title>
  <meta name="description" content="${seoDescription}">
  <meta name="keywords" content="${seoKeywords}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${seoTitle}">
  <meta property="og:description" content="${seoDescription}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:site_name" content="한베커플">
  <script type="application/ld+json">${jsonLd}</script>
  <link rel="stylesheet" href="../../assets/css/style.css">
  <style>
    .story-page{max-width:960px;margin:0 auto;padding:72px 24px 96px}
    .story-page .eyebrow{color:#c99746}
    .story-page h1{margin:8px 0 14px;color:#041a42;font-size:42px;letter-spacing:-1.5px}
    .story-meta{display:flex;gap:12px;flex-wrap:wrap;color:#8b7966;font-weight:800;margin-bottom:28px}
    .story-summary{font-size:19px;color:#34445d;margin-bottom:28px}
    .story-hero-image{margin:0 0 34px;border-radius:10px;overflow:hidden;box-shadow:0 18px 52px rgba(72,48,18,.1)}
    .story-hero-image img{width:100%;max-height:520px;object-fit:cover}
    .story-body{font-size:18px;line-height:2;color:#24344d}
    .story-body h2{margin:38px 0 14px;color:#041a42;font-size:28px}
    .story-body p{margin-bottom:20px}
    .story-body-image{margin:34px 0;text-align:center}
    .story-body-image img{width:100%;max-height:620px;object-fit:cover;border-radius:6px;box-shadow:0 14px 36px rgba(72,48,18,.1)}
    .story-body-image figcaption{margin-top:10px;color:#6e6670;font-size:15px}
    .related-links{margin-top:44px;padding:24px;border:1px solid rgba(213,188,151,.42);border-radius:8px;background:#fffaf2}
    .related-links h2{margin:0 0 14px;color:#041a42;font-size:22px}
    .related-links div{display:flex;gap:10px;flex-wrap:wrap}
    .related-links a{display:inline-flex;padding:10px 14px;border-radius:999px;background:#fff;color:#06265c;font-weight:900;border:1px solid rgba(213,188,151,.55)}
    .story-back{display:inline-flex;margin:0 0 28px;color:#06265c;font-weight:900}
    .story-bottom-back{margin-top:34px}
  </style>
</head>
<body>
${siteHeader('../../')}
  <main class="story-page">
    <a class="story-back" href="../">← 목록으로 돌아가기</a>
    <p class="eyebrow">VIETNAM STORY</p>
    <h1>${title}</h1>
    <div class="story-meta"><span>${category}</span>${date ? `<time>${date}</time>` : ''}</div>
    ${summary ? `<p class="story-summary">${summary}</p>` : ''}
    ${image}
    <div class="story-body">
      ${body}
    </div>
    ${relatedLinks}
    <a class="story-back story-bottom-back" href="../">← 목록으로 돌아가기</a>
  </main>
${siteFooter('../../')}
</body>
</html>`;
}

function storyPublicLink(slug) {
  return `vietnam-stories/${slug}/`;
}

function storySlugFromLink(link) {
  return String(link || '').replace(/^vietnam-stories\//, '').replace(/\/$/, '');
}

function storyLocalExists(link) {
  const slug = storySlugFromLink(link);
  if (!slug) return false;
  return fs.existsSync(path.join(vietnamStoriesRoot, slug, 'index.html'));
}

function storyMetaPath(folder) {
  return path.join(folder, 'story.json');
}

function storyImageExists(folder, imagePath) {
  if (!imagePath) return false;
  const imageFile = path.normalize(path.join(folder, String(imagePath)));
  if (!imageFile.startsWith(folder)) return false;
  return fs.existsSync(imageFile);
}

function withStoryImageStatus(slug, meta) {
  const folder = safeStoryFolder(slug);
  return {
    ...meta,
    existingImageExists: storyImageExists(folder, meta.existingImage),
    blocks: (meta.blocks || []).map((block) => {
      if (block.type !== 'image') return block;
      return {
        ...block,
        existingImageExists: storyImageExists(folder, block.existingImage)
      };
    })
  };
}

function readStoryMetadata(slug) {
  const folder = safeStoryFolder(slug);
  const metaPath = storyMetaPath(folder);
  if (fs.existsSync(metaPath)) {
    return withStoryImageStatus(slug, JSON.parse(fs.readFileSync(metaPath, 'utf8')));
  }

  const stories = safeJsonRead(paths.stories, { items: [] });
  const link = storyPublicLink(slug);
  const item = (stories.items || []).find((entry) => entry.link === link) || {};
  const htmlPath = path.join(folder, 'index.html');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  const pick = (regex) => {
    const match = html.match(regex);
    return match ? decodeHtml(match[1].replace(/<br\s*\/?>/gi, '\n').trim()) : '';
  };
  const imageMatch = html.match(/<figure class="story-hero-image"><img src="([^"]+)" alt="([^"]*)"/);
  const paragraphs = [...html.matchAll(/<div class="story-body">([\s\S]*?)<\/div>/g)]
    .flatMap((match) => [...match[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((itemMatch) => ({
      type: 'paragraph',
      text: decodeHtml(itemMatch[1].replace(/<br\s*\/?>/gi, '\n').trim())
    })));

  return withStoryImageStatus(slug, {
    slug,
    title: item.title || pick(/<h1>([\s\S]*?)<\/h1>/),
    category: pick(/<div class="story-meta"><span>([\s\S]*?)<\/span>/),
    date: pick(/<time>([\s\S]*?)<\/time>/),
    summary: item.description || pick(/<p class="story-summary">([\s\S]*?)<\/p>/),
    seoTitle: pick(/<title>([\s\S]*?)<\/title>/),
    seoDescription: pick(/<meta name="description" content="([^"]*)"/),
    seoKeywords: pick(/<meta name="keywords" content="([^"]*)"/),
    relatedLinks: '국제결혼 절차, 비용 안내, 상담 신청',
    imageAlt: item.alt || (imageMatch ? decodeHtml(imageMatch[2]) : ''),
    existingImage: imageMatch ? imageMatch[1] : '',
    blocks: paragraphs.length ? paragraphs : [{ type: 'paragraph', text: '' }]
  });
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function listVietnamStories() {
  const stories = safeJsonRead(paths.stories, { items: [], featured: [] });
  const fromData = new Map((stories.items || []).map((item) => [
    String(item.link || '').replace(/^vietnam-stories\//, '').replace(/\/$/, ''),
    item
  ]));
  if (!fs.existsSync(vietnamStoriesRoot)) return [];

  return fs.readdirSync(vietnamStoriesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name;
      const folder = path.join(vietnamStoriesRoot, slug);
      const indexPath = path.join(folder, 'index.html');
      if (!fs.existsSync(indexPath)) return null;
      const item = fromData.get(slug) || {};
      let meta = {};
      try {
        meta = readStoryMetadata(slug);
      } catch (_) {
        meta = {};
      }
      const stat = fs.statSync(indexPath);
      return {
        slug,
        title: item.title || meta.title || slug,
        category: meta.category || '',
        date: meta.date || '',
        summary: item.description || meta.summary || '',
        image: item.image || (meta.existingImage ? `vietnam-stories/${slug}/${meta.existingImage}` : ''),
        link: storyPublicLink(slug),
        featured: (stories.featured || []).includes(storyPublicLink(slug)) || (stories.featured || []).includes(item.title),
        updatedAt: stat.mtime.toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const dateOrder = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateOrder !== 0) return dateOrder;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
}

function writeSeoFiles() {
  const baseUrl = env.SITE_URL || 'https://hanviet.co.kr';
  const staticPages = [
    '',
    'process.html',
    'fee.html',
    'application.html',
    'vietnam-stories/',
    'notice/',
    'faq/',
    'terms.html',
    'privacy.html',
    'compensation.html'
  ];
  const storyPages = listVietnamStories().map((story) => story.link);
  const urls = [...staticPages, ...storyPages].map((loc) => `${baseUrl.replace(/\/$/, '')}/${loc}`);
  const today = localDateString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(siteRoot, 'sitemap.xml'), xml, 'utf8');
  fs.writeFileSync(path.join(siteRoot, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${baseUrl.replace(/\/$/, '')}/sitemap.xml\n`, 'utf8');
}

function createVietnamStory(story) {
  if (!story.title || !String(story.title).trim()) {
    throw new Error('제목을 입력해 주세요.');
  }

  const slug = storySlug(story.slug || story.title);
  const folder = safeStoryFolder(slug);
  const imagesFolder = path.join(folder, 'images');
  fs.mkdirSync(imagesFolder, { recursive: true });

  let imageFileName = '';
  const imageFile = dataUrlToFile(story.imageData, 'main');
  if (imageFile) {
    imageFileName = imageFile.filename;
    fs.writeFileSync(path.join(imagesFolder, imageFile.filename), imageFile.buffer);
  } else if (story.existingImage) {
    imageFileName = String(story.existingImage).replace(/^images\//, '');
  }

  const blockImageFiles = [];
  let blockImageNumber = 1;
  for (const block of Array.isArray(story.blocks) ? story.blocks : []) {
    if (block.type !== 'image') continue;
    if (block.imageData) {
      const blockImage = dataUrlToFile(block.imageData, `image-${blockImageNumber}`);
      if (!blockImage) continue;
      fs.writeFileSync(path.join(imagesFolder, blockImage.filename), blockImage.buffer);
      blockImageFiles.push(blockImage.filename);
      blockImageNumber += 1;
      continue;
    }
    if (block.existingImage) {
      blockImageFiles.push(String(block.existingImage).replace(/^images\//, ''));
      blockImageNumber += 1;
    }
  }

  fs.writeFileSync(path.join(folder, 'index.html'), vietnamStoryHtml(story, imageFileName, blockImageFiles), 'utf8');
  fs.writeFileSync(storyMetaPath(folder), `${JSON.stringify({
    slug,
    title: story.title,
    category: story.category || '',
    date: story.date || '',
    summary: story.summary || '',
    imageAlt: story.imageAlt || '',
    seoTitle: story.seoTitle || '',
    seoDescription: story.seoDescription || '',
    seoKeywords: story.seoKeywords || '',
    relatedLinks: story.relatedLinks || '',
    existingImage: imageFileName ? `images/${imageFileName}` : '',
    blocks: (story.blocks || []).map((block, index) => {
      if (block.type !== 'image') return block;
      const file = blockImageFiles.shift();
      return { type: 'image', caption: block.caption || '', existingImage: file ? `images/${file}` : '' };
    })
  }, null, 2)}\n`, 'utf8');

  const stories = safeJsonRead(paths.stories, { items: [], featured: [] });
  const item = {
    image: imageFileName ? `vietnam-stories/${slug}/images/${imageFileName}` : 'assets/images/gallery-ninhbinh.jpg',
    alt: story.imageAlt || story.title,
    title: story.title,
    description: story.summary || '',
    link: storyPublicLink(slug)
  };
  stories.items = [item, ...(stories.items || []).filter((entry) => entry.link !== item.link)];
  const featuredWithoutCurrent = (stories.featured || []).filter((link) => link !== item.link && link !== story.title);
  stories.featured = story.publishMain
    ? [item.link, ...featuredWithoutCurrent].slice(0, 6)
    : featuredWithoutCurrent.slice(0, 6);
  writeJson(paths.stories, stories);
  writeSeoFiles();

  return {
    folder,
    url: `../vietnam-stories/${slug}/index.html`,
    link: `vietnam-stories/${slug}/`
  };
}

function homeStoriesWithLocalStatus(stories) {
  const next = {
    ...stories,
    items: (stories.items || []).map((item) => ({
      ...item,
      localExists: item.link ? storyLocalExists(item.link) : false
    }))
  };
  return next;
}

function removeStoryFromHomeData(slug) {
  const link = storyPublicLink(slug);
  const stories = safeJsonRead(paths.stories, { items: [], featured: [] });
  const removedTitles = (stories.items || [])
    .filter((item) => item.link === link)
    .map((item) => item.title)
    .filter(Boolean);
  stories.items = (stories.items || []).filter((item) => item.link !== link);
  stories.featured = (stories.featured || []).filter((item) => item !== link && !removedTitles.includes(item));
  writeJson(paths.stories, stories);
}

function deleteVietnamStory(slug) {
  const normalizedSlug = storySlug(slug);
  const folder = safeStoryFolder(normalizedSlug);
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
  removeStoryFromHomeData(normalizedSlug);
  writeSeoFiles();
  return { ok: true, slug: normalizedSlug };
}

async function fetchStorageObject(objectPath) {
  const { supabaseUrl, secretKey } = getSupabaseConfig();
  const bucket = env.SUPABASE_STORAGE_BUCKET || 'member-photo';
  const endpoint = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`사진 다운로드 실패 (${response.status}): ${detail}`);
  }
  return response;
}

async function saveRemoteApplication(id) {
  const records = await fetchSupabaseRecords();
  const record = records.find((item) => String(item.id) === String(id));
  if (!record) throw new Error('Supabase에서 해당 신청서를 찾지 못했습니다.');

  const folder = path.join(applicantsRoot, safeFolderName(record));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'data.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  const photoFiles = [];
  for (const [key, filename] of [['photo_face', 'face'], ['photo_body', 'body']]) {
    if (!record[key]) continue;
    const response = await fetchStorageObject(record[key]);
    const contentType = response.headers.get('content-type') || '';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const file = `${filename}.${ext}`;
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(folder, file), buffer);
    photoFiles.push(file);
  }

  fs.writeFileSync(path.join(folder, 'application.html'), applicationHtml(record, photoFiles), 'utf8');
  return folder;
}

async function deleteSupabaseStorageObject(objectPath) {
  if (!objectPath) return;
  const { supabaseUrl, secretKey } = getSupabaseConfig();
  const bucket = env.SUPABASE_STORAGE_BUCKET || 'member-photo';
  const endpoint = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [objectPath] })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase 사진 삭제 실패 (${response.status}): ${detail}`);
  }
}

async function deleteSupabaseApplication(id) {
  const local = localRecords().some((record) => String(record.id) === String(id));
  if (!local) {
    throw new Error('로컬 저장본이 있는 신청서만 Supabase에서 삭제할 수 있습니다.');
  }

  const records = await fetchSupabaseRecords();
  const record = records.find((item) => String(item.id) === String(id));
  if (!record) {
    throw new Error('Supabase에서 해당 신청서를 찾지 못했습니다.');
  }

  await deleteSupabaseStorageObject(record.photo_face);
  await deleteSupabaseStorageObject(record.photo_body);

  const { supabaseUrl, secretKey, table } = getSupabaseConfig();
  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Prefer: 'return=minimal'
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase 신청서 삭제 실패 (${response.status}): ${detail}`);
  }
}

async function downloadFromSupabase() {
  const records = await fetchSupabaseRecords();
  const csv = toCsv(records);
  saveApplicationsCsv(csv);
  return records;
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/config') {
      sendJson(res, 200, {
        hasSupabaseUrl: Boolean(env.SUPABASE_URL),
        hasSecretKey: Boolean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
        table: env.SUPABASE_TABLE || 'applications'
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/home') {
      const stories = safeJsonRead(paths.stories, { items: [] });
      sendJson(res, 200, {
        recent: safeJsonRead(paths.recent, { monthLabel: '', summaryNote: '', notice: '', weeks: [] }),
        stories: homeStoriesWithLocalStatus(stories)
      });
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/home/recent') {
      const data = JSON.parse(await getBody(req));
      writeJson(paths.recent, data);
      applySharedHeaderFooter();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/home/stories') {
      const data = JSON.parse(await getBody(req));
      data.items = (data.items || []).map(({ localExists, ...item }) => item);
      writeJson(paths.stories, data);
      applySharedHeaderFooter();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/vietnam-stories/create') {
      const data = JSON.parse(await getBody(req));
      const result = createVietnamStory(data);
      applySharedHeaderFooter();
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/vietnam-stories') {
      sendJson(res, 200, { items: listVietnamStories() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/vietnam-stories/item') {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const slug = requestUrl.searchParams.get('slug');
      if (!slug) throw new Error('불러올 글을 선택해 주세요.');
      sendJson(res, 200, readStoryMetadata(slug));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/vietnam-stories/delete') {
      const data = JSON.parse(await getBody(req));
      if (!data.slug) throw new Error('삭제할 글을 선택해 주세요.');
      const result = deleteVietnamStory(data.slug);
      applySharedHeaderFooter();
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/applications') {
      const result = await combinedApplications();
      sendJson(res, 200, {
        count: result.applications.length,
        file: paths.applicationsCsv,
        labels: fieldLabels,
        localCount: result.localCount,
        remoteCount: result.remoteCount,
        remoteError: result.remoteError,
        applications: result.applications
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/applications/import-csv') {
      const csv = await getBody(req);
      saveApplicationsCsv(csv);
      const records = parseCsv(csv);
      sendJson(res, 200, { ok: true, count: records.length });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/applications/download') {
      const records = await downloadFromSupabase();
      sendJson(res, 200, { ok: true, count: records.length });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/applications/save-local') {
      const data = JSON.parse(await getBody(req));
      const folder = await saveRemoteApplication(data.id);
      sendJson(res, 200, { ok: true, folder });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/applications/delete-supabase') {
      const data = JSON.parse(await getBody(req));
      await deleteSupabaseApplication(data.id);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/photo') {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const objectPath = requestUrl.searchParams.get('path');
      if (!objectPath) throw new Error('사진 경로가 없습니다.');
      const response = await fetchStorageObject(objectPath);
      res.writeHead(200, {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/local-photo') {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const folder = requestUrl.searchParams.get('folder') || '';
      const file = requestUrl.searchParams.get('file') || '';
      const filePath = path.normalize(path.join(applicantsRoot, folder, file));
      if (!filePath.startsWith(applicantsRoot) || !fs.existsSync(filePath)) {
        notFound(res);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Server error' });
  }
}

function serveStatic(res, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicRoot, requestPath));
  if (!filePath.startsWith(publicRoot)) {
    notFound(res);
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    notFound(res);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  };

  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname);
    return;
  }
  serveStatic(res, pathname);
});

server.listen(port, '127.0.0.1', () => {
  const localUrl = `http://127.0.0.1:${port}`;
  console.log(`Han-Viet local admin: ${localUrl}`);
  if (process.env.HANVIET_NO_OPEN !== '1') {
    childProcess.exec(`start "" "${localUrl}"`);
  }
});
