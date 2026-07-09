// ============ 全局状态 ============
let settings = {};
let categories = [];
let dishes = [];
let cart = {}; // { dishId: quantity }
let currentCategoryId = null;
let cartDetailOpen = false;
let lastOrderNo = ''; // 最近下单的订单号
let themes = {}; // 所有主题预设

// 最近订单号（localStorage 持久化）
function getRecentOrders() {
  try { return JSON.parse(localStorage.getItem('menu_recent_orders') || '[]'); }
  catch { return []; }
}
function saveRecentOrder(orderNo, tableNumber) {
  let recent = getRecentOrders();
  // 去重，最新的放前面
  recent = recent.filter(r => r.orderNo !== orderNo);
  recent.unshift({ orderNo, tableNumber, time: Date.now() });
  if (recent.length > 10) recent = recent.slice(0, 10);
  localStorage.setItem('menu_recent_orders', JSON.stringify(recent));
}

// ============ API 请求 ============
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ============ 初始化 ============
async function init() {
  try {
    const [settingsData, categoriesData, dishesData, themesData] = await Promise.all([
      api('/api/settings'),
      api('/api/categories'),
      api('/api/dishes'),
      api('/api/themes')
    ]);

    settings = settingsData;
    categories = categoriesData;
    dishes = dishesData;
    themes = themesData;

    applySettings();
    renderCategories();
    if (categories.length > 0) {
      currentCategoryId = categories[0].id;
      renderDishes();
    }
    renderCart();
  } catch (e) {
    console.error('初始化失败:', e);
    document.getElementById('dishList').innerHTML = '<div class="empty-state"><p>加载失败，请刷新重试</p></div>';
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
}

// ============ 应用设置（主题色、字体、主题系统） ============
function applySettings() {
  const root = document.documentElement;
  const themeId = settings.theme || 'ghibli';
  const theme = themes[themeId] || themes.ghibli || {};

  // 1. 应用主题 CSS 变量
  if (theme.vars) {
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }

  // 2. 保留用户自定义颜色（如果主题色需要的话，优先使用主题预设色）
  // 但如果用户手动改了 primaryColor，这里会覆盖 —— 这是预期行为，选主题就是整套换

  // 3. 动态加载字体
  loadThemeFont(theme);

  // 4. 文本内容
  document.getElementById('appName').textContent = settings.appName || '我的餐厅';
  document.getElementById('appSlogan').textContent = settings.slogan || '';
  document.title = settings.appName || '菜单点餐';

  // 5. 头部背景
  const headerBg = document.getElementById('headerBg');
  if (settings.restaurantBG) {
    headerBg.style.background = '';
    headerBg.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.45)), url('${settings.restaurantBG}')`;
    headerBg.style.backgroundSize = 'cover';
    headerBg.style.backgroundPosition = 'center';
  } else {
    const primary = theme.vars ? theme.vars['--primary-color'] : '#ff6b35';
    const primaryLight = theme.vars ? theme.vars['--primary-light'] : '#ff8c5e';
    headerBg.style.background = `linear-gradient(135deg, ${primary}, ${primaryLight})`;
    headerBg.style.backgroundImage = '';
  }

  // 6. 餐厅头像
  const avatarEl = document.getElementById('headerAvatar');
  if (settings.restaurantAvatar) {
    avatarEl.style.display = 'flex';
    document.getElementById('avatarImg').src = settings.restaurantAvatar;
  } else {
    avatarEl.style.display = 'none';
  }

  // 7. 酷拽风格特殊处理：app 容器和 body 背景变为深色
  if (themeId === 'cool') {
    document.body.style.background = '#050508';
    const appContainer = document.getElementById('app');
    if (appContainer) appContainer.style.background = theme.vars['--card-bg'] || '#0d1117';
  } else {
    document.body.style.background = '';
    const appContainer = document.getElementById('app');
    if (appContainer) appContainer.style.background = '';
  }

  // 8. 头部高度
  const headerHeight = theme.vars ? theme.vars['--header-height'] : '170px';
  document.getElementById('appHeader').style.height = headerHeight;
}

// ============ 动态加载 Google Font ============
function loadThemeFont(theme) {
  if (!theme || !theme.googleFont) return;
  const fontId = 'theme-font-' + theme.id;
  // 避免重复加载
  if (document.getElementById(fontId)) return;

  const link = document.createElement('link');
  link.id = fontId;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + theme.googleFont + '&display=swap';
  document.head.appendChild(link);
}

// ============ 渲染分类栏 ============
function renderCategories() {
  const bar = document.getElementById('categoryBar');
  if (categories.length === 0) {
    bar.innerHTML = '<div class="empty-state"><p>暂无分类</p></div>';
    return;
  }
  bar.innerHTML = categories.map(cat => `
    <div class="category-item ${cat.id === currentCategoryId ? 'active' : ''}"
         onclick="selectCategory('${cat.id}')">
      ${escapeHtml(cat.name)}
    </div>
  `).join('');
}

function selectCategory(catId) {
  currentCategoryId = catId;
  renderCategories();
  renderDishes();
}

// ============ 渲染菜品列表 ============
function renderDishes() {
  const list = document.getElementById('dishList');
  const catDishes = dishes.filter(d => d.categoryIds && d.categoryIds.includes(currentCategoryId) && d.available);

  if (catDishes.length === 0) {
    const cat = categories.find(c => c.id === currentCategoryId);
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
        <p>「${escapeHtml(cat ? cat.name : '')}」分类下暂无菜品</p>
      </div>
    `;
    return;
  }

  let html = '';
  // 按分类分组显示
  const cat = categories.find(c => c.id === currentCategoryId);
  html += `<div class="category-title">${escapeHtml(cat ? cat.name : '')}</div>`;

  html += catDishes.map(dish => {
    const qty = cart[dish.id] || 0;
    return `
      <div class="dish-card">
        ${dish.image
          ? `<img class="dish-image" src="${dish.image}" alt="${escapeHtml(dish.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
             <div class="dish-image-placeholder" style="display:none;">
               <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
             </div>`
          : `<div class="dish-image-placeholder">
               <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
             </div>`
        }
        <div class="dish-info">
          <div>
            <div class="dish-name">${escapeHtml(dish.name)}</div>
            ${dish.description ? `<div class="dish-desc">${escapeHtml(dish.description)}</div>` : ''}
          </div>
          <div class="dish-bottom">
            <div class="dish-price">${dish.price.toFixed(2)}</div>
            <div class="qty-control">
              ${qty > 0 ? `
                <button class="qty-btn minus" onclick="changeQty('${dish.id}', -1, event)">−</button>
                <span class="qty-num">${qty}</span>
              ` : ''}
              <button class="qty-add-btn" onclick="changeQty('${dish.id}', 1, event)">+</button>
            </div>
          </div>
          ${(dish.monthlySold > 0 || dish.totalSold > 0) ? `
          <div class="dish-sales">
            <span class="sales-monthly">月售 ${dish.monthlySold || 0}</span>
            <span class="sales-divider">|</span>
            <span class="sales-total">总售 ${dish.totalSold || 0}</span>
          </div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = html;
}

// ============ 购物车操作 ============
function changeQty(dishId, delta, event) {
  const current = cart[dishId] || 0;
  const newVal = current + delta;
  if (newVal <= 0) {
    delete cart[dishId];
  } else {
    cart[dishId] = newVal;
  }

  // 飞入购物车动画（仅添加时）
  if (delta > 0 && event && event.target) {
    flyToCart(event.target);
  }

  renderDishes();
  renderCart();
  if (cartDetailOpen) renderCartDetail();
}

// 飞入购物车动画
function flyToCart(addBtn) {
  const btnRect = addBtn.getBoundingClientRect();
  const cartIcon = document.getElementById('cartIcon');
  if (!cartIcon) return;
  const cartRect = cartIcon.getBoundingClientRect();

  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.left = (btnRect.left + btnRect.width / 2 - 10) + 'px';
  dot.style.top = (btnRect.top + btnRect.height / 2 - 10) + 'px';

  const flyX = cartRect.left + cartRect.width / 2 - btnRect.left - btnRect.width / 2;
  const flyY = cartRect.top + cartRect.height / 2 - btnRect.top - btnRect.height / 2;
  dot.style.setProperty('--fly-x', flyX + 'px');
  dot.style.setProperty('--fly-y', flyY + 'px');

  document.body.appendChild(dot);
  setTimeout(() => dot.remove(), 500);

  // 购物车图标弹跳
  const wrapper = cartIcon.parentElement;
  wrapper.style.transition = 'transform 0.15s';
  wrapper.style.transform = 'scale(1.15)';
  setTimeout(() => { wrapper.style.transform = ''; }, 150);
}

function renderCart() {
  const cartBar = document.getElementById('cartBar');
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  const cartTotal = Object.entries(cart).reduce((s, [id, qty]) => {
    const dish = dishes.find(d => d.id === id);
    return s + (dish ? dish.price * qty : 0);
  }, 0);

  if (cartCount > 0) {
    cartBar.style.display = 'flex';
    document.getElementById('cartBadge').style.display = 'flex';
    document.getElementById('cartBadge').textContent = cartCount;
    document.getElementById('cartTotal').textContent = '¥' + cartTotal.toFixed(2);
    document.getElementById('cartHint').textContent = '已选 ' + cartCount + ' 件';
    document.getElementById('checkoutBtn').disabled = false;
  } else {
    cartBar.style.display = 'flex';
    document.getElementById('cartBadge').style.display = 'none';
    document.getElementById('cartTotal').textContent = '¥0';
    document.getElementById('cartHint').textContent = '购物车是空的';
    document.getElementById('checkoutBtn').disabled = true;
  }
}

// ============ 购物车详情 ============
function toggleCartDetail() {
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  if (cartCount === 0) return;

  cartDetailOpen = !cartDetailOpen;
  document.getElementById('cartDetailMask').style.display = cartDetailOpen ? 'block' : 'none';
  document.getElementById('cartDetail').style.display = cartDetailOpen ? 'flex' : 'none';
  if (cartDetailOpen) renderCartDetail();
}

function renderCartDetail() {
  const list = document.getElementById('cartDetailList');
  const items = Object.entries(cart).map(([id, qty]) => {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return '';
    return `
      <div class="cart-detail-item">
        <div class="cart-detail-name">${escapeHtml(dish.name)}</div>
        <div class="cart-detail-price">¥${(dish.price * qty).toFixed(2)}</div>
        <div class="qty-control">
          <button class="qty-btn minus" onclick="changeQty('${dish.id}', -1, event)">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-add-btn" onclick="changeQty('${dish.id}', 1, event)">+</button>
        </div>
      </div>
    `;
  }).join('');
  list.innerHTML = items;
}

function clearCart() {
  cart = {};
  cartDetailOpen = false;
  document.getElementById('cartDetailMask').style.display = 'none';
  document.getElementById('cartDetail').style.display = 'none';
  renderDishes();
  renderCart();
}

// ============ 结算 ============
function goCheckout() {
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  if (cartCount === 0) return;

  // 渲染订单明细
  const itemsList = document.getElementById('orderItemsList');
  let subtotal = 0;
  itemsList.innerHTML = Object.entries(cart).map(([id, qty]) => {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return '';
    subtotal += dish.price * qty;
    return `
      <div class="order-item-row">
        <span class="order-item-name">${escapeHtml(dish.name)} <small>×${qty}</small></span>
        <span class="order-item-subtotal">¥${(dish.price * qty).toFixed(2)}</span>
      </div>
    `;
  }).join('');

  // 费用
  const tableFee = settings.tableFee || 0;
  const serviceFee = settings.serviceFee || 0;
  const feeSection = document.getElementById('feeSection');
  if (tableFee > 0 || serviceFee > 0) {
    feeSection.style.display = 'block';
    document.getElementById('tableFeeText').textContent = '¥' + tableFee.toFixed(2);
    document.getElementById('serviceFeeText').textContent = '¥' + serviceFee.toFixed(2);
  } else {
    feeSection.style.display = 'none';
  }

  const total = subtotal + tableFee + serviceFee;
  document.getElementById('checkoutTotal').textContent = '¥' + total.toFixed(2);

  document.getElementById('checkoutMask').style.display = 'block';
  document.getElementById('checkoutModal').style.display = 'flex';
}

function closeCheckout() {
  document.getElementById('checkoutMask').style.display = 'none';
  document.getElementById('checkoutModal').style.display = 'none';
}

// ============ 提交订单 ============
async function submitOrder() {
  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  try {
    const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
    const tableNumber = document.getElementById('tableNumber').value.trim();
    const remark = document.getElementById('remark').value.trim();

    const result = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, tableNumber, remark })
    });

    closeCheckout();
    cart = {};
    renderDishes();
    renderCart();

    // 保存订单号
    lastOrderNo = result.order.orderNo;
    saveRecentOrder(result.order.orderNo, tableNumber);

    // 显示成功
    document.getElementById('successOrderNo').textContent = '订单号：' + result.order.orderNo;
    document.getElementById('successMask').style.display = 'flex';
  } catch (e) {
    alert('下单失败: ' + e.message);
    btn.disabled = false;
    btn.textContent = '提交订单';
  }
}

