const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// 数据持久化目录：通过环境变量 DATA_DIR 指定，Railway 上挂载 Volume 到 /data
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

// ============ 认证工具 ============
const SECRET = 'menu_ordering_secret_2024';

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password + ':' + SECRET).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 会话存储: { token: { username, expires } }
const sessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24小时

function createSession(username) {
  const token = generateToken();
  sessions.set(token, { username, expires: Date.now() + SESSION_DURATION });
  return token;
}

function validateToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

function getTokenFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

// 公开路由（顾客端使用，不需要登录）
function isPublicRoute(pathname, method) {
  if (pathname === '/api/settings' && method === 'GET') return true;
  if (pathname === '/api/categories' && method === 'GET') return true;
  if (pathname === '/api/dishes' && method === 'GET') return true;
  if (pathname === '/api/orders' && method === 'POST') return true;
  if (pathname === '/api/orders/lookup' && method === 'GET') return true;
  if (pathname === '/api/auth/login' && method === 'POST') return true;
  if (pathname === '/api/auth/verify' && method === 'GET') return true;
  return false;
}

// ============ 数据存储层 ============
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DEFAULT_SALT = 'menu_salt_' + Date.now().toString(36);

const defaultData = {
  settings: {
    appName: '我的餐厅',
    primaryColor: '#ff6b35',
    secondaryColor: '#fff5f0',
    slogan: '新鲜美味，用心制作',
    tableFee: 0,
    serviceFee: 0
  },
  categories: [
    { id: 'cat_1', name: '热销推荐', order: 1 },
    { id: 'cat_2', name: '招牌菜品', order: 2 },
    { id: 'cat_3', name: '主食', order: 3 },
    { id: 'cat_4', name: '饮品', order: 4 }
  ],
  dishes: [
    { id: 'dish_1', categoryId: 'cat_1', name: '招牌红烧肉', price: 38, image: '', description: '精选五花肉，慢火炖制，入口即化', available: true, order: 1 },
    { id: 'dish_2', categoryId: 'cat_1', name: '香辣鸡翅', price: 28, image: '', description: '外酥里嫩，香辣可口', available: true, order: 2 },
    { id: 'dish_3', categoryId: 'cat_2', name: '水煮鱼', price: 58, image: '', description: '鲜嫩鱼片，麻辣鲜香', available: true, order: 1 },
    { id: 'dish_4', categoryId: 'cat_3', name: '蛋炒饭', price: 15, image: '', description: '粒粒分明，蛋香四溢', available: true, order: 1 },
    { id: 'dish_5', categoryId: 'cat_4', name: '鲜榨橙汁', price: 12, image: '', description: '新鲜橙子现榨', available: true, order: 1 }
  ],
  orders: [],
  admin: {
    username: 'admin',
    salt: DEFAULT_SALT,
    passwordHash: hashPassword('admin123', DEFAULT_SALT)
  }
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      // 兼容旧数据：如果没有 admin 字段，补充默认管理员
      if (!data.admin) {
        const salt = 'menu_salt_' + Date.now().toString(36);
        data.admin = {
          username: 'admin',
          salt: salt,
          passwordHash: hashPassword('admin123', salt)
        };
        saveData(data);
      }
      return data;
    }
    saveData(defaultData);
    return JSON.parse(JSON.stringify(defaultData));
  } catch (e) {
    console.error('读取数据失败:', e);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

let db = loadData();

function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// ============ 工具函数 ============
function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// 解析 multipart/form-data（用于图片上传）
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const boundary = req.headers['content-type'].split('boundary=')[1];
    if (!boundary) { resolve({ fields: {}, files: {} }); return; }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const fields = {};
      const files = {};
      const boundaryBuf = Buffer.from('--' + boundary);

      let start = 0;
      while (true) {
        const bStart = buffer.indexOf(boundaryBuf, start);
        if (bStart === -1) break;
        const partStart = bStart + boundaryBuf.length + 2; // +2 for \r\n
        const nextBoundary = buffer.indexOf(boundaryBuf, partStart);
        if (nextBoundary === -1) break;

        const part = buffer.slice(partStart, nextBoundary - 2); // -2 for \r\n before boundary
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) { start = nextBoundary; continue; }

        const headerStr = part.slice(0, headerEnd).toString('utf-8');
        const contentBuf = part.slice(headerEnd + 4);

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        if (!nameMatch) { start = nextBoundary; continue; }
        const fieldName = nameMatch[1];

        const fileMatch = headerStr.match(/filename="([^"]*)"/);
        if (fileMatch) {
          const filename = fileMatch[1];
          if (filename && contentBuf.length > 0) {
            const ext = path.extname(filename).toLowerCase() || '.jpg';
            const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
            if (allowed.includes(ext)) {
              const newFilename = genId('img') + ext;
              const filepath = path.join(UPLOAD_DIR, newFilename);
              fs.writeFileSync(filepath, contentBuf);
              files[fieldName] = { filename: newFilename, originalName: filename, size: contentBuf.length, path: '/uploads/' + newFilename };
            }
          }
          files[fieldName] = files[fieldName] || { filename: '', originalName: filename, size: 0, path: '' };
        } else {
          fields[fieldName] = contentBuf.toString('utf-8');
        }
        start = nextBoundary;
      }
      resolve({ fields, files });
    });
    req.on('error', reject);
  });
}

