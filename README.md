# Ries Terminology Translator

一个基于大语言模型对文本进行混合翻译的 Chrome 浏览器扩展，灵感来源于 [ries.ai](https://ries.ai/zh/learn-english)

## ✨ 核心特性

### 🎯 智能术语替换
- **中英混合表达**：保持中文句子结构，仅替换关键术语为英文
- **术语标注**：英文术语后跟中文注释，格式如 `Growth(增长)`
- **智能数量控制**：可配置替换术语数量（1-10个）
- **难度分级**：
  - **基础词汇**：常见、高频、易懂的英文单词
  - **中阶词汇**：商业/科技语境下的常用英文表达
  - **高阶词汇**：专业性强的英文术语

### 🚀 多种交互方式

1. **Ctrl + 鼠标悬停**
   - 按住 Ctrl 键并将鼠标悬停在中文文本上
   - 实时显示翻译结果
   - 流畅的动画效果和视觉反馈

2. **自动翻译**
   - 页面加载后自动识别并翻译中文内容
   - 最多处理 120 个文本节点
   - 智能缓存机制避免重复翻译

### ⚙️ 灵活配置

- **OpenAI 兼容接口**：支持任意兼容 OpenAI Chat Completions API 的服务
  - OpenAI (GPT-4, GPT-3.5)
  - Azure OpenAI
  - OpenRouter
  - 自部署的开源模型网关
- **模型参数可调**：温度 (0-1)
- **实时同步**：设置变更立即生效

### 💾 性能优化

- **多层缓存**：内存缓存 + 请求去重
- **设置敏感缓存**：基于术语偏好、模型、温度等参数分区缓存
- **异步请求共享**：相同文本共享翻译结果
- **智能限流**：使用 requestAnimationFrame 控制鼠标事件处理频率

## 📦 安装使用

### 1. 本地加载扩展
方式一：
```bash
# 克隆仓库
git clone https://github.com/onewesong/openries.git
```

```bash
# 在 Chrome 中加载
1. 打开 chrome://extensions/
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 openries/extension 目录
```

方式二：
1. 下载最新版本 [release](https://github.com/onewesong/openries/releases)
2. 打开chrome://extensions/
3. 启用"开发者模式"
4. 将下载的 zip 文件直接拖入 Chrome 浏览器中

### 2. 配置 LLM 端点

1. 点击扩展图标打开弹出窗口
2. 点击"打开高级设置"
3. 填写配置信息：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| API Base URL | `https://api.openai.com` | LLM 服务地址 |
| API Path | `/v1/chat/completions` | Chat Completions 端点 |
| API Key | - | 访问密钥 |
| Model | `gpt-4o-mini` | 模型名称 |
| Temperature | `0.2` | 随机性控制 (0-1) |

### 3. 开始使用

- **单块文本翻译**：Ctrl + 鼠标悬停在文本上
- **自动翻译**：在弹出的popup中开启，页面将自动进行翻译

## 🏗️ 技术架构

```
extension/
├── manifest.json           # 扩展清单 (Manifest V3)
├── background.js           # Service Worker 后台脚本
├── contentScript.js        # 页面内容脚本 (核心翻译逻辑)
├── popup.html/js           # 弹出窗口 UI 和控制
├── options.html/js         # 设置页面
├── translator.js           # 翻译核心功能
├── settings.js             # 设置管理
├── utils.js                # 工具函数
├── *.css                   # 样式文件
└── icons/                  # 扩展图标
```

### 核心模块

- **translator.js**：构建 LLM 提示词，处理翻译响应
- **contentScript.js**：
  - DOM 文本节点处理和分段
  - 实时翻译和缓存管理
  - 浮动 UI 和动画效果
- **background.js**：处理右键菜单，接收翻译请求并调用 LLM API
- **settings.js**：统一设置读写和同步

## 🎨 界面设计

### 翻译结果展示

- **内联翻译**：带下划线和虚线标注的英文术语
- **弹出覆盖层**：页面底部的全屏翻译结果
- **浮动工具提示**：鼠标悬停时显示的快速预览
- **加载状态**：动态的"思考中..."动画

### 配色方案

- **主色调**：蓝紫色渐变 (#4c6ef5 → #82aaff)
- **背景**：深色主题 (#101828)
- **文字**：浅色系 (#f8fafc, #e2e8f0)
- **高亮**：半透明蓝色背景 (rgba(76, 110, 245, 0.15))

## 🔒 隐私保护

- ✅ **最小化数据收集**：仅发送用户主动选择的文本
- ✅ **本地缓存**：翻译结果存储在浏览器本地
- ✅ **无遥测**：不收集任何使用数据或分析信息
- ✅ **透明开源**：代码公开可审计

## 📊 性能指标

| 指标 | 数值 |
|------|------|
| 缓存命中率 | 极高（基于文本去重） |
| 鼠标事件节流 | requestAnimationFrame |
| 并发翻译请求 | 智能去重，无重复 |

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [ries.ai](https://ries.ai/zh/learn-english) - 灵感来源
---

⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！
