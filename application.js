(function () {
  const form = document.getElementById('applicationForm');
  if (!form) return;

  const statusBox = document.getElementById('applicationStatus');
  const submitButton = form.querySelector('button[type="submit"]');
  const SUPABASE_URL = window.HANVIET_SUPABASE_URL;
  const SUPABASE_KEY = window.HANVIET_SUPABASE_KEY;
  const BUCKET = 'member-photo';

  function setStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = 'form-status ' + (type || '');
  }

  function getValue(name) {
    const el = form.elements[name];
    return el ? String(el.value || '').trim() : '';
  }

  function getNumber(name) {
    const value = getValue(name);
    return value === '' ? null : Number(value);
  }

  function getChecked(name) {
    const el = form.elements[name];
    return Boolean(el && el.checked);
  }

  function getFile(name) {
    const el = form.elements[name];
    return el && el.files && el.files[0] ? el.files[0] : null;
  }

  function isNetworkFetchError(error) {
    const message = String(error && error.message ? error.message : error || '');
    return /failed to fetch|networkerror|load failed|fetch/i.test(message);
  }

  function explainNetworkError(target) {
    const localFileNotice = window.location.protocol === 'file:'
      ? ' 현재 파일을 file:// 방식으로 직접 열고 있어 브라우저가 Supabase 요청을 차단할 수 있습니다.'
      : '';

    return `${target} 실패: Supabase 서버에 연결하지 못했습니다.${localFileNotice} `
      + 'Vercel 배포 주소 또는 http://localhost 테스트 서버에서 다시 확인하고, '
      + 'supabase-config.js의 Publishable key 전체값과 Storage bucket/member-photo 정책을 확인하세요.';
  }

  function validateConfig() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결 또는 CDN 차단 여부를 확인하세요.');
    }

    if (!SUPABASE_URL || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
      throw new Error('Supabase URL 형식이 올바르지 않습니다. supabase-config.js 파일을 확인하세요.');
    }

    if (!SUPABASE_KEY || SUPABASE_KEY.includes('PASTE_YOUR')) {
      throw new Error('Supabase Publishable key가 아직 입력되지 않았습니다. supabase-config.js 파일을 확인하세요.');
    }

    if (SUPABASE_KEY.startsWith('sb_secret_')) {
      throw new Error('Secret key는 홈페이지에 넣으면 안 됩니다. Publishable key를 입력하세요.');
    }

    if (!SUPABASE_KEY.startsWith('sb_publishable_') && !SUPABASE_KEY.startsWith('eyJ')) {
      throw new Error('Supabase 키는 Publishable key 또는 legacy anon public key를 사용해야 합니다.');
    }
  }

  function validateFile(file) {
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 8 * 1024 * 1024;
    if (!allowedTypes.includes(file.type)) {
      throw new Error('사진은 jpg, jpeg, png, webp 형식만 업로드할 수 있습니다.');
    }
    if (file.size > maxSize) {
      throw new Error('사진 1장당 최대 8MB까지만 업로드할 수 있습니다.');
    }
  }

  function safeExt(file) {
    const original = (file.name.split('.').pop() || '').toLowerCase();
    if (original === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp'].includes(original)) return original;
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    return 'jpg';
  }

  async function uploadPhoto(client, file, label) {
    if (!file) return null;
    validateFile(file);

    const random = Math.random().toString(36).slice(2, 10);
    const path = `applications/${Date.now()}-${random}-${label}.${safeExt(file)}`;

    let result;
    try {
      result = await client.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined
      });
    } catch (error) {
      if (isNetworkFetchError(error)) {
        throw new Error(explainNetworkError('사진 업로드'));
      }
      throw error;
    }

    if (result.error) {
      if (isNetworkFetchError(result.error)) {
        throw new Error(explainNetworkError('사진 업로드'));
      }
      throw new Error(`사진 업로드 실패: ${result.error.message}`);
    }

    return path;
  }

  async function insertApplication(client, payload) {
    let result;
    try {
      result = await client.from('applications').insert(payload);
    } catch (error) {
      if (isNetworkFetchError(error)) {
        throw new Error(explainNetworkError('신청서 저장'));
      }
      throw error;
    }

    if (result.error) {
      if (isNetworkFetchError(result.error)) {
        throw new Error(explainNetworkError('신청서 저장'));
      }
      throw new Error(`신청서 저장 실패: ${result.error.message}`);
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setStatus('', '');

    try {
      validateConfig();
      if (!getChecked('agree_privacy') || !getChecked('agree_third_party')) {
        throw new Error('개인정보 수집·이용 및 제3자 제공 동의가 필요합니다.');
      }

      submitButton.disabled = true;
      submitButton.textContent = '제출 중입니다...';
      setStatus('사진 업로드 및 신청서 저장을 진행하고 있습니다.', 'info');

      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const photoFace = await uploadPhoto(client, getFile('photo_face'), 'face');
      const photoBody = await uploadPhoto(client, getFile('photo_body'), 'body');

      const payload = {
        name: getValue('name'),
        phone: getValue('phone'),
        birth_year: getNumber('birth_year'),
        city: getValue('city'),
        marriage: getValue('marriage'),
        job: getValue('job'),
        height: getNumber('height'),
        weight: getNumber('weight'),
        drink: getValue('drink') || null,
        smoke: getValue('smoke') || null,
        hope: getValue('hope'),
        introduce: getValue('introduce'),
        photo_face: photoFace,
        photo_body: photoBody,
        agree_privacy: true,
        agree_third_party: true
      };

      await insertApplication(client, payload);

      form.reset();
      setStatus('신청서가 정상 접수되었습니다. 확인 후 순서대로 연락드리겠습니다.', 'success');
    } catch (error) {
      setStatus(error.message || '제출 중 오류가 발생했습니다.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '매칭 신청서 제출하기';
    }
  });
})();