// MIME 类型映射
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// ============ 路由处理 ============
async function handleAPI(req, res, pathname, method) {
  // ---- 认证接口 ----
  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await getBody(req);
    const admin = db.admin;
    if (!admin) return sendJSON(res, { error: '系统未初始化' }, 500);
    if (body.username === admin.username && hashPassword(body.password || '', admin.salt) === admin.passwordHash) {
      const token = createSession(admin.username);
      return sendJSON(res, { success: true, token, username: admin.username });
    }
    return sendJSON(res, { error: '用户名或密码错误' }, 401);
  }

  if (pathname === '/api/auth/verify' && method === 'GET') {
    const token = getTokenFromRequest(req);
    const session = validateToken(token);
    if (session) {
      return sendJSON(res, { success: true, username: session.username });
    }
    return sendJSON(res, { error: '未登录或登录已过期' }, 401);
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = getTokenFromRequest(req);
    destroySession(token);
    return sendJSON(res, { success: true });
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    // 需要登录
    const token = getTokenFromRequest(req);
    const session = validateToken(token);
    if (!session) return sendJSON(res, { error: '未登录或登录已过期', needLogin: true }, 401);

    const body = await getBody(req);
    const admin = db.admin;
    if (hashPassword(body.currentPassword || '', admin.salt) !== admin.passwordHash) {
      return sendJSON(res, { error: '当前密码错误' }, 400);
    }
    if (!body.newPassword || body.newPassword.length < 4) {
      return sendJSON(res, { error: '新密码至少4位' }, 400);
    }
    const newSalt = 'menu_salt_' + Date.now().toString(36);
    db.admin.salt = newSalt;
    db.admin.passwordHash = hashPassword(body.newPassword, newSalt);
    saveData(db);
    // 销毁其他会话，强制重新登录
    destroySession(token);
    return sendJSON(res, { success: true });
  }

  // ---- 鉴权中间件：非公开路由需要登录 ----
  if (!isPublicRoute(pathname, method)) {
    const token = getTokenFromRequest(req);
    const session = validateToken(token);
    if (!session) {
      return sendJSON(res, { error: '未登录或登录已过期', needLogin: true }, 401);
    }
  }

  // ---- 设置 ----
  if (pathname === '/api/settings' && method === 'GET') return sendJSON(res, db.settings);
  if (pathname === '/api/settings' && method === 'PUT') {
    const body = await getBody(req);
    Object.assign(db.settings, body);
    saveData(db);
    return sendJSON(res, { success: true, settings: db.settings });
  }

  // ---- 分类 ----
  if (pathname === '/api/categories' && method === 'GET') {
    const cats = [...db.categories].sort((a, b) => a.order - b.order);
    return sendJSON(res, cats);
  }
  if (pathname === '/api/categories' && method === 'POST') {
    const body = await getBody(req);
    if (!body.name || !body.name.trim()) return sendJSON(res, { error: '分类名称不能为空' }, 400);
    const maxOrder = db.categories.reduce((m, c) => Math.max(m, c.order), 0);
    const cat = { id: genId('cat'), name: body.name.trim(), order: maxOrder + 1 };
    db.categories.push(cat);
    saveData(db);
    return sendJSON(res, { success: true, category: cat });
  }
  const catMatch = pathname.match(/^\/api\/categories\/(.+)$/);
  if (catMatch && method === 'PUT') {
    const idx = db.categories.findIndex(c => c.id === catMatch[1]);
    if (idx === -1) return sendJSON(res, { error: '分类不存在' }, 404);
    const body = await getBody(req);
    Object.assign(db.categories[idx], body);
    saveData(db);
    return sendJSON(res, { success: true, category: db.categories[idx] });
  }
  if (catMatch && method === 'DELETE') {
    const idx = db.categories.findIndex(c => c.id === catMatch[1]);
    if (idx === -1) return sendJSON(res, { error: '分类不存在' }, 404);
    if (db.dishes.some(d => d.categoryId === catMatch[1]))
      return sendJSON(res, { error: '该分类下还有菜品，请先删除或转移菜品' }, 400);
    db.categories.splice(idx, 1);
    saveData(db);
    return sendJSON(res, { success: true });
  }

  // ---- 菜品 ----
  if (pathname === '/api/dishes' && method === 'GET') {
    const query = url.parse(req.url, true).query;
    let dishes = [...db.dishes];
    if (query.categoryId) dishes = dishes.filter(d => d.categoryId === query.categoryId);
    dishes.sort((a, b) => a.order - b.order);
    return sendJSON(res, dishes);
  }
  if (pathname === '/api/dishes' && method === 'POST') {
    const { fields, files } = await parseMultipart(req);
    if (!fields.name || !fields.name.trim()) return sendJSON(res, { error: '菜品名称不能为空' }, 400);
    if (!fields.price || isNaN(fields.price)) return sendJSON(res, { error: '请输入有效价格' }, 400);
    const maxOrder = db.dishes.filter(d => d.categoryId === fields.categoryId).reduce((m, d) => Math.max(m, d.order), 0);
    const dish = {
      id: genId('dish'),
      categoryId: fields.categoryId || '',
      name: fields.name.trim(),
      price: parseFloat(fields.price),
      image: files.image && files.image.path ? files.image.path : '',
      description: fields.description || '',
      available: fields.available !== 'false',
      order: maxOrder + 1
    };
    db.dishes.push(dish);
    saveData(db);
    return sendJSON(res, { success: true, dish });
  }
  const dishMatch = pathname.match(/^\/api\/dishes\/(.+)$/);
  if (dishMatch && method === 'PUT') {
    const idx = db.dishes.findIndex(d => d.id === dishMatch[1]);
    if (idx === -1) return sendJSON(res, { error: '菜品不存在' }, 404);
    const { fields, files } = await parseMultipart(req);
    if (fields.name !== undefined) db.dishes[idx].name = fields.name.trim();
    if (fields.price !== undefined) db.dishes[idx].price = parseFloat(fields.price);
    if (fields.categoryId !== undefined) db.dishes[idx].categoryId = fields.categoryId;
    if (fields.description !== undefined) db.dishes[idx].description = fields.description;
    if (fields.available !== undefined) db.dishes[idx].available = fields.available !== 'false';
    if (files.image && files.image.path) db.dishes[idx].image = files.image.path;
    saveData(db);
    return sendJSON(res, { success: true, dish: db.dishes[idx] });
  }
  if (dishMatch && method === 'DELETE') {
    const idx = db.dishes.findIndex(d => d.id === dishMatch[1]);
    if (idx === -1) return sendJSON(res, { error: '菜品不存在' }, 404);
    db.dishes.splice(idx, 1);
    saveData(db);
    return sendJSON(res, { success: true });
  }

  // ---- 订单 ----
  if (pathname === '/api/orders' && method === 'GET') {
    const orders = [...db.orders].sort((a, b) => b.createdAt - a.createdAt);
    return sendJSON(res, orders);
  }
  if (pathname === '/api/orders' && method === 'POST') {
    const body = await getBody(req);
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0)
      return sendJSON(res, { error: '订单不能为空' }, 400);
    let total = 0;
    const orderItems = body.items.map(item => {
      const dish = db.dishes.find(d => d.id === item.id);
      if (!dish) return null;
      const qty = parseInt(item.quantity) || 1;
      total += dish.price * qty;
      return { id: dish.id, name: dish.name, price: dish.price, quantity: qty, image: dish.image };
    }).filter(Boolean);
    if (orderItems.length === 0) return sendJSON(res, { error: '订单菜品无效' }, 400);
    const tableFee = db.settings.tableFee || 0;
    const serviceFee = db.settings.serviceFee || 0;
    total += tableFee + serviceFee;
    const order = {
      id: genId('order'),
      orderNo: 'ORD' + Date.now().toString().slice(-8),
      items: orderItems,
      total: parseFloat(total.toFixed(2)),
      tableFee, serviceFee,
      tableNumber: body.tableNumber || '',
      remark: body.remark || '',
      status: 'pending',
      createdAt: Date.now()
    };
    db.orders.push(order);
    saveData(db);
    return sendJSON(res, { success: true, order });
  }
  const orderStatusMatch = pathname.match(/^\/api\/orders\/(.+)\/status$/);
  if (orderStatusMatch && method === 'PUT') {
    const order = db.orders.find(o => o.id === orderStatusMatch[1]);
    if (!order) return sendJSON(res, { error: '订单不存在' }, 404);
    const body = await getBody(req);
    order.status = body.status;
    saveData(db);
    return sendJSON(res, { success: true, order });
  }
  const orderMatch = pathname.match(/^\/api\/orders\/(.+)$/);
  if (orderMatch && method === 'DELETE') {
    const idx = db.orders.findIndex(o => o.id === orderMatch[1]);
    if (idx === -1) return sendJSON(res, { error: '订单不存在' }, 404);
    db.orders.splice(idx, 1);
    saveData(db);
    return sendJSON(res, { success: true });
  }
  // 公开：按订单号查询订单
  if (pathname === '/api/orders/lookup' && method === 'GET') {
    const query = url.parse(req.url, true).query;
    const orderNo = (query.orderNo || '').trim();
    if (!orderNo) return sendJSON(res, { error: '请输入订单号' }, 400);
    const order = db.orders.find(o => o.orderNo === orderNo);
    if (!order) return sendJSON(res, { error: '订单不存在，请检查订单号' }, 404);
    return sendJSON(res, { success: true, order });
  }

  sendJSON(res, { error: '接口不存在' }, 404);
}

