function showCampStartupError() {
    if (document.getElementById('campStartupError')) return;
    const message = document.createElement('div');
    message.id = 'campStartupError';
    message.setAttribute('role', 'alert');
    message.style.cssText = 'position:fixed;top:1rem;left:1rem;right:1rem;z-index:99999;padding:1rem;background:#fff3cd;color:#402e00;border-radius:8px;text-align:center';
    message.textContent = 'تعذر تشغيل تسجيل الدخول. تحقق من اتصالك ثم أعد تحميل الصفحة. ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'إعادة التحميل';
    retry.onclick = () => location.reload();
    message.appendChild(retry);
    document.body.prepend(message);
    document.querySelectorAll('#normalLoginForm, #firstLoginForm, #adminLoginForm').forEach(form => {
        form.addEventListener('submit', event => event.preventDefault());
    });
}

async function prepareCampAuth(auth) {
    const persistence = firebase.auth.Auth.Persistence;
    try {
        await auth.setPersistence(persistence.SESSION);
    } catch (error) {
        await auth.setPersistence(persistence.NONE);
    }
}

if (!window.firebase || !firebase.auth || !firebase.database) showCampStartupError();
