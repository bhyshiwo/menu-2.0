# Railway 部署指南（支持数据持久化）

## 项目简介

零依赖的菜单点餐小程序，Node.js 内置模块驱动，无需 `npm install`。

- **顾客端点餐**：`https://你的域名/`
- **后台管理**：`https://你的域名/admin`
- **默认账号**：`admin` / `admin123`

---

## 部署步骤

### 第一步：准备代码

确保以下文件存在：
- `server.js` — 主入口（支持 `DATA_DIR` 环境变量）
- `railway.json` — Railway 部署配置（含 Volume 变量）
- `public/` — 前端文件（customer + admin）

### 第二步：创建 GitHub 仓库

```bash
cd 项目目录
git init
git add .
git commit -m "初始提交：菜单点餐小程序（支持数据持久化）"
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

### 第三步：Railway 部署

1. 打开 [railway.com](https://railway.com)，登录（支持 GitHub）
2. 点击 **「New Project」→「Deploy from GitHub repo」** → 选择仓库
3. Railway 自动检测 `railway.json` 并构建部署

### 第四步：挂载持久存储卷（重要！）

Railway 免费容器重建后数据会丢失，**必须挂载 Volume 才能持久化**：

1. 进入项目 → 点击你的 Service
2. 右侧面板 → **Volumes** → **「Add Volume」**
3. 配置：
   - **Mount Path**：`/data`
   - **Volume Name**：`menu-data`（自定义）
   - **Size**：1 GB（免费额度）
4. 点击 **「Add Volume」**，Railway 会自动重启服务

> Volume 挂载成功后，所有数据（菜品、分类、订单、上传图片、管理员密码）都会持久保存在 `/data` 目录下，不再因容器重建而丢失。

### 第五步：验证持久化

1. 部署完成 → 点击 **「Generate Domain」** 获取公网地址
2. 访问 `/admin` 登录后台（admin / admin123）
3. 添加几个菜品、上传图片
4. 在 Railway 面板手动 Restart 服务
5. 刷新页面 → 所有数据仍在

### 数据诊断

访问 `/api/health` 可查看数据持久化状态：
```json
{
  "status": "ok",
  "dataDir": "/data",
  "dataFileExists": true,
  "categories": 4,
  "dishes": 5,
  "orders": 0,
  "uploadFiles": 3
}
```
也可以在 Railway 日志中查看服务启动时的诊断输出，确认数据文件是否正确加载。

> **如果部署后数据仍然丢失**，查看 Railway 部署日志（Deploy Logs）中的启动诊断：
> ```
>   Railway 自动检测: 是 ✅
>   DATA_DIR 来源: Railway 自动检测 → /data
>   数据文件存在: 是 ✅  ← 这个最关键
> ```
> - `数据文件存在: 否 ❌` → Volume 未正确挂载。检查 Railway → Service → Settings → Volumes，确保 Mount Path 为 `/data`
> - `数据文件存在: 是 ✅` 但数据不对 → 可能是旧数据残留，去 `/api/health` 确认数据计数
> - `Railway 自动检测: 否` → 服务不在 Railway 上运行，检查部署平台

---

## 环境变量说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | Railway 自动设置，无需手动配置 |
| `DATA_DIR` | 自动检测 | Railway 上自动设为 `/data`，本地设为 `./data`，也可手动指定 |

> **无需手动设置 `DATA_DIR`**：代码会自动检测 Railway 平台（通过 `RAILWAY_SERVICE_ID`），自动将数据目录指向 `/data`。只有在使用非标准挂载路径时才需要手动设置。

---

## 部署后

- 首次登录后台后，去「设置 → 账户安全」修改默认密码
- 后台可管理菜品、分类、订单、小程序名称和主题色
- 数据持久保存在 Volume 中，不会因容器重建丢失

---

## 本地开发

```bash
node server.js
# 访问 http://localhost:3000
# 数据默认保存在 ./data/ 目录
```

如需指定数据目录：
```bash
DATA_DIR=/path/to/data node server.js
```

---

## 技术栈

- 运行时：Node.js（内置 `http`、`fs`、`path`、`crypto` 模块）
- 前端：原生 HTML + CSS + JavaScript
- 存储：JSON 文件 + Railway Volume 持久化
- 认证：SHA-256 + Salt 哈希 + Token 会话
- 零外部依赖