// 静态文件服务
function serveStatic(req, res, pathname) {
  // 上传文件从持久化目录提供
  if (pathname.startsWith('/uploads/')) {
    const filePath = path.join(UPLOAD_DIR, pathname.replace('/uploads/', ''));
    if (!filePath.startsWith(UPLOAD_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    });
    return;
  }

  let filePath = path.join(PUBLIC_DIR, pathname);

  // 路由：/ -> customer/index.html, /admin -> admin/index.html
  if (pathname === '/' || pathname === '') {
    filePath = path.join(PUBLIC_DIR, 'customer', 'index.html');
  } else if (pathname === '/admin') {
    filePath = path.join(PUBLIC_DIR, 'admin', 'index.html');
  } else if (pathname.startsWith('/customer/')) {
    filePath = path.join(PUBLIC_DIR, 'customer', pathname.replace('/customer/', ''));
  } else if (pathname.startsWith('/admin/')) {
    filePath = path.join(PUBLIC_DIR, 'admin', pathname.replace('/admin/', ''));
  }

  // 安全检查
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ============ 创建服务器 ============
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      await handleAPI(req, res, pathname, method);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (e) {
    console.error('服务器错误:', e);
    sendJSON(res, { error: '服务器内部错误: ' + e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  菜单点餐系统已启动');
  console.log('========================================');
  console.log('');
  console.log('  顾客端点餐:  http://localhost:' + PORT);
  console.log('  后台管理:    http://localhost:' + PORT + '/admin');
  console.log('  默认账号:    admin / admin123');
  console.log('');
  console.log('========================================');
  console.log('');
});
