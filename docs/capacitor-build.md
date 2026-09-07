# Capacitor 안드로이드 빌드 가이드

## 개요

이 앱은 Capacitor를 사용해 `pro-keirin.vercel.app/interview`를 웹뷰로 로드하는 안드로이드 앱입니다.
웹 사이트를 수정하면 앱에도 자동 반영됩니다 (별도 앱 업데이트 불필요).

## 사전 요구사항

- Node.js 18+
- Android Studio (최신 버전)
- Android SDK (API 34+)
- Java 17+

## 설정 확인

```
capacitor.config.ts
├── appId: com.sevenrandoms.interview
├── appName: 7RANDOMS 인터뷰
├── webDir: capacitor-www          ← 로컬 자산(error.html) 소스
├── server.url: https://pro-keirin.vercel.app/interview
├── server.errorPath: error.html   ← 네트워크 실패 시 띄울 로컬 페이지
└── server.allowNavigation: [pro-keirin.vercel.app]
```

### 오프라인/에러 화면

원격 로드가 실패하면 Capacitor 가 `http://localhost/error.html` 을 띄운다.
그 실체는 `capacitor-www/error.html` 이고, `npx cap sync` 가
`android/app/src/main/assets/public/` 로 복사한다.

- `assets/public/` 은 gitignore 대상이고 `cap sync` 가 **매번 통째로 지운 뒤** 다시 채운다.
  거기 직접 파일을 만들면 sync 한 번에 사라지니 반드시 `capacitor-www/` 를 고칠 것.
- `error.html` 은 **외부 리소스를 참조하면 안 된다**(CDN·웹폰트·이미지 전부 금지).
  이 화면이 뜨는 시점이 곧 네트워크가 죽은 시점이다.
- 앱 주소가 `error.html` 안에 하드코딩돼 있다. `server.url` 을 바꾸면 그쪽 `APP_URL` 도 같이 고칠 것.

## 빌드 방법

### 1. 프로젝트 동기화

```bash
npm run cap:sync
```

### 2. Android Studio에서 열기

```bash
npm run cap:open
```

### 3. Android Studio에서 실행

- Android Studio가 열리면 에뮬레이터 또는 실제 기기 선택
- Run 버튼 클릭

### 4. CLI로 바로 실행 (에뮬레이터/USB 기기)

```bash
npm run cap:run
```

## APK 생성

### 디버그 APK

```bash
cd android
./gradlew assembleDebug
```

생성 경로: `android/app/build/outputs/apk/debug/app-debug.apk`

## 릴리스 서명 (플레이스토어 업로드용)

### 1. 키스토어 생성 — 최초 1회

```bash
keytool -genkey -v -keystore sevenrandoms-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias sevenrandoms
```

> ### 🚨 이 파일과 비밀번호를 잃어버리면 앱 업데이트가 **영구 불가능**하다.
> 구글도 복구해 주지 않는다. 같은 패키지명으로 다시 올릴 수 없어
> 새 앱으로 처음부터 시작해야 하고, 기존 설치 사용자는 전부 잃는다.
> **반드시 2곳 이상에 백업할 것** (예: Google Drive + 외장 디스크/USB).
> 비밀번호도 키 파일과 별개로 안전한 곳에 적어둘 것.

키스토어는 레포 밖(예: `C:/keys/`)에 두는 것을 권장한다.
`.jks` / `.keystore` / `android/keystore.properties` 는 `.gitignore` 대상이다.

### 2. 키 정보 등록

`android/keystore.properties.example` 을 `android/keystore.properties` 로 복사하고 값을 채운다.

```properties
storeFile=C:/keys/sevenrandoms-release.jks
storePassword=...
keyAlias=sevenrandoms
keyPassword=...
```

`android/app/build.gradle` 이 이 파일을 읽어 `signingConfigs.release` 를 구성한다.
**파일이 없으면 서명 설정을 통째로 건너뛰므로**, 키스토어가 없는 PC 에서도
`assembleDebug` 는 문제없이 돈다.

### 3. AAB 빌드 — 플레이스토어는 APK 가 아니라 AAB 를 받는다

```bash
cd android
./gradlew bundleRelease
```

산출물: `android/app/build/outputs/bundle/release/app-release.aab`

### 릴리스 APK (스토어 밖 직접 배포용)

```bash
cd android
./gradlew assembleRelease
```

산출물: `android/app/build/outputs/apk/release/app-release.apk`

### 버전 올리기

업로드할 때마다 `android/app/build.gradle` 의 `versionCode` 를 반드시 +1 한다
(같은 versionCode 는 재업로드 거부된다). `versionName` 은 사용자에게 보이는 표기.

## 설정 변경 후 반영

`capacitor.config.ts`를 수정한 경우:

```bash
npm run cap:sync
```

## 아이콘 / 스플래시 변경

`android/app/src/main/res/` 하위의 `mipmap-*` (아이콘), `drawable` (스플래시) 폴더에서 이미지 교체.

또는 `@capacitor/assets` 패키지 사용:

```bash
npx @capacitor/assets generate --android
```

## 웹 업데이트 방법

server.url이 Vercel 배포 URL을 가리키므로, 웹 코드를 master에 push하면 앱에도 자동 반영됩니다.
앱 스토어 업데이트가 필요한 경우는 네이티브 코드(Java/Kotlin) 변경 시에만 해당됩니다.
