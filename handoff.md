# 交接文档 handoff.md

> **写给完全没有上下文的新会话。** 请先通读本文件，再动手改代码。

---

## 0. 一句话概括

这是一个**菜单点餐小程序 + 后台管理系统**，用 Node.js 纯内置模块（零第三方依赖）实现，JSON 文件做数据存储，可部署到 Railway。目前功能基本完整，处于持续迭代阶段。

---

## 1. 项目基本情况

| 项 | 值 |
|---|---|
| 技术栈 | Node.js 内置模块（http/fs/path/url/crypto），前端原生 HTML/CSS/JS |
| 依赖 | **零依赖**，`npm install` 在当前环境因网络问题不可用，已改用纯内置模块 |
| 端口 | 3000 |
| 启动 | `node server.js` 或双击 `start.bat` |
| 数据存储 | JSON 文件（本地 `./data/data.json`，Railway 上 `/data/data.json`） |
| 图片上传 | 手动解析 `multipart/form-data`，存到 `DATA_DIR/uploads/` |
| Git 提交历史 | 11 个 commit，从 first commit → 自由度增加2.0 |

### 文件结构

```
server.js                    — 后端主文件（所有 API + 静态服务 + 主题定义 + 数据迁移，约 1000 行）
public/customer/             — 顾客端（移动端风格点餐界面）
  index.html / app.js / style.css
public/admin/                — 后台管理端（桌面端）
  index.html / app.js / style.css
public/doc/                  — 文档目录
  自定义字体说明.md
data/                        — 默认数据目录（data.json + uploads/）
railway.json                 — Railway 部署配置
DEPLOY.md                    — 部署指南
start.bat                    — Windows 启动脚本
package.json                 — 仅声明，无实际依赖
menu-app-source.tar.gz       — 打包源码（排除 data/、.workbuddy/）
```

### Node 运行时

当前环境可用 Node：`C:\Users\1\.workbuddy\binaries\node\versions\22.22.2\node.exe`

启动命令：
```bash
"C:\Users\1\.workbuddy\binaries\node\versions\22.22.2\node.exe" server.js
```

---

## 2. 我们做了什么（按时间线）

### 第一阶段：基础系统搭建
- **顾客端**：分类浏览（左侧分类栏 + 右侧菜品列表）、菜品下单、购物车、订单提交、订单查询（按订单号 + 历史记录，localStorage）
- **管理端**：仪表盘、菜品管理（CRUD + 图片上传）、分类管理、订单管理、小程序设置
- **认证系统**：SHA-256+salt 密码哈希、Token 会话（24h）、登录/登出
- **UI 美化**：头部波浪装饰 + 渐变背景、飞入购物车动画、毛玻璃弹窗等
- 默认账号：`admin` / `admin123`

### 第二阶段：部署与持久化
- 添加 Railway 部署配置（railway.json + Volume 挂载 `/data`）
- 数据目录改为 `DATA_DIR` 环境变量驱动
- 新增 `GET /api/health` 健康检查端点

### 第三阶段：修复数据持久化 BUG（关键）
- **问题**：Railway 部署后每次重新部署数据丢失
- **根因**：`railway.json` 的 `deploy.variables.DATA_DIR` 未被 Railway 正确识别
- **修复**：server.js 自动检测 Railway 平台（`RAILWAY_SERVICE_ID` / `RAILWAY_ENVIRONMENT`），自动将 DATA_DIR 设为 `/data`，无需手动配置环境变量
- **教训**：不要依赖 railway.json 的 variables 字段传递环境变量

### 第四阶段：菜品多分类
- 数据模型变更：`dish.categoryId`（字符串）→ `dish.categoryIds`（数组，最多 2 个）
- 旧数据自动迁移
- 前后端全部适配

### 第五阶段：餐厅形象 + 销量统计 + 独立改密
- settings 新增 `restaurantAvatar` / `restaurantBG`，新增头像/背景图上传端点
- dish 新增 `totalSold` / `monthlySold` / `salesMonth`，下单自动累加，跨月自动重置
- 管理端仪表盘新增热销排行面板
- 修改密码从设置页拆分为独立导航模块

