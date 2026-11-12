/**
 * Entry point.
 *
 *  1. Apply theme.
 *  2. If Supabase is configured → restore the session or show the sign-in screen.
 *     If not → run in session mode (data in tab memory only).
 *  3. Render the shell, load every table, start the router and notification ticker.
 */
import { applyTheme } from './state/prefs.js';
import { store } from './state/store.js';
import { isSupabaseConfigured } from './config.js';
import { setDataMode } from './lib/dataAdapter.js';
import { authService } from './services/authService.js';
import { loadAllData } from './services/index.js';
import { checkAiStatus } from './services/aiStatus.js';
import { loadSampleData } from './services/sampleData.js';
import { toast } from './lib/ui.js';
import { startNotificationTicker } from './services/notificationsService.js';
import { renderShell } from './components/shell.js';
import { renderLogin } from './pages/login.js';
import { startRouter } from './router.js';
import { esc } from './lib/dom.js';

async function boot() {
  const app = document.getElementById('app');
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  try {
    if (isSupabaseConfigured()) {
      const user = await authService.init();
      if (!user) {
        renderLogin(app);
        return;
      }
      setDataMode('supabase', user.id);
      store.setMeta({ mode: 'supabase', user });
    } else {
      setDataMode('session');
      store.setMeta({ mode: 'session', user: null });
    }

    renderShell(app);
    const errors = await loadAllData();
    store.setMeta({ loadErrors: errors });
    if (errors.length) console.warn('Life OS: some tables failed to load', errors);
    // Урьдчилан харах хувилбар (preview.html): session горимд жишээ өгөгдлийг шууд ачаална.
    if (window.LIFEOS_DEMO && store.meta().mode === 'session') {
      await loadSampleData();
      toast('Жишээ өгөгдөлтэй урьдчилан харах хувилбар. Өөрчлөлт хадгалагдахгүй.');
    }
    startRouter();
    startNotificationTicker();
    // AI зөвхөн эзэмшигчид: функцээс төлөвийг асууна (Claude дуудахгүй). Бэлэн бол хуудас шинэчлэгдэж AI асна.
    if (store.meta().mode === 'supabase') checkAiStatus();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="boot"><div class="boot-mark">Life OS</div>
      <p class="boot-error"><strong>Апп эхэлж чадсангүй.</strong><br>${esc(err.message)}</p>
      <p class="muted small">Дэлгэрэнгүйг js/config.js болон хөтчийн консолоос шалгана уу.</p></div>`;
  }
}

boot();
