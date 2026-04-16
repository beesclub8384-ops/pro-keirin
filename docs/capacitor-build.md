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
├── server.url: https://pro-keirin.vercel.app/interview
└── android.allowNavigation: [pro-keirin.vercel.app]
```

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

### 릴리스 APK (서명 필요)

```bash
cd android
./gradlew assembleRelease
```

서명 설정은 `android/app/build.gradle`에서 `signingConfigs` 추가 필요.

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