### 第六阶段：4 套 UI 主题系统
- server.js 内置 `THEMES` 常量，4 套预设：
  - **ghibli**（宫崎骏）：森系绿 + Noto Serif SC
  - **anime**（动漫）：樱花粉 + ZCOOL KuaiLe
  - **girl**（少女）：梦幻粉 + ZCOOL XiaoWei
  - **cool**（酷拽）：霓虹绿暗黑 + Share Tech Mono
- 顾客端通过 CSS 变量批量注入 + Google Fonts 动态加载
- 管理端设置页主题卡片选择器（2×2 网格）

### 第七阶段：自定义字体 + 按钮形状
- settings 新增 `customFont`（覆盖主题全局字体）、`buttonShape`（sharp/soft/rounded/pill）
- 管理端 4 种按钮形状可视化选择器 + 实时预览

### 第八阶段：艺术字体 + 侧边栏独立风格 + 标题字体（最近完成）
- settings 新增 9 个字段：
  - `artisticFont` / `artisticFontUrl` — 艺术字体（标语 + 菜品名）
  - `sidebarBg` / `sidebarTextColor` / `sidebarActiveColor` / `sidebarActiveBg` / `sidebarActiveIndicatorColor` — 侧边栏独立配色
  - `titleFont` / `titleFontUrl` — 标题字体（小程序名、分类标题、弹窗标题等）
- 顾客端新增 7 个 CSS 变量，侧边栏样式全面改用变量驱动
- 字体优先级链：`--title-font` > `--artistic-font` > `--font-family`
- 新增 `loadCustomFont(id, url)` 通用字体加载函数

### 第九阶段：文档
- 创建 `public/doc/自定义字体说明.md` — 完整的字体设置指南与使用案例

---

## 3. 当前数据模型（完整字段）

### settings 对象（`data.json` → `settings`）

```javascript
{
  restaurantName: '我的餐厅',
  slogan: '美味不停，点餐无忧',
  primaryColor: '#7a9e4b',
  adminTitle: '后台管理系统',
  serviceFee: 0,              // 服务费
  packingFee: 0,              // 打包费
  restaurantAvatar: '',       // 餐厅头像路径
  restaurantBG: '',           // 背景图路径
  theme: 'ghibli',            // UI 主题 ID
  customFont: '',             // 自定义全局字体 CSS（覆盖主题）
  buttonShape: 'rounded',     // 按钮形状 sharp/soft/rounded/pill
  artisticFont: '',           // 艺术字体 CSS（标语 + 菜品名）
  artisticFontUrl: '',        // 艺术字体 Google Fonts URL
  sidebarBg: '',              // 侧边栏背景色
  sidebarTextColor: '',       // 侧边栏文字色
  sidebarActiveColor: '',     // 选中文字色
  sidebarActiveBg: '',        // 选中背景色
  sidebarActiveIndicatorColor: '', // 选中指示条色
  titleFont: '',              // 标题字体 CSS
  titleFontUrl: ''            // 标题字体 Google Fonts URL
}
```

> **重要**：所有新字段在 `loadData()` 中都有自动迁移逻辑（`if (xxx === undefined) { ... migrated = true; }`），新增字段时务必加迁移。

### dish 对象

```javascript
{
  id: 'd_xxxxxx',
  name: '菜品名',
  price: 28,
  description: '描述',
  image: '/uploads/xxx.jpg',
  categoryIds: ['c1', 'c2'],  // 最多 2 个分类（旧数据 categoryId 会自动迁移）
  totalSold: 0,               // 总销量
  monthlySold: 0,             // 月销量
  salesMonth: '2026-07'       // 销量所属月份（跨月自动重置 monthlySold）
}
```

### admin 对象

```javascript
{
  username: 'admin',
  passwordHash: 'sha256哈希值',
  salt: '随机salt'
}
```

---

## 4. API 端点清单

### 公开端点（顾客端使用，无需 Token）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取设置 |
| GET | `/api/themes` | 获取 4 套主题预设 |
| GET | `/api/categories` | 获取分类列表 |
| GET | `/api/dishes` | 获取菜品列表（支持 `?categoryId=` 筛选） |
| POST | `/api/orders` | 提交订单 |
| GET | `/api/orders/lookup?orderNo=` | 订单查询 |
| GET | `/api/health` | 健康检查 |

