(() => {
    const theme = document.getElementById('adminTheme');
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const key = 'jesr-admin-theme';
    try {
        const saved = localStorage.getItem(key);
        if (['light', 'dark', 'system'].includes(saved)) theme.value = saved;
    } catch {}
    function applyTheme() {
        document.documentElement.dataset.adminTheme =
            theme.value === 'system' ? (system.matches ? 'dark' : 'light') : theme.value;
    }
    applyTheme();
    theme.addEventListener('change', () => {
        applyTheme();
        try { localStorage.setItem(key, theme.value); } catch {}
    });
    system.addEventListener('change', applyTheme);

    const form = document.getElementById('adminPasswordForm');
    const status = document.getElementById('adminPasswordStatus');
    const button = form.querySelector('button');
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        const user = firebase.auth().currentUser;
        const current = document.getElementById('adminCurrentPassword').value;
        const next = document.getElementById('adminNewPassword').value;
        if (!user?.email || !canOpenAdminPage('settings')) {
            status.textContent = 'سجّل دخولك بحساب الإدارة من جديد.';
            return;
        }
        if (next !== document.getElementById('adminConfirmPassword').value || next === current) {
            status.textContent = next === current ? 'اختار كلمة سر مختلفة عن الحالية.' : 'تأكيد كلمة السر مش مطابق.';
            return;
        }
        button.disabled = true;
        status.textContent = 'جارٍ حفظ كلمة السر…';
        try {
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, current);
            await user.reauthenticateWithCredential(credential);
            await user.updatePassword(next);
            form.reset();
            status.textContent = 'تم تغيير كلمة سر حسابك.';
        } catch (error) {
            const messages = {
                'auth/wrong-password':'كلمة السر الحالية غير صحيحة.',
                'auth/invalid-credential':'تعذّر التحقق من كلمة السر الحالية.',
                'auth/invalid-login-credentials':'تعذّر التحقق من كلمة السر الحالية.',
                'auth/weak-password':'اختار كلمة سر أقوى.',
                'auth/password-does-not-meet-requirements':'كلمة السر الجديدة ما بتطابق شروط الحساب.',
                'auth/too-many-requests':'في محاولات كثيرة. جرّب بعد شوي.',
                'auth/network-request-failed':'تعذّر الاتصال. افحص الإنترنت وحاول مرة ثانية.'
            };
            status.textContent = messages[error.code] || 'تعذّر تغيير كلمة السر. سجّل دخولك من جديد وحاول مرة ثانية.';
        } finally { button.disabled = false; }
    });
})();
