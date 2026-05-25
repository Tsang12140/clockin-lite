# 设计规范

## 配色

| 用途 | 颜色 |
|------|------|
| 页面底色 | `#F0F4FA` |
| 主品牌蓝（标题、核心数字） | `#1A3A8F` |
| 按钮/选中态 | `#3370FF` |
| 按钮 hover | `#245BDB` |
| 筛选容器底色 | `#E8EEF8` |
| 卡片底色 | `#FFFFFF` + `shadow-sm` |
| 状态绿 | `#16A34A` |
| 状态红 | `#DC2626` |

## 字重

- 页面主标题：`font-semibold`
- 区块/卡片标题/姓名：`font-medium`
- 标签/说明/副标题/日期：`font-normal`
- 核心金额/统计数字：`font-bold`
- 禁止大面积使用 `font-bold` / `font-black`

## 组件规范

### 筛选栏（iOS Segmented Control）
使用 `.seg-ctrl` 类（定义于 globals.css）：
```jsx
<div className="seg-ctrl">
  <button className={active ? 'active' : ''}>标签</button>
</div>
```

### 底部 Tab 导航
`/components/BottomNav.tsx` — 图标 + 文字，选中蓝色圆角背景。

### 抽屉
使用 `vaul` 库，默认高度 `82dvh`，顶部 drag handle + 左侧关闭 + 中间标题。

### 卡片
`bg-white rounded-2xl shadow-sm p-4`

## 语言规范

- **全中文界面**，不使用无意义英文标题
- 禁用：Profile / Record / History / Overview 等英文小标题
- 编号类（工号）使用 `.font-identifier`（JetBrains Mono 等宽字体）

## 移动端优先

- 最高频操作（今日录入）必须 3 秒内完成全员录入
- 数字输入用大按钮 `[−][＋]` 步长 0.5，避免键盘弹出
- 保存成功用轻量 toast 提示
