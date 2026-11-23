// 진일 통합관리 데스크톱 실행 창: 주소창 없는 EXE의 소스 코드
// 운영 main 페이지에 바로 연결합니다. 통합 V72 배포 전까지는 기존 연결 테스트 화면입니다.
const { app, BrowserWindow, shell, dialog } = require('electron');
const START_URL = 'https://inowkim-glitch.github.io/';
const EXPECTED_HOST = 'inowkim-glitch.github.io';
function permitted(url) { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === EXPECTED_HOST; } catch { return false; } }
function openWindow() {
  const win = new BrowserWindow({
    title: '진일 통합관리',
    width: 1350, height: 900, minWidth: 840, minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    }
  });
  // 주소 표시줄이 없는 프로그램 전용 창을 사용합니다.
  win.webContents.setWindowOpenHandler(({url}) => {
    if (permitted(url)) return {action:'allow'};
    if (url.startsWith('https://')) shell.openExternal(url).catch(()=>{});
    return {action:'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!permitted(url)) { event.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url).catch(()=>{}); }
  });
  win.loadURL(START_URL);
  win.webContents.on('did-fail-load', (_event, code, message, validatedURL, isMainFrame) => {
    if (isMainFrame) dialog.showMessageBox(win,{type:'warning', title:'네트워크 연결',message:'진일 통합관리 페이지에 연결할 수 없습니다.',detail:String(message)+' ('+String(code)+')'});
  });
}
app.whenReady().then(() => { openWindow(); app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)openWindow()}); });
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
