/* Existing Supabase account. Change only this address if your administrator uses another email. */
window.LAPSHA_ADMIN_EMAIL = 'admin@gmail.com';
window.lapshaLoginEmail = value => {const login=String(value||'').trim();return login.toLowerCase()==='admin'?window.LAPSHA_ADMIN_EMAIL:login;};