### 需认证端点（管理端，需 `Authorization: Bearer <token>`）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/verify` | 验证 Token |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/change-password` | 修改密码 |
| PUT | `/api/settings` | 更新设置 |
| POST | `/api/settings/upload-avatar` | 上传餐厅头像 |
| POST | `/api/settings/upload-bg` | 上传背景图 |
| GET/POST/PUT/DELETE | `/api/dishes` / `/api/dishes/:id` | 菜品 CRUD |
| GET/POST/PUT/DELETE | `/api/categories` / `/api/categories/:id` | 分类 CRUD |
| GET/PUT/DELETE | `/api/orders` / `/api/orders/:id` | 订单管理 |

---

## 5. 已完成的功能（全部可用 ✅）

1. ✅ 顾客端完整点餐流程（浏览 → 加购 → 下单 → 查询）
2. ✅ 后台管理端完整 CRUD（菜品/分类/订单/设置）
3. ✅ 认证系统（登录/登出/修改密码/Token 24h）
4. ✅ Railway 部署 + 数据持久化（自动检测平台，Volume 挂载 `/data`）
5. ✅ 菜品多分类（最多 2 个）
6. ✅ 餐厅头像 + 背景图上传
7. ✅ 菜品销量统计（总销量 + 月销量，跨月自动重置）
8. ✅ 仪表盘热销排行
9. ✅ 4 套 UI 主题（宫崎骏/动漫/少女/酷拽）
10. ✅ 自定义全局字体 + 按钮形状（4 种）
11. ✅ 艺术字体（标语 + 菜品名独立字体）
12. ✅ 侧边栏独立配色（5 个颜色设置）
13. ✅ 标题字体独立设置
14. ✅ 自定义字体说明文档

---

## 6. 当前卡点 / 已知问题

### 无阻塞性卡点
目前所有功能均已实现并通过 API 测试，服务器可正常启动。

### 已知的小问题 / 待优化项
1. **Google Fonts 在国内加载慢**：顾客端依赖 Google Fonts CDN，国内网络可能加载缓慢（有 `display=swap` 兜底，文字先显示系统字体再替换）
2. **menu-app-source.tar.gz 未更新**：最后一次打包是自由度增加之前，如果需要部署包需重新打包
3. **无数据备份机制**：data.json 是单文件，没有备份/恢复功能
4. **无分页**：菜品和订单列表没有分页，数据量大时可能性能下降
5. **顾客端无搜索功能**：目前只能按分类浏览，不支持菜品搜索

---

## 7. 下一步计划（建议优先级）

### 高优先级
1. **重新打包部署包** — `menu-app-source.tar.gz` 已过时，包含最新代码后重新打包
2. **Google Fonts 本地化** — 考虑将字体文件下载到本地 `/uploads/fonts/` 提供服务，避免国内 Google Fonts 加载慢的问题
3. **顾客端菜品搜索** — 添加搜索栏，支持按名称模糊搜索菜品

### 中优先级
4. **订单状态通知** — 顾客端可轮询订单状态变化，状态更新时弹窗提醒
5. **数据导出** — 管理端支持导出订单/销量数据为 CSV/Excel
6. **多规格菜品** — 菜品支持规格选择（大份/小份、加料等），影响价格

### 低优先级
7. **分页** — 菜品和订单列表分页
8. **数据备份** — 定期备份 data.json
9. **多管理员** — 支持多个管理员账号和角色权限

---

## 8. 踩过的坑（绝对不要再踩）

### 坑 1：Railway 环境变量传递方式
**❌ 错误做法**：在 `railway.json` 的 `deploy.variables` 中设置 `DATA_DIR`，Railway **不会正确识别**，导致数据回退到容器临时目录，每次部署数据全丢。

**✅ 正确做法**：在 server.js 中检测 Railway 内置环境变量 `RAILWAY_SERVICE_ID` 或 `RAILWAY_ENVIRONMENT`，自动将 DATA_DIR 设为 `/data`。Railway 上必须挂载 Volume 到 `/data` 路径。

