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

  function validateConfig() {
    if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY.includes('PASTE_YOUR')) {
      throw new Error('Supabase Publishable key가 아직 입력되지 않았습니다. supabase-config.js 파일을 확인하세요.');
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
    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });

    if (error) {
      throw new Error(`사진 업로드 실패: ${error.message}`);
    }

    return path;
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

      const { error } = await client.from('applications').insert(payload);
      if (error) {
        throw new Error(`신청서 저장 실패: ${error.message}`);
      }

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
