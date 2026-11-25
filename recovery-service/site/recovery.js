const element = id => document.getElementById(id);
const statusBox = element('status');
const sessionKey = 'camp-first-activation';
let session = sessionStorage.getItem(sessionKey);
const resetCode = new URLSearchParams(location.search).get('reset');
if (resetCode) history.replaceState(null, '', location.pathname);

function view(name, message = '') {
  for (const id of ['identity', 'questions', 'password']) element(id).hidden = id !== name;
  statusBox.textContent = message;
}

async function api(name, data = {}) {
  const response = await fetch('/api/' + name, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({...data, session})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function submit(id, action) {
  const form = element(id);
  const button = form.querySelector('button');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      if (error.message === 'session') {
        sessionStorage.removeItem(sessionKey);
        session = null;
        view('identity', 'انتهت جلسة التحقّق. أدخل هويتك من جديد.');
      } else {
        statusBox.textContent = {
          identity: 'أدخل رقم هوية من 9 أرقام.',
          password: 'استخدم 8 أحرف على الأقل مع حروف وأرقام.',
          'reset-code': 'الرابط منتهي أو مستخدم. اطلب رابط جديد من الإدارة.',
          authorization: 'انتهت مهلة التحقّق. ارجع لبداية التفعيل وحاول مرة ثانية.'
        }[error.message] || 'تعذّر إكمال الطلب. افحص الاتصال أو تواصل مع الإدارة.';
      }
    } finally {
      button.disabled = false;
    }
  });
}

function showState(state, retryAfterSeconds) {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds || 1800) / 60));
  switch (state) {
    case 'verified': view('password', 'الإجابات مطابقة. أنشئ كلمة المرور.'); break;
    case 'locked': view(null, 'وصلت لحدّ المحاولات. جرّب بعد حوالي ' + minutes + ' دقيقة.'); break;
    case 'busy': view('questions', 'في جلسة تفعيل مفتوحة. كمّل من التبويب الأول أو جرّب بعد حوالي ' + minutes + ' دقيقة.'); break;
    case 'processing': view(null, 'جارٍ إنشاء الحساب. حدّث الصفحة للتحقّق من الحالة.'); break;
    case 'existing': view(null, 'الحساب موجود. سجّل الدخول أو تواصل مع الإدارة إذا نسيت كلمة المرور.'); break;
    case 'contact': view(null, 'تعذّر تفعيل حساب الأسرة. تواصل مع الإدارة.'); break;
    case 'completed':
      sessionStorage.removeItem(sessionKey);
      session = null;
      view(null, 'تم تعيين كلمة المرور. ارجع لبوابة العائلة وسجّل الدخول.');
      break;
    default: view('questions');
  }
}

submit('identity', async () => {
  const result = await api('start', {id:element('id').value});
  session = result.session;
  sessionStorage.setItem(sessionKey, session);
  view('questions', 'إلك ثلاث محاولات للتحقّق.');
});
submit('questions', async () => {
  const result = await api('verify', {
    spouse:element('spouse').value,
    members:element('members').value,
    phone:element('phone').value
  });
  if (result.state === 'incorrect') {
    const remaining = result.remaining == null ? '' : ' عدد المحاولات المتبقية: ' + result.remaining;
    view('questions', 'الإجابات غير مطابقة.' + remaining);
  } else {
    element('questions').reset();
    showState(result.state, result.retryAfterSeconds);
  }
});
submit('password', async () => {
  const password = element('newPassword').value;
  const result = resetCode ? await api('complete-reset', {code:resetCode, password}) : await api('password', {password});
  element('password').reset();
  showState(result.state, result.retryAfterSeconds);
});
async function refresh() {
  try {
    const result = await api('status');
    showState(result.state, result.retryAfterSeconds);
  } catch {
    view('identity', 'تعذّر استرجاع الجلسة. أدخل هويتك من جديد.');
  }
}

if (resetCode) {
  document.querySelector('h1').textContent = 'إعادة تعيين كلمة سر العائلة';
  element('password').querySelector('button').textContent = 'حفظ كلمة السر الجديدة';
  view('password', 'اختار كلمة سر جديدة لحسابك.');
} else if (session) refresh();