function closeSuccess() {
  document.getElementById('successMask').style.display = 'none';
}

function viewOrderDetail() {
  if (!lastOrderNo) return;
  document.getElementById('successMask').style.display = 'none';
  lookupOrder(lastOrderNo);
}

// ============ 订单查询 ============
function showOrderLookup() {
  document.getElementById('orderLookupMask').style.display = 'block';
  document.getElementById('orderLookupModal').style.display = 'flex';
  document.getElementById('lookupError').style.display = 'none';
  document.getElementById('orderNoInput').value = '';
  renderRecentOrders();
  setTimeout(() => document.getElementById('orderNoInput').focus(), 300);
}

function closeOrderLookup() {
  document.getElementById('orderLookupMask').style.display = 'none';
  document.getElementById('orderLookupModal').style.display = 'none';
}

function renderRecentOrders() {
  const recent = getRecentOrders();
  const container = document.getElementById('recentOrders');
  const list = document.getElementById('recentOrderList');
  if (recent.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  list.innerHTML = recent.map(r => `
    <div class="recent-order-item" onclick="lookupOrder('${r.orderNo}')">
      <div class="recent-order-no">${r.orderNo}</div>
      <div class="recent-order-meta">${r.tableNumber || '未填桌号'} · ${formatTime(r.time)}</div>
    </div>
  `).join('');
}

async function lookupOrder(orderNo) {
  if (!orderNo) {
    orderNo = document.getElementById('orderNoInput').value.trim();
  } else {
    document.getElementById('orderNoInput').value = orderNo;
  }
  if (!orderNo) {
    document.getElementById('lookupError').textContent = '请输入订单号';
    document.getElementById('lookupError').style.display = 'block';
    return;
  }
  const errEl = document.getElementById('lookupError');
  errEl.style.display = 'none';

  try {
    const result = await api('/api/orders/lookup?orderNo=' + encodeURIComponent(orderNo));
    closeOrderLookup();
    saveRecentOrder(result.order.orderNo, result.order.tableNumber);
    showOrderDetail(result.order);
  } catch (e) {
    errEl.textContent = e.message || '查询失败';
    errEl.style.display = 'block';
  }
}

// ============ 订单详情 ============
const STATUS_MAP = {
  'pending':    { label: '待确认',   icon: '🕐', color: '#f59e0b', bg: '#fffbeb' },
  'confirmed':  { label: '制作中',   icon: '👨‍🍳', color: '#3b82f6', bg: '#eff6ff' },
  'cooking':    { label: '制作中',   icon: '👨‍🍳', color: '#3b82f6', bg: '#eff6ff' },
  'completed':  { label: '已完成',   icon: '✅', color: '#10b981', bg: '#ecfdf5' },
  'cancelled':  { label: '已取消',   icon: '❌', color: '#6b7280', bg: '#f3f4f6' }
};

function showOrderDetail(order) {
  const sta = STATUS_MAP[order.status] || STATUS_MAP['pending'];
  const timeStr = formatTime(order.createdAt);

  let html = `
    <div class="order-detail-status" style="background:${sta.bg};color:${sta.color}">
      <span class="order-detail-status-icon">${sta.icon}</span>
      <span class="order-detail-status-label">${sta.label}</span>
    </div>

    <div class="order-detail-meta">
      <div class="order-detail-meta-item">
        <span class="meta-label">订单号</span>
        <span class="meta-value mono">${escapeHtml(order.orderNo)}</span>
      </div>
      ${order.tableNumber ? `
      <div class="order-detail-meta-item">
        <span class="meta-label">桌号</span>
        <span class="meta-value">${escapeHtml(order.tableNumber)}</span>
      </div>` : ''}
      <div class="order-detail-meta-item">
        <span class="meta-label">下单时间</span>
        <span class="meta-value">${timeStr}</span>
      </div>
      ${order.remark ? `
      <div class="order-detail-meta-item">
        <span class="meta-label">备注</span>
        <span class="meta-value">${escapeHtml(order.remark)}</span>
      </div>` : ''}
    </div>

    <div class="order-detail-divider"></div>

    <div class="order-detail-items">
      <div class="order-detail-items-title">菜品明细</div>
      ${order.items.map(item => `
        <div class="order-detail-item">
          ${item.image ? `<img class="order-detail-item-img" src="${item.image}" onerror="this.style.display='none'">` : ''}
          <div class="order-detail-item-info">
            <div class="order-detail-item-name">${escapeHtml(item.name)}</div>
            <div class="order-detail-item-price">¥${item.price.toFixed(2)} × ${item.quantity}</div>
          </div>
          <div class="order-detail-item-subtotal">¥${(item.price * item.quantity).toFixed(2)}</div>
        </div>
      `).join('')}
    </div>

    ${(order.tableFee > 0 || order.serviceFee > 0) ? `
    <div class="order-detail-fees">
      ${order.tableFee > 0 ? `<div class="fee-row"><span>餐位费</span><span>¥${order.tableFee.toFixed(2)}</span></div>` : ''}
      ${order.serviceFee > 0 ? `<div class="fee-row"><span>服务费</span><span>¥${order.serviceFee.toFixed(2)}</span></div>` : ''}
    </div>` : ''}

    <div class="order-detail-total">
      <span>合计</span>
      <span class="order-detail-total-price">¥${order.total.toFixed(2)}</span>
    </div>
  `;

  document.getElementById('orderDetailBody').innerHTML = html;
  document.getElementById('orderDetailMask').style.display = 'block';
  document.getElementById('orderDetailModal').style.display = 'flex';
}

function closeOrderDetail() {
  document.getElementById('orderDetailMask').style.display = 'none';
  document.getElementById('orderDetailModal').style.display = 'none';
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============ 工具函数 ============
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ 启动 ============
init();
