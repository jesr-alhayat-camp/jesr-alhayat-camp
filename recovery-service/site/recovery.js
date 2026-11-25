const element = id => document.getElementById(id);
const statusBox = element('status');
const sessionKey = 'camp-first-activation';
let session = sessionStorage.getItem(sessionKey);

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
          authorization: 'انتهت مهلة التحقّق. ارجع لبداية التفعيل وحاول مرة ثانية.'
        }[error.message] || 'تعذّر إكمال الطلب. افحص الاتصال أو تواصل مع الإدارة.';
      }
    } finally {
      button.disabled = false;
    }
  });
}

function showState(state) {
  switch (state) {
    case 'verified': view('password', 'الإجابات مطابقة. أنشئ كلمة المرور.'); break;
    case 'locked': view(null, 'التحقّق متوقف مؤقتًا. جرّب بعد 30 دقيقة، أو تواصل مع الإدارة.'); break;
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
    view('questions', 'الإجابات غير مطابقة. عدد المحاولات المتبقية: ' + result.remaining);
  } else if (result.state === 'locked') {
    view(null, 'التحقّق متوقف مؤقتًا. جرّب بعد 30 دقيقة، أو تواصل مع الإدارة.');
  } else {
    element('questions').reset();
    showState(result.state);
  }
});
submit('password', async () => {
  const result = await api('password', {password:element('newPassword').value});
  element('password').reset();
  showState(result.state);
});
async function refresh() {
  try {
    showState((await api('status')).state);
  } catch {
    view('identity', 'تعذّر استرجاع الجلسة. أدخل هويتك من جديد.');
  }
}

if (session) refresh();
