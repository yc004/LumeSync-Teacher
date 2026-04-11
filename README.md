# LumeSync Teacher

鏁欏笀绔闈㈠簲鐢紝璐熻矗璇剧▼鏂囦欢绠＄悊銆佽鍫傛帶鍒跺拰鏈湴璇惧爞鏈嶅姟銆?
## 鍔熻兘姒傝

- 鍚姩妗岄潰绔帶鍒跺彴锛圗lectron锛夈€?- 鑷姩鎷夎捣鏈湴鏁欏鏈嶅姟锛圗xpress + Socket.io锛岄粯璁ょ鍙?`3000`锛夈€?- 绠＄悊璇剧▼鏂囦欢锛堝鍏?瀵煎嚭銆佹枃浠跺す缁勭粐銆佸垹闄ゃ€佸埛鏂帮級銆?- 璇惧爞鎺у埗涓庡疄鏃跺悓姝ワ紙閫夎銆佺炕椤点€佷簰鍔ㄣ€佹爣娉ㄣ€佹姇绁ㄣ€佹敹闆嗗鐢熸彁浜わ級銆?- 鏀寔鏃ュ織鐩綍鎵撳紑銆佹彁浜ょ洰褰曡缃€佺郴缁熸墭鐩樺父椹汇€?
## 鐩綍缁撴瀯

```text
electron/          # 鏁欏笀绔闈富杩涚▼涓?preload
server/            # 鏈湴璇惧爞鏈嶅姟锛圓PI + Socket锛?packages/          # engine/runtime-control/render-engine
common/            # 鍏叡 Electron 閰嶇疆涓庢棩蹇楄兘鍔?shared/public/     # 璇剧▼闈欐€佽祫婧愮洰褰曪紙榛樿锛?submissions/       # 瀛︾敓鎻愪氦榛樿钀界洏鐩綍
scripts/           # 鍚姩鑴氭湰
```

## 蹇€熷紑濮?
```bash
pnpm install
pnpm run start
```

鍚姩閾捐矾锛?
1. `scripts/start-electron.js` 鍚姩 Electron銆?2. `electron/main.js` 妫€鏌?`3000` 绔彛鍙敤鎬с€?3. 鑻ョ鍙ｇ┖闂诧紝鎷夎捣 `server/index.js`锛涜嫢宸叉湁鍋ュ悍鏈嶅姟鍒欏鐢ㄣ€?4. 鎵撳紑 `http://127.0.0.1:3000` 浣滀负鏁欏笀绔富鐣岄潰銆?
## 甯哥敤鍛戒护

- `pnpm run start`锛氬惎鍔ㄦ暀甯堢妗岄潰搴旂敤锛堟帹鑽愶級
- `pnpm run start:server`锛氫粎鍚姩鏈湴璇惧爞鏈嶅姟锛堜究浜?API 鑱旇皟锛?- `pnpm run build`锛氭墦鍖呮闈㈠畨瑁呭寘锛坋lectron-builder锛?
## 鏈嶅姟鎺ュ彛

API 鍚屾椂鎸傝浇鍦?`/api` 涓?`/api/teacher`锛屽父鐢ㄧ鐐癸細

- `GET /api/health`
- `GET /api/courses`
- `POST /api/refresh-courses`
- `DELETE /api/delete-course`
- `POST /api/course-folders`
- `POST /api/save-submission`
- `GET /api/submissions/:courseId`
- `POST /api/submissions/:courseId/download-batch`
- `GET /api/students`
- `GET /api/student-log`

## 鍏抽敭鐜鍙橀噺锛坰erver锛?
| 鍙橀噺 | 榛樿鍊?| 璇存槑 |
| --- | --- | --- |
| `PORT` | `3000` | 鏈湴鏈嶅姟绔彛 |
| `STATIC_DIR` | `shared/public` | 闈欐€佽祫婧愭牴鐩綍 |
| `LUMESYNC_PUBLIC_DIR` | `shared/public` | 璇剧▼涓庨潤鎬佽祫婧愮洰褰?|
| `LUMESYNC_COURSES_DIR` | `<public>/courses` | 璇剧▼鏂囦欢鐩綍 |
| `LUMESYNC_SUBMISSIONS_DIR` | `./submissions` | 瀛︾敓鎻愪氦鐩綍 |
| `LUMESYNC_SUBMISSIONS_CONFIG` | `./submissions-config.json` | 鎻愪氦鐩綍閰嶇疆鏂囦欢 |

璇存槑锛氫娇鐢?`pnpm run start` 鏃讹紝涓婅堪鏍稿績鍙橀噺浼氱敱 `electron/main.js` 鑷姩娉ㄥ叆锛屾棤闇€鎵嬪姩閰嶇疆銆?
## 鎵撳寘鍙戝竷

```bash
pnpm run build
```

- 鎵撳寘閰嶇疆锛歚electron-builder.json`
- 浜х墿鐩綍锛歚../../dist/teacher`
- Windows 鐩爣锛歚nsis`锛坄x64`锛?
## 甯歌闂

1. 鏁欏笀绔惎鍔ㄦ彁绀虹鍙ｈ鍗犵敤
绔彛 `3000` 琚潪 LumeSync 杩涚▼鍗犵敤鏃讹紝搴旂敤浼氭嫆缁濆惎鍔ㄣ€傚厛閲婃斁绔彛鍚庨噸璇曘€?
2. 椤甸潰涓€鐩村姞杞藉け璐?浼樺厛妫€鏌ユ湰鍦版湇鍔″仴搴锋帴鍙?`http://127.0.0.1:3000/api/health`锛屽啀鏌ョ湅鏃ュ織鐩綍锛堝簲鐢ㄥ唴鈥滄墦寮€鏃ュ織鐩綍鈥濓級銆?
3. 瀵煎叆璇剧▼鍚庣湅涓嶅埌
纭鏂囦欢鎵╁睍鍚嶄负 `.lume/.tsx/.ts/.jsx/.js/.pdf`锛屽苟鍦ㄧ晫闈㈡墽琛屽埛鏂拌绋嬪垪琛ㄣ€?
## 鐩稿叧鏂囨。

- [server/src/README.md](./server/src/README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [LICENSE](./LICENSE)

