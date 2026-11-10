// Sesión del usuario. El usuario y la contraseña se validan en el Apps Script
// (nunca en el navegador); aquí solo se guarda la sesión que devuelve y los
// permisos del usuario para mostrar u ocultar módulos.
import { authCall } from './sheets.js';

const KEY = 'cif_session';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

const Auth = {
  session: read,
  token: () => (read() || {}).token || '',
  user: () => (read() || {}).user || null,
  isAdmin: () => (Auth.user() || {}).role === 'admin',
  // ¿Puede abrir este módulo? Los administradores pueden todo.
  can(key) {
    const u = Auth.user();
    if (!u) return false;
    if (u.role === 'admin') return true;
    if (key === 'users') return false;
    return (u.permissions || []).includes(key);
  },

  async login(username, password) {
    const res = await authCall('login', { username, password });
    localStorage.setItem(KEY, JSON.stringify({ token: res.token, user: res.user }));
    return res.user;
  },

  setUser(user) {
    const s = read();
    if (s) localStorage.setItem(KEY, JSON.stringify({ ...s, user }));
  },

  // Refresca permisos (si un administrador los cambió) y valida la sesión.
  async refresh() {
    const res = await authCall('me', {});
    if (!res || !res.user || !res.user.id) return Auth.user(); // respuesta rara: se conservan los permisos
    Auth.setUser(res.user);
    return res.user;
  },

  async changePassword(current, next) {
    const res = await authCall('changePassword', { current, next });
    Auth.setUser(res.user);
    return res.user;
  },

  // Cierra la sesión y borra los datos guardados en este navegador (se
  // vuelven a descargar al entrar), para no dejarlos en un equipo compartido.
  async logout({ remote = true } = {}) {
    if (remote) { try { await authCall('logout', {}); } catch { /* sesión ya vencida */ } }
    const keep = new Set(['acc_nav_open', 'acc_nav_pinned']);
    for (const k of Object.keys(localStorage)) {
      if ((k.startsWith('cif_') || k.startsWith('sbx_')) && !keep.has(k)) localStorage.removeItem(k);
    }
    localStorage.removeItem(KEY);
  }
};

export default Auth;
