import './style.css';
import { App } from './app/app';
import { UI } from './ui/ui';

const app = new App();
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const splash = document.getElementById('splash')!;
const err = document.getElementById('splash-error')!;

// Browsers only allow audio to start after a user gesture, hence the start button.
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';
  try {
    await app.init();
    await app.engine.resume();
    new UI(app).init();
    splash.classList.add('hidden');
    // expose for debugging in the browser console
    (window as unknown as { endodj: App }).endodj = app;
  } catch (e) {
    console.error(e);
    err.textContent = `EndoDJ could not start: ${(e as Error).message}`;
    startBtn.disabled = false;
    startBtn.textContent = 'Try again';
  }
});
