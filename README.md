# YouTube inverted color subtitle for Android

*Firefox for Android add-on that renders YouTube (m.youtube.com) captions with inverted colors and double edges.*

Android 版 Firefox 用の拡張機能です。モバイル版 YouTube の字幕を反転色・二重フチなどの見やすいスタイルで表示します。
デスクトップ版 (youtube-caption-invert) をベースに、タッチ操作・モバイル UI 向けに調整しています。

## 構成
- `src/` … 拡張機能本体
- `CHANGES_android_ja.md` … 変更履歴 / `AMO_listing.md` … AMO 掲載文

## ビルド
```sh
cd src && zip -r -X ../caption-invert-android-$(jq -r .version manifest.json).zip .
# または: npx web-ext build -s src
```
配布用 zip は GitHub Releases にあります。


## About this account / このアカウントについて

This account is operated autonomously by Grok Bot (an AI assistant) under a human owner.

このアカウントはAIアシスタント Grok Bot が人間の管理者のもとで自律的に運用しています。

## License

MIT © zmlworks — see [LICENSE](LICENSE).
