import type { CapacitorConfig } from '@capacitor/cli';

// webDir 는 '네이티브에 심는 로컬 자산' 폴더다.
// 이 앱은 server.url(원격 Vercel)을 로드하므로 로컬 번들이 필요 없지만,
// 네트워크 실패용 error.html 은 반드시 기기 안에 있어야 한다 (그때는 네트워크가 없으니까).
//
// ⚠️ 'out' 이 아니라 전용 폴더인 이유:
//    - /out/ 은 .gitignore 대상 → 거기 두면 커밋이 안 되고 다른 작업 PC에서 사라진다.
//    - npx cap sync 는 android/app/src/main/assets/public 을 통째로 지운 뒤
//      webDir 을 복사한다 (@capacitor/cli tasks/copy.js copyWebDir).
//      즉 assets/public 을 직접 고쳐도 sync 한 번이면 날아간다.
//    → 커밋되는 capacitor-www/ 를 webDir 로 두면 sync 가 매번 error.html 을 넣어준다.
const config: CapacitorConfig = {
  appId: 'com.sevenrandoms.interview',
  appName: '7RANDOMS 인터뷰',
  webDir: 'capacitor-www',
  server: {
    url: 'https://pro-keirin.vercel.app/interview',
    cleartext: false,
    allowNavigation: ['pro-keirin.vercel.app'],
    // 원격 로드 실패 시 띄울 로컬 페이지. http://localhost/error.html 로 해석된다.
    errorPath: 'error.html',
  },
};

export default config;