```javascript
const isRailway = !!(process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT);
const DATA_DIR = process.env.DATA_DIR || (isRailway ? '/data' : path.join(ROOT, 'data'));
```

### 坑 2：npm install 不可用
**环境网络问题**，`npm install` 会失败。整个项目从设计之初就选择了**纯 Node.js 内置模块**方案，不依赖任何 npm 包。

**绝对不要**尝试 `npm install xxx` 引入第三方依赖。如果需要新功能，用内置模块实现：
- HTTP 服务器 → `http` 模块
- 文件操作 → `fs` 模块
- 路径处理 → `path` 模块
- 密码哈希 → `crypto` 模块（SHA-256）
- URL 解析 → `url` 模块
- multipart/form-data → 手动解析（server.js 中已实现 `parseMultipart` 函数）

### 坑 3：数据迁移必须做
每次给 settings 或 dish 添加新字段时，**必须在 `loadData()` 中加迁移逻辑**：

```javascript
if (data.settings.newField === undefined) {
  data.settings.newField = '默认值';
  migrated = true;
}
```

否则旧 data.json 加载时新字段为 `undefined`，前端访问会报错。

### 坑 4：分类删除时必须同步菜品
删除分类时，必须检查所有菜品的 `categoryIds` 数组，从中移除被删分类的 ID，否则菜品会引用不存在的分类。

### 坑 5：Google Fonts URL 格式
Google Fonts 的 CSS URL 中：
- 字体名空格用 `+` 号：`Ma Shan Zheng` → `Ma+Shan+Zheng`
- 粗细用 `:wght@400;600;700`
- 末尾必须加 `&display=swap`（否则字体加载完成前文字不显示）

完整示例：`https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap`

### 坑 6：CSS font-family 中的引号
在管理端输入 CSS `font-family` 值时，字体名如果含空格必须用引号包裹：
- ✅ `'Ma Shan Zheng', cursive`
- ✅ `'ZCOOL KuaiLe', sans-serif`
- ❌ `Ma Shan Zheng, cursive`（不含引号会导致解析失败）

### 坑 7：顾客端 applySettings() 执行顺序
`applySettings()` 中必须先设置主题 CSS 变量，再设置自定义覆盖（customFont、artisticFont、titleFont、sidebar 等），否则自定义值会被主题默认值覆盖。

### 坑 8：图片路径
上传的图片存储在 `DATA_DIR/uploads/`，通过 `/uploads/` 路由提供静态服务。data.json 中存储的路径是 `/uploads/xxx.jpg`（相对路径），不要存绝对路径。

---

## 9. 快速上手验证步骤

新会话接手后，按以下步骤验证环境：

```bash
# 1. 启动服务器
"C:\Users\1\.workbuddy\binaries\node\versions\22.22.2\node.exe" server.js

# 2. 验证健康检查
curl http://localhost:3000/api/health

# 3. 验证设置（应返回所有字段）
curl http://localhost:3000/api/settings

# 4. 验证主题列表（应返回 4 套主题）
curl http://localhost:3000/api/themes

# 5. 登录获取 Token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 6. 顾客端预览：浏览器打开 http://localhost:3000/
# 7. 管理端预览：浏览器打开 http://localhost:3000/admin
```

---

## 10. 关键设计决策记录

| 决策 | 原因 |
|------|------|
| 零第三方依赖 | npm install 不可用（网络问题） |
| JSON 文件存储 | 简单、无数据库依赖、适合小规模数据 |
| 手动解析 multipart | 不依赖 multer/formidable |
| CSS 变量驱动主题 | 灵活、实时切换、不刷新页面即可改风格 |
| Google Fonts 动态加载 | 用户可选择任意字体，不硬编码 |
| 侧边栏独立配色 | 主题预设不满足所有需求，给用户最大自由度 |
| 字体三层优先级 | 全局 → 艺术 → 标题，互不冲突 |
| Railway 自动检测 | 不依赖环境变量配置，降低部署出错率 |

---

**文档结束。** 如有疑问，先读 `server.js`（所有后端逻辑都在一个文件里），再读 `public/customer/app.js` 的 `applySettings()` 函数（前端设置应用的核心入口）。
