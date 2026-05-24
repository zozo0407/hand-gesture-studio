# AI Coding Guide

这份文档给已经会使用 AI coding 工具的人，目标是让你快速把这个项目改成自己的手势交互原型、演出工具、教学 demo 或创意编码模板。

## 快速定位

- 应用入口：[src/main.js](src/main.js)
- 可改配置：[src/projectConfig.js](src/projectConfig.js)
- 手部几何和距离映射：[src/handOverlay.js](src/handOverlay.js)
- 手势标签、阈值和数字手势：[src/gestures.js](src/gestures.js)
- 区域特效类型和参数映射：[src/areaEffects.js](src/areaEffects.js)
- 声音映射：[src/audioMapping.js](src/audioMapping.js)
- 设置持久化：[src/settings.js](src/settings.js)
- 页面结构：[index.html](index.html)
- 样式：[src/styles.css](src/styles.css)

## 常见改法

### 使用数字手势作为触发条件

右手单手数字 `1-5` 的识别逻辑在 [src/gestures.js](src/gestures.js) 的 `recognizeDigitGesture()`。默认界面只显示稳定后的数字，不会自动修改区域特效类型。

如果要让某个数字触发自定义行为，可以从 [src/main.js](src/main.js) 的 `stableDigits.Right` 接入，但建议把具体映射放到一个独立模块，避免把交互规则散在绘制代码里。

### 新增一个 MediaPipe 原生手势

MediaPipe 返回的原生手势在 `results.gestures`。本项目当前支持：

- `Closed_Fist`
- `Open_Palm`
- `Pointing_Up`
- `Thumb_Up`
- `Thumb_Down`
- `Victory`
- `ILoveYou`

新增 UI 开关时，需要同步修改：

- [src/gestures.js](src/gestures.js) 的 `SUPPORTED_GESTURES`
- [index.html](index.html) 的手势列表
- 需要保存默认值时，[src/settings.js](src/settings.js) 会自动基于 `SUPPORTED_GESTURES` 生成默认开关

### 新增一个自定义数字或手指组合

看 [src/gestures.js](src/gestures.js) 的 `DIGIT_PATTERNS`。规则基于五指是否伸出：

```js
const DIGIT_PATTERNS = {
  1: { thumb: false, index: true, middle: false, ring: false, pinky: false },
  2: { thumb: false, index: true, middle: true, ring: false, pinky: false },
};
```

如果要识别更复杂的手势，优先在 `recognizeDigitGesture()` 旁边新增一个独立函数，并给它写 Vitest 测试。

### 新增一个可保存参数

需要同步修改四处：

1. [src/settings.js](src/settings.js) 的 `DEFAULT_SETTINGS`
2. [src/settings.js](src/settings.js) 的 `normalizeSettings()`
3. [src/main.js](src/main.js) 的 `applySettings()`
4. [src/main.js](src/main.js) 的 `getCurrentSettings()`

如果这个参数有 UI 控件，还要在 [index.html](index.html) 和 [src/styles.css](src/styles.css) 里补界面。

### 替换模型或 WASM 路径

路径集中在 [src/projectConfig.js](src/projectConfig.js)：

```js
export const MEDIAPIPE_ASSETS = {
  modelUrl: "/mediapipe/models/gesture_recognizer.task",
  wasmUrl: "/mediapipe/wasm",
};
```

线上部署时，模型和 WASM 需要从同源 HTTPS 地址加载。本项目默认把资源放在 `public/mediapipe`，Vite 会原样复制到站点根路径。

## 可以直接给 AI coding 工具的提示词

### 做一个新的交互映射

```text
阅读这个 Vite 项目。我要新增一个手势交互：当右手 Thumb_Up 稳定出现时，把区域特效切换成 liquidGlass；当右手 Closed_Fist 稳定出现时暂停声音。请优先复用 src/gestures.js 的稳定手势逻辑，保持现有测试通过，并补充必要测试。
```

### 新增区域特效

```text
在这个项目里新增一个区域特效 "edgeGlow"。请在 src/areaEffects.js 注册类型，在 index.html 的 select 里加选项，在 src/main.js 的 drawAreaEffect() 中实现绘制。效果只应该出现在圆圈或双手相连区域内，不能影响整张画面。完成后运行 npm test -- --run 和 npm run build。
```

### 接入外部可视化库

```text
把当前 hand landmarks 和 normalized length 暴露给一个新的模块 src/interactionState.js，让其他可视化代码可以订阅每帧的左右手状态。不要改变现有 UI 行为。请给状态转换写单元测试，并说明哪个函数是外部接入入口。
```

### 做成自己的品牌模板

```text
把这个项目改成我的品牌版本：应用名改为「你的名字」，README 改成适合公开 GitHub 仓库的英文/中文双语说明，保留 MediaPipe 本地资源说明和 MIT License。不要改核心手势逻辑。
```

## 修改后验证

每次改动后至少运行：

```bash
npm test -- --run
npm run build
```

涉及浏览器摄像头、WebGL 或声音的改动，还需要手动打开本地页面验证：

```bash
npm run dev
```

浏览器摄像头权限通常只在 `localhost` 或 HTTPS 下可用。
